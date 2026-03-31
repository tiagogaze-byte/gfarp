const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const JWT_SECRET = process.env.JWT_SECRET || 'troque-esta-chave-no-vercel';

function verificarToken(req) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.token;
  if (!token) { const e = new Error('Não autenticado'); e.status = 401; throw e; }
  try { return jwt.verify(token, JWT_SECRET); }
  catch { const e = new Error('Token inválido'); e.status = 401; throw e; }
}

function exigirMaster(usuario) {
  if (usuario.papel !== 'MASTER') { const e = new Error('Acesso restrito a administradores'); e.status = 403; throw e; }
}

function podeVerRelatorios(usuario) {
  return usuario.papel === 'MASTER' || usuario.papel === 'SUPERVISOR';
}

function handleError(res, err) {
  return res.status(err.status || 500).json({ erro: err.message || 'Erro interno' });
}

function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}

module.exports = { verificarToken, exigirMaster, podeVerRelatorios, handleError, handleCors, JWT_SECRET };
