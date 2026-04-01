const { query } = require('../middleware/db');
const { verificarToken, handleError, handleCors } = require('../middleware/auth');

function calcularSemaforo(p) {
  if (p.data_saida_diretoria) return { cor: 'FINALIZADO', dias: 0 };
  const ref = p.novo_prazo || p.data_prevista;
  if (!ref) return { cor: 'AGUARDANDO', dias: null };
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const prazo = new Date(ref); prazo.setHours(0,0,0,0);
  let dias = 0, cur = new Date(hoje);
  if (prazo >= hoje) {
    while (cur < prazo) { cur.setDate(cur.getDate()+1); const d=cur.getDay(); if(d!==0&&d!==6) dias++; }
  } else {
    while (cur > prazo) { cur.setDate(cur.getDate()-1); const d=cur.getDay(); if(d!==0&&d!==6) dias--; }
  }
  return { cor: dias>=5?'VERDE':dias>=2?'AMARELO':dias===1?'VERMELHO':'VENCIDO', dias };
}

// Converte Date ou string para YYYY-MM-DD com segurança
function toDateStr(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).split('T')[0];
}

function calcDiasUteis(inicio, fim) {
  let c=0, cur=new Date(inicio), end=new Date(fim);
  while(cur<end){cur.setDate(cur.getDate()+1);if(cur.getDay()!==0&&cur.getDay()!==6)c++;}
  return c;
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const usuario = verificarToken(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const papel = usuario.papel || (usuario.is_master ? 'MASTER' : 'PADRAO');
    const isMaster = papel === 'MASTER' || papel === 'SUPERVISOR';

    const pr = await query(
      `SELECT p.*,g.nome AS gestor_nome,a.nome AS analista_nome
       FROM projetos p LEFT JOIN usuarios g ON p.gestor_id=g.id LEFT JOIN usuarios a ON p.analista_id=a.id
       WHERE p.id=$1`, [id]);
    if (!pr.rows.length) return res.status(404).json({ erro: 'Projeto não encontrado' });
    const projeto = pr.rows[0];

    const isResp = projeto.gestor_id === usuario.id || projeto.analista_id === usuario.id;
    if (!isMaster && !isResp) return res.status(403).json({ erro: 'Sem permissão' });

    if (req.method === 'GET') {
      return res.status(200).json({ ...projeto, semaforo: calcularSemaforo(projeto) });
    }

    if (req.method === 'PATCH') {
      const {
        status, acao, destino,
        osc_nome, tipo_demanda, gestor_id, analista_id,
        data_distribuicao, prazo_dias,
        data_pausa, motivo_pausa, data_retomada, novo_prazo,
        principais_apontamentos, data_saida_diretoria,
        observacoes_gerencia, ij
      } = req.body;

      let novoStatus = status;
      if (acao === 'tramitar' && destino) novoStatus = destino;

      // Log alterações
      const alts = [];
      if (novoStatus && novoStatus !== projeto.status) alts.push(`Status: ${projeto.status} → ${novoStatus}`);
      if (osc_nome && osc_nome !== projeto.osc_nome) alts.push(`OSC: "${projeto.osc_nome}" → "${osc_nome}"`);
      if (tipo_demanda && tipo_demanda !== projeto.tipo_demanda) alts.push(`Tipo: ${projeto.tipo_demanda} → ${tipo_demanda}`);
      if (ij !== undefined && ij !== projeto.ij) alts.push(`IJ: ${projeto.ij||'—'} → ${ij}`);

      // Registra tramitação
      if (novoStatus && novoStatus !== projeto.status) {
        await query(`INSERT INTO historico_tramitacao (projeto_id,usuario_id,status_anterior,status_novo) VALUES ($1,$2,$3,$4)`,
          [id, usuario.id, projeto.status, novoStatus]);
        await query(`INSERT INTO historico_atendimento (projeto_id,usuario_id,tipo,texto) VALUES ($1,$2,'tramitacao',$3)`,
          [id, usuario.id, `Tramitado: ${projeto.status} → ${novoStatus} por ${usuario.nome}`]);
      }

      // Registra log
      if (alts.length > 0) {
        await query(`INSERT INTO historico_atendimento (projeto_id,usuario_id,tipo,texto) VALUES ($1,$2,'comentario',$3)`,
          [id, usuario.id, `[LOG] Alterações: ${alts.join(' | ')}`]);
      }

      // Calcula data_prevista
      let dataPrevista = undefined;
      const distrib = data_distribuicao || toDateStr(projeto.data_distribuicao);
      if (data_distribuicao && distrib) {
        const p = parseInt(prazo_dias || projeto.prazo_dias || 7);
        let count = 0, cur = new Date(distrib);
        while (count < p) { cur.setDate(cur.getDate()+1); if(cur.getDay()!==0&&cur.getDay()!==6) count++; }
        dataPrevista = cur.toISOString().split('T')[0];
      }

      // Calcula novo_prazo após retomada
      let novoPrazoCalc = novo_prazo;
      if (data_retomada && !novo_prazo && projeto.data_pausa) {
        const base = toDateStr(projeto.data_distribuicao) || toDateStr(projeto.data_recebimento);
        const pausaStr = toDateStr(projeto.data_pausa);
        if (base && pausaStr) {
          const diasUsados = calcDiasUteis(base, pausaStr);
          const diasRestantes = Math.max(0, (parseInt(prazo_dias||projeto.prazo_dias||7)) - diasUsados);
          let count = 0, cur = new Date(data_retomada);
          while (count < diasRestantes) { cur.setDate(cur.getDate()+1); if(cur.getDay()!==0&&cur.getDay()!==6) count++; }
          novoPrazoCalc = cur.toISOString().split('T')[0];
        }
      }

      const campos = [], valores = []; let idx = 1;
      const add = (campo, val) => {
        if (val !== undefined && val !== null && val !== '') { campos.push(`${campo}=$${idx++}`); valores.push(val); }
        else if (val === '') { campos.push(`${campo}=$${idx++}`); valores.push(null); }
      };

      add('status', novoStatus);
      add('data_pausa', data_pausa);
      add('motivo_pausa', motivo_pausa);
      add('data_retomada', data_retomada);
      add('principais_apontamentos', principais_apontamentos);

      if (isMaster) {
        add('osc_nome', osc_nome);
        add('tipo_demanda', tipo_demanda);
        add('gestor_id', gestor_id || null);
        add('analista_id', analista_id || null);
        add('data_distribuicao', data_distribuicao);
        if (prazo_dias) { campos.push(`prazo_dias=$${idx++}`); valores.push(parseInt(prazo_dias)); }
        if (dataPrevista) add('data_prevista', dataPrevista);
        add('data_saida_diretoria', data_saida_diretoria);
        add('observacoes_gerencia', observacoes_gerencia);
        add('novo_prazo', novoPrazoCalc);
        if (ij !== undefined) add('ij', ij);
      }

      campos.push('atualizado_em=NOW()');
      if (campos.length <= 1) return res.status(400).json({ erro: 'Nenhum campo para atualizar' });

      valores.push(id);
      await query(`UPDATE projetos SET ${campos.join(',')} WHERE id=$${idx}`, valores);

      const nr = await query(
        `SELECT p.*,g.nome AS gestor_nome,a.nome AS analista_nome
         FROM projetos p LEFT JOIN usuarios g ON p.gestor_id=g.id LEFT JOIN usuarios a ON p.analista_id=a.id
         WHERE p.id=$1`, [id]);
      return res.status(200).json({ ...nr.rows[0], semaforo: calcularSemaforo(nr.rows[0]) });
    }

    if (req.method === 'DELETE') {
      if (papel !== 'MASTER') return res.status(403).json({ erro: 'Apenas MASTER pode excluir' });
      await query('DELETE FROM projetos WHERE id=$1', [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch(err) { return handleError(res, err); }
};
