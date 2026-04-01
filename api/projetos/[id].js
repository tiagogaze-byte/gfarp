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

function calcularDiasUteis(inicio, fim) {
  let count = 0, cur = new Date(inicio), end = new Date(fim);
  while (cur < end) { cur.setDate(cur.getDate()+1); if(cur.getDay()!==0&&cur.getDay()!==6) count++; }
  return count;
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

    const isResponsavel = projeto.gestor_id === usuario.id || projeto.analista_id === usuario.id;
    if (!isMaster && !isResponsavel) return res.status(403).json({ erro: 'Sem permissão' });

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

      // Tramitar
      let novoStatus = status;
      if (acao === 'tramitar' && destino) novoStatus = destino;

      // Log de alterações
      const alteracoes = [];
      if (novoStatus && novoStatus !== projeto.status) alteracoes.push(`Status: ${projeto.status} → ${novoStatus}`);
      if (osc_nome && osc_nome !== projeto.osc_nome) alteracoes.push(`OSC: "${projeto.osc_nome}" → "${osc_nome}"`);
      if (tipo_demanda && tipo_demanda !== projeto.tipo_demanda) alteracoes.push(`Tipo: ${projeto.tipo_demanda} → ${tipo_demanda}`);
      if (data_distribuicao && data_distribuicao !== projeto.data_distribuicao?.split('T')[0]) alteracoes.push(`Distribuição: ${projeto.data_distribuicao||'—'} → ${data_distribuicao}`);
      if (ij !== undefined && ij !== projeto.ij) alteracoes.push(`IJ: ${projeto.ij||'—'} → ${ij}`);

      // Registra tramitação
      if (novoStatus && novoStatus !== projeto.status) {
        await query(
          `INSERT INTO historico_tramitacao (projeto_id,usuario_id,status_anterior,status_novo) VALUES ($1,$2,$3,$4)`,
          [id, usuario.id, projeto.status, novoStatus]
        );
        await query(
          `INSERT INTO historico_atendimento (projeto_id,usuario_id,tipo,texto) VALUES ($1,$2,'tramitacao',$3)`,
          [id, usuario.id, `Tramitado: ${projeto.status} → ${novoStatus} por ${usuario.nome}`]
        );
      }

      // Registra log de alterações
      if (alteracoes.length > 0) {
        await query(
          `INSERT INTO historico_atendimento (projeto_id,usuario_id,tipo,texto) VALUES ($1,$2,'observacao',$3)`,
          [id, usuario.id, `Alterações realizadas: ${alteracoes.join(' | ')}`]
        );
      }

      // Calcula data_prevista se data_distribuicao fornecida
      let dataPrevista = undefined;
      if (data_distribuicao) {
        const p = parseInt(prazo_dias || projeto.prazo_dias || 7);
        let count = 0, cur = new Date(data_distribuicao);
        while (count < p) { cur.setDate(cur.getDate()+1); const d=cur.getDay(); if(d!==0&&d!==6) count++; }
        dataPrevista = cur.toISOString().split('T')[0];
      }

      // Recalcula novo_prazo após retomada de pausa
      let novoPrazoCalc = novo_prazo;
      if (data_retomada && projeto.data_pausa && !novo_prazo) {
        const diasUsados = calcularDiasUteis(projeto.data_distribuicao||projeto.data_recebimento, projeto.data_pausa);
        const diasRestantes = Math.max(0, (parseInt(prazo_dias||projeto.prazo_dias||7)) - diasUsados);
        let count = 0, cur = new Date(data_retomada);
        while (count < diasRestantes) { cur.setDate(cur.getDate()+1); if(cur.getDay()!==0&&cur.getDay()!==6) count++; }
        novoPrazoCalc = cur.toISOString().split('T')[0];
      }

      // Monta update dinâmico
      const campos = [], valores = []; let idx = 1;
      const add = (campo, val) => { if (val !== undefined) { campos.push(`${campo}=$${idx++}`); valores.push(val===''?null:val); } };

      add('status', novoStatus);
      // Campos que analista/gestor podem editar
      add('data_pausa', data_pausa);
      add('motivo_pausa', motivo_pausa);
      add('data_retomada', data_retomada);
      add('principals_apontamentos', principais_apontamentos);
      add('principais_apontamentos', principais_apontamentos);

      if (isMaster) {
        add('osc_nome', osc_nome);
        add('tipo_demanda', tipo_demanda);
        add('gestor_id', gestor_id);
        add('analista_id', analista_id);
        add('data_distribuicao', data_distribuicao);
        add('prazo_dias', prazo_dias ? parseInt(prazo_dias) : undefined);
        if (dataPrevista) add('data_prevista', dataPrevista);
        add('data_saida_diretoria', data_saida_diretoria);
        add('observacoes_gerencia', observacoes_gerencia);
        add('novo_prazo', novoPrazoCalc);
        // IJ só master, verifica se coluna existe
        if (ij !== undefined) {
          try { add('ij', ij); } catch(e) { /* coluna ainda não existe */ }
        }
      }

      campos.push('atualizado_em=NOW()');
      // Remove duplicatas de campo
      const camposUniq = [...new Set(campos)];
      if (camposUniq.length <= 1) return res.status(400).json({ erro: 'Nenhum campo para atualizar' });

      valores.push(id);
      await query(`UPDATE projetos SET ${camposUniq.join(',')} WHERE id=$${idx}`, valores);

      const nr = await query(
        `SELECT p.*,g.nome AS gestor_nome,a.nome AS analista_nome
         FROM projetos p LEFT JOIN usuarios g ON p.gestor_id=g.id LEFT JOIN usuarios a ON p.analista_id=a.id
         WHERE p.id=$1`, [id]);
      return res.status(200).json({ ...nr.rows[0], semaforo: calcularSemaforo(nr.rows[0]) });
    }

    if (req.method === 'DELETE') {
      const papel = usuario.papel || (usuario.is_master ? 'MASTER' : 'PADRAO');
      if (papel !== 'MASTER') return res.status(403).json({ erro: 'Apenas MASTER pode excluir' });
      await query('DELETE FROM projetos WHERE id=$1', [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch(err) { return handleError(res, err); }
};
