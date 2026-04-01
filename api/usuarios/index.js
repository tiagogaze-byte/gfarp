const bcrypt = require('bcryptjs');
const { query } = require('../middleware/db');
const { verificarToken, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const usuario = verificarToken(req);
    const papel = usuario.papel || (usuario.is_master ? 'MASTER' : 'PADRAO');
    if (papel !== 'MASTER') return res.status(403).json({ erro: 'Acesso restrito a administradores' });

    if (req.method === 'GET') {
      const r = await query(`
        SELECT u.id, u.nome, u.email, u.is_master,
          COALESCE(u.papel, CASE WHEN u.is_master THEN 'MASTER' ELSE 'PADRAO' END) AS papel,
          u.ativo, u.criado_em,
          (SELECT COUNT(*) FROM projetos WHERE analista_id=u.id AND status NOT IN ('FINALIZADO')) AS projetos_ativos_analista,
          (SELECT COUNT(*) FROM projetos WHERE gestor_id=u.id AND status NOT IN ('FINALIZADO')) AS projetos_ativos_gestor
        FROM usuarios u WHERE u.ativo=TRUE ORDER BY u.nome`);
      return res.status(200).json(r.rows);
    }

    if (req.method === 'POST') {
      const { nome, email, senha, papel: novoPapel = 'PADRAO' } = req.body;
      if (!nome || !email || !senha) return res.status(400).json({ erro: 'Nome, email e senha obrigatórios' });
      if (senha.length < 6) return res.status(400).json({ erro: 'Senha mínimo 6 caracteres' });
      const papeis = ['MASTER','SUPERVISOR','PADRAO'];
      if (!papeis.includes(novoPapel)) return res.status(400).json({ erro: 'Papel inválido' });
      const hash = await bcrypt.hash(senha, 10);
      const is_master = novoPapel === 'MASTER';
      const r = await query(
        `INSERT INTO usuarios (nome,email,senha,is_master,papel) VALUES ($1,$2,$3,$4,$5)
         RETURNING id,nome,email,is_master,COALESCE(papel,'PADRAO') AS papel`,
        [nome.trim(), email.toLowerCase().trim(), hash, is_master, novoPapel]
      );
      return res.status(201).json(r.rows[0]);
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch(err) { return handleError(res, err); }
};
