const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const JWT_SECRET = process.env.JWT_SECRET || 'troque-esta-chave-no-vercel';

/**
 * Verifica o token JWT e retorna o payload do usuário.
 * Lança erro se inválido ou ausente.
 */
function verificarToken(req) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.token;

  if (!token) {
    const err = new Error('Não autenticado');
    err.status = 401;
    throw err;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    const err = new Error('Token inválido ou expirado');
    err.status = 401;
    throw err;
  }
}

/**
 * Verifica se o usuário é MASTER.
 * Lança erro 403 se não for.
 */
function exigirMaster(usuario) {
  if (!usuario.is_master) {
    const err = new Error('Acesso restrito a administradores');
    err.status = 403;
    throw err;
  }
}

/**
 * Trata erros de forma padronizada.
 */
function handleError(res, err) {
  const status = err.status || 500;
  const message = err.message || 'Erro interno do servidor';
  return res.status(status).json({ erro: message });
}

/**
 * Trata requisições OPTIONS (CORS preflight).
 */
function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

module.exports = { verificarToken, exigirMaster, handleError, handleCors, JWT_SECRET };
