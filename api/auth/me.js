const cookie = require('cookie');
const { verificarToken, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method === 'DELETE' || req.method === 'POST') {
    res.setHeader('Set-Cookie', cookie.serialize('token', '', { httpOnly: true, secure: process.env.NODE_ENV==='production', sameSite:'lax', maxAge:0, path:'/' }));
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'GET') {
    try { return res.status(200).json({ usuario: verificarToken(req) }); }
    catch(err) { return handleError(res, err); }
  }
  return res.status(405).json({ erro: 'Método não permitido' });
};
