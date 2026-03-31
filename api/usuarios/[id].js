const bcrypt = require('bcryptjs');
const { query } = require('../middleware/db');
const { verificarToken, exigirMaster, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const usuario = verificarToken(req);
    exigirMaster(usuario);
    const { id } = req.query;

    // ── PATCH — atualiza usuário ───────────────────────────────
    if (req.method === 'PATCH') {
      const { nome, email, senha, is_master, ativo } = req.body;

      const campos = [];
      const valores = [];
      let idx = 1;

      if (nome) { campos.push(`nome = $${idx++}`); valores.push(nome.trim()); }
      if (email) { campos.push(`email = $${idx++}`); valores.push(email.toLowerCase().trim()); }
      if (senha) {
        const hash = await bcrypt.hash(senha, 10);
        campos.push(`senha = $${idx++}`);
        valores.push(hash);
      }
      if (is_master !== undefined) { campos.push(`is_master = $${idx++}`); valores.push(Boolean(is_master)); }
      if (ativo !== undefined) { campos.push(`ativo = $${idx++}`); valores.push(Boolean(ativo)); }

      if (campos.length === 0) {
        return res.status(400).json({ erro: 'Nenhum campo para atualizar' });
      }

      valores.push(id);
      const result = await query(`
        UPDATE usuarios SET ${campos.join(', ')}
        WHERE id = $${idx}
        RETURNING id, nome, email, is_master, ativo
      `, valores);

      if (result.rows.length === 0) {
        return res.status(404).json({ erro: 'Usuário não encontrado' });
      }

      return res.status(200).json(result.rows[0]);
    }

    // ── DELETE — desativa usuário (soft delete) ────────────────
    if (req.method === 'DELETE') {
      // Não exclui de verdade — apenas desativa
      await query('UPDATE usuarios SET ativo = FALSE WHERE id = $1', [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido' });

  } catch (err) {
    return handleError(res, err);
  }
};
