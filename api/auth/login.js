const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { query } = require('../middleware/db');
const { handleError, handleCors, JWT_SECRET } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
    }

    // Busca usuário
    const result = await query(
      'SELECT * FROM usuarios WHERE email = $1 AND ativo = TRUE',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const usuario = result.rows[0];

    // Verifica senha
    const senhaValida = await bcrypt.compare(password, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    // Gera token JWT (expira em 8h)
    const token = jwt.sign(
      {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        is_master: usuario.is_master
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Define cookie httpOnly
    res.setHeader('Set-Cookie', cookie.serialize('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8, // 8 horas
      path: '/'
    }));

    return res.status(200).json({
      ok: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        is_master: usuario.is_master
      }
    });

  } catch (err) {
    return handleError(res, err);
  }
};
