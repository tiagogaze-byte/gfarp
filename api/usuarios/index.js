const bcrypt = require('bcryptjs');
const { query } = require('../middleware/db');
const { verificarToken, exigirMaster, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const usuario = verificarToken(req);

    // ── GET — lista usuários (master) ──────────────────────────
    if (req.method === 'GET') {
      exigirMaster(usuario);

      const result = await query(`
        SELECT id, nome, email, is_master, ativo, criado_em,
          (SELECT COUNT(*) FROM projetos WHERE analista_id = u.id AND status = 'EM_ANALISE') AS projetos_ativos_analista,
          (SELECT COUNT(*) FROM projetos WHERE gestor_id = u.id AND status = 'EM_ANALISE')   AS projetos_ativos_gestor
        FROM usuarios u
        WHERE ativo = TRUE
        ORDER BY nome
      `);

      return res.status(200).json(result.rows);
    }

    // ── POST — cria usuário (master) ───────────────────────────
    if (req.method === 'POST') {
      exigirMaster(usuario);

      const { nome, email, senha, is_master = false } = req.body;

      if (!nome || !email || !senha) {
        return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios' });
      }

      if (senha.length < 6) {
        return res.status(400).json({ erro: 'Senha deve ter pelo menos 6 caracteres' });
      }

      const senhaHash = await bcrypt.hash(senha, 10);

      const result = await query(`
        INSERT INTO usuarios (nome, email, senha, is_master)
        VALUES ($1, $2, $3, $4)
        RETURNING id, nome, email, is_master, criado_em
      `, [nome.trim(), email.toLowerCase().trim(), senhaHash, Boolean(is_master)]);

      return res.status(201).json(result.rows[0]);
    }

    return res.status(405).json({ erro: 'Método não permitido' });

  } catch (err) {
    return handleError(res, err);
  }
};
