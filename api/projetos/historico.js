const { query } = require('../middleware/db');
const { verificarToken, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const usuario = verificarToken(req);
    const { id } = req.query;

    if (!id) return res.status(400).json({ erro: 'ID do projeto obrigatório' });

    // Verifica acesso ao projeto
    const projResult = await query('SELECT * FROM projetos WHERE id = $1', [id]);
    if (projResult.rows.length === 0) {
      return res.status(404).json({ erro: 'Projeto não encontrado' });
    }

    const projeto = projResult.rows[0];
    if (!usuario.is_master &&
        projeto.gestor_id !== usuario.id &&
        projeto.analista_id !== usuario.id) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }

    // ── GET — lista histórico ──────────────────────────────────
    if (req.method === 'GET') {
      const result = await query(`
        SELECT h.*, u.nome AS usuario_nome
        FROM historico_atendimento h
        LEFT JOIN usuarios u ON h.usuario_id = u.id
        WHERE h.projeto_id = $1
        ORDER BY h.criado_em DESC
      `, [id]);

      return res.status(200).json(result.rows);
    }

    // ── POST — adiciona comentário ─────────────────────────────
    if (req.method === 'POST') {
      const { texto, tipo = 'comentario' } = req.body;

      if (!texto || texto.trim() === '') {
        return res.status(400).json({ erro: 'Texto do comentário é obrigatório' });
      }

      const tiposValidos = ['comentario', 'pausa', 'retomada', 'apontamento'];
      if (!tiposValidos.includes(tipo)) {
        return res.status(400).json({ erro: `Tipo inválido. Use: ${tiposValidos.join(', ')}` });
      }

      const result = await query(`
        INSERT INTO historico_atendimento (projeto_id, usuario_id, tipo, texto)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [id, usuario.id, tipo, texto.trim()]);

      return res.status(201).json(result.rows[0]);
    }

    return res.status(405).json({ erro: 'Método não permitido' });

  } catch (err) {
    return handleError(res, err);
  }
};
