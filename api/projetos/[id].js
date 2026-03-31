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

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const usuario = verificarToken(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const pr = await query(`SELECT p.*,g.nome AS gestor_nome,a.nome AS analista_nome FROM projetos p LEFT JOIN usuarios g ON p.gestor_id=g.id LEFT JOIN usuarios a ON p.analista_id=a.id WHERE p.id=$1`, [id]);
    if (!pr.rows.length) return res.status(404).json({ erro: 'Projeto não encontrado' });
    const projeto = pr.rows[0];

    const papel = usuario.papel || (usuario.is_master ? 'MASTER' : 'PADRAO');
    const isMaster = papel === 'MASTER' || papel === 'SUPERVISOR';
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
        data_pausa, motivo_pausa, data_retomada,
        novo_prazo, principais_apontamentos,
        data_saida_diretoria, observacoes_gerencia
      } = req.body;

      // Tramitar — apenas gestor/master decide o destino
      let novoStatus = status;
      if (acao === 'tramitar' && destino) {
        novoStatus = destino;
        // Se for para gerência (FINALIZADO), registra no histórico com nota
        if (destino === 'FINALIZADO') {
          await query(
            `INSERT INTO historico_atendimento (projeto_id,usuario_id,tipo,texto) VALUES ($1,$2,'tramitacao',$3)`,
            [id, usuario.id, `Projeto encaminhado para a gerência por ${usuario.nome}`]
          );
        }
      }

      // Registra tramitação se status mudou
      if (novoStatus && novoStatus !== projeto.status) {
        await query(
          `INSERT INTO historico_tramitacao (projeto_id,usuario_id,status_anterior,status_novo) VALUES ($1,$2,$3,$4)`,
          [id, usuario.id, projeto.status, novoStatus]
        );
        // Registra no histórico de atendimento também
        await query(
          `INSERT INTO historico_atendimento (projeto_id,usuario_id,tipo,texto) VALUES ($1,$2,'tramitacao',$3)`,
          [id, usuario.id, `Status alterado: ${projeto.status} → ${novoStatus}`]
        );
      }

      // Calcular data_prevista automaticamente se data_distribuicao for fornecida
      let dataPrevista = null;
      if (data_distribuicao) {
        const prazo = parseInt(prazo_dias || projeto.prazo_dias || 7);
        let count = 0, cur = new Date(data_distribuicao);
        while (count < prazo) {
          cur.setDate(cur.getDate() + 1);
          const d = cur.getDay();
          if (d !== 0 && d !== 6) count++;
        }
        dataPrevista = cur.toISOString().split('T')[0];
      }

      // Permissões por campo
      // MASTER/SUPERVISOR: edita tudo
      // Analista/Gestor: só pausa, motivo, retomada, apontamentos, obs
      const campos = [], valores = [];
      let idx = 1;
      const add = (campo, val) => {
        if (val !== undefined) { campos.push(`${campo}=$${idx++}`); valores.push(val===''?null:val); }
      };

      if (novoStatus) add('status', novoStatus);

      if (isMaster) {
        // Master edita tudo
        add('osc_nome', osc_nome);
        add('tipo_demanda', tipo_demanda);
        add('gestor_id', gestor_id);
        add('analista_id', analista_id);
        add('data_distribuicao', data_distribuicao);
        add('prazo_dias', prazo_dias ? parseInt(prazo_dias) : undefined);
        if (dataPrevista) add('data_prevista', dataPrevista);
        add('data_saida_diretoria', data_saida_diretoria);
        add('observacoes_gerencia', observacoes_gerencia);
        add('novo_prazo', novo_prazo);
      }

      // Analista/gestor edita estes campos
      add('data_pausa', data_pausa);
      add('motivo_pausa', motivo_pausa);
      add('data_retomada', data_retomada);
      add('principais_apontamentos', principais_apontamentos);

      // Recalcula novo_prazo após pausa
      if (data_retomada && projeto.data_distribuicao && projeto.data_pausa) {
        const diasUsados = calcularDiasUteis(projeto.data_distribuicao, projeto.data_pausa);
        const diasRestantes = Math.max(0, (parseInt(prazo_dias||projeto.prazo_dias||7)) - diasUsados);
        let count = 0, cur = new Date(data_retomada);
        while (count < diasRestantes) {
          cur.setDate(cur.getDate()+1);
          if (cur.getDay()!==0 && cur.getDay()!==6) count++;
        }
        add('novo_prazo', cur.toISOString().split('T')[0]);
      }

      campos.push('atualizado_em=NOW()');
      if (campos.length === 1) return res.status(400).json({ erro: 'Nenhum campo para atualizar' });

      valores.push(id);
      const r = await query(`UPDATE projetos SET ${campos.join(',')} WHERE id=$${idx} RETURNING *`, valores);
      const atualizado = r.rows[0];

      // Busca nomes
      const nr = await query(`SELECT p.*,g.nome AS gestor_nome,a.nome AS analista_nome FROM projetos p LEFT JOIN usuarios g ON p.gestor_id=g.id LEFT JOIN usuarios a ON p.analista_id=a.id WHERE p.id=$1`, [id]);
      return res.status(200).json({ ...nr.rows[0], semaforo: calcularSemaforo(nr.rows[0]) });
    }

    if (req.method === 'DELETE') {
      if (usuario.papel !== 'MASTER') return res.status(403).json({ erro: 'Apenas MASTER pode excluir' });
      await query('DELETE FROM projetos WHERE id=$1', [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch(err) { return handleError(res, err); }
};

function calcularDiasUteis(inicio, fim) {
  let count = 0, cur = new Date(inicio), end = new Date(fim);
  while (cur < end) { cur.setDate(cur.getDate()+1); if(cur.getDay()!==0&&cur.getDay()!==6) count++; }
  return count;
}
