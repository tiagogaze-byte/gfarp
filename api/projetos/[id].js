const { query } = require('../middleware/db');
const { verificarToken, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const usuario = verificarToken(req);
    const { id } = req.query;

    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    // Busca o projeto
    const projResult = await query(`
      SELECT p.*, g.nome AS gestor_nome, a.nome AS analista_nome
      FROM projetos p
      LEFT JOIN usuarios g ON p.gestor_id = g.id
      LEFT JOIN usuarios a ON p.analista_id = a.id
      WHERE p.id = $1
    `, [id]);

    if (projResult.rows.length === 0) {
      return res.status(404).json({ erro: 'Projeto não encontrado' });
    }

    const projeto = projResult.rows[0];

    // Controle de acesso para usuário padrão
    if (!usuario.is_master &&
        projeto.gestor_id !== usuario.id &&
        projeto.analista_id !== usuario.id) {
      return res.status(403).json({ erro: 'Sem permissão para acessar este projeto' });
    }

    // ── GET /api/projetos/[id] ─────────────────────────────────
    if (req.method === 'GET') {
      return res.status(200).json(projeto);
    }

    // ── PATCH /api/projetos/[id] ───────────────────────────────
    if (req.method === 'PATCH') {
      const {
        status, data_distribuicao, prazo_dias,
        data_pausa, motivo_pausa, data_retomada, novo_prazo,
        principais_apontamentos, data_saida_diretoria,
        observacoes_gerencia, gestor_id, analista_id,
        acao // 'tramitar' vindo do frontend do Stitch
      } = req.body;

      // Se for ação de tramitar, avança o status automaticamente
      let novoStatus = status;
      if (acao === 'tramitar' && !status) {
        const fluxo = { 'EM_ANALISE': 'GFCAP', 'GFCAP': 'OSC', 'OSC': 'FINALIZADO' };
        novoStatus = fluxo[projeto.status] || projeto.status;
      }

      // Registra tramitação se status mudou
      if (novoStatus && novoStatus !== projeto.status) {
        await query(`
          INSERT INTO historico_tramitacao (projeto_id, usuario_id, status_anterior, status_novo)
          VALUES ($1, $2, $3, $4)
        `, [id, usuario.id, projeto.status, novoStatus]);
      }

      // Monta update dinâmico
      const campos = [];
      const valores = [];
      let idx = 1;

      const adicionar = (campo, valor) => {
        if (valor !== undefined) {
          campos.push(`${campo} = $${idx++}`);
          valores.push(valor === '' ? null : valor);
        }
      };

      adicionar('status', novoStatus);
      adicionar('data_distribuicao', data_distribuicao);
      adicionar('prazo_dias', prazo_dias);
      adicionar('data_pausa', data_pausa);
      adicionar('motivo_pausa', motivo_pausa);
      adicionar('data_retomada', data_retomada);
      adicionar('novo_prazo', novo_prazo);
      adicionar('principais_apontamentos', principais_apontamentos);
      adicionar('data_saida_diretoria', data_saida_diretoria);
      adicionar('observacoes_gerencia', observacoes_gerencia);
      adicionar('gestor_id', gestor_id);
      adicionar('analista_id', analista_id);
      campos.push(`atualizado_em = NOW()`);

      if (campos.length === 1) {
        return res.status(400).json({ erro: 'Nenhum campo para atualizar' });
      }

      valores.push(id);
      const result = await query(`
        UPDATE projetos SET ${campos.join(', ')}
        WHERE id = $${idx}
        RETURNING *
      `, valores);

      return res.status(200).json(result.rows[0]);
    }

    // ── DELETE /api/projetos/[id] ──────────────────────────────
    if (req.method === 'DELETE') {
      if (!usuario.is_master) {
        return res.status(403).json({ erro: 'Apenas administradores podem excluir projetos' });
      }
      await query('DELETE FROM projetos WHERE id = $1', [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido' });

  } catch (err) {
    return handleError(res, err);
  }
};
