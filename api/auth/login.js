const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { query } = require('../middleware/db');
const { handleError, handleCors, JWT_SECRET } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ erro: 'Email e senha obrigatórios' });
    const r = await query('SELECT * FROM usuarios WHERE email=$1 AND ativo=TRUE', [email.toLowerCase().trim()]);
    if (!r.rows.length) return res.status(401).json({ erro: 'Credenciais inválidas' });
    const u = r.rows[0];
    if (!await bcrypt.compare(password, u.senha)) return res.status(401).json({ erro: 'Credenciais inválidas' });
    const papel = u.papel || (u.is_master ? 'MASTER' : 'PADRAO');
    const token = jwt.sign({ id: u.id, nome: u.nome, email: u.email, is_master: u.is_master, papel }, JWT_SECRET, { expiresIn: '8h' });
    res.setHeader('Set-Cookie', cookie.serialize('token', token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: 60*60*8, path: '/'
    }));
    return res.status(200).json({ ok: true, usuario: { id: u.id, nome: u.nome, email: u.email, is_master: u.is_master, papel } });
  } catch(err) { return handleError(res, err); }
};
