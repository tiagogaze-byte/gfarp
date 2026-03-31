const bcrypt = require('bcryptjs');
const { query } = require('../middleware/db');
const { verificarToken, exigirMaster, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const usuario = verificarToken(req);
    exigirMaster(usuario);

    if (req.method === 'GET') {
      const r = await query(`
        SELECT u.id,u.nome,u.email,u.is_master,u.papel,u.ativo,u.criado_em,
          (SELECT COUNT(*) FROM projetos WHERE analista_id=u.id AND status='EM_ANALISE') AS projetos_ativos_analista,
          (SELECT COUNT(*) FROM projetos WHERE gestor_id=u.id AND status='EM_ANALISE') AS projetos_ativos_gestor
        FROM usuarios u WHERE u.ativo=TRUE ORDER BY u.nome`);
      return res.status(200).json(r.rows);
    }

    if (req.method === 'POST') {
      const { nome, email, senha, papel = 'PADRAO' } = req.body;
      if (!nome || !email || !senha) return res.status(400).json({ erro: 'Nome, email e senha obrigatórios' });
      if (senha.length < 6) return res.status(400).json({ erro: 'Senha mínimo 6 caracteres' });
      const papeis = ['MASTER','SUPERVISOR','PADRAO'];
      if (!papeis.includes(papel)) return res.status(400).json({ erro: 'Papel inválido' });
      const hash = await bcrypt.hash(senha, 10);
      const is_master = papel === 'MASTER';
      const r = await query(
        `INSERT INTO usuarios (nome,email,senha,is_master,papel) VALUES ($1,$2,$3,$4,$5) RETURNING id,nome,email,is_master,papel`,
        [nome.trim(), email.toLowerCase().trim(), hash, is_master, papel]
      );
      return res.status(201).json(r.rows[0]);
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch(err) { return handleError(res, err); }
};
