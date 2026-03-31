const bcrypt = require('bcryptjs');
const { query } = require('../middleware/db');
const { verificarToken, exigirMaster, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const usuario = verificarToken(req);
    exigirMaster(usuario);
    const { id } = req.query;

    if (req.method === 'PATCH') {
      const { nome, email, senha, papel, ativo } = req.body;
      const campos = [], valores = []; let idx = 1;
      if (nome) { campos.push(`nome=$${idx++}`); valores.push(nome.trim()); }
      if (email) { campos.push(`email=$${idx++}`); valores.push(email.toLowerCase().trim()); }
      if (senha) {
        if (senha.length < 6) return res.status(400).json({ erro: 'Senha mínimo 6 caracteres' });
        campos.push(`senha=$${idx++}`); valores.push(await bcrypt.hash(senha, 10));
      }
      if (papel) {
        const papeis = ['MASTER','SUPERVISOR','PADRAO'];
        if (!papeis.includes(papel)) return res.status(400).json({ erro: 'Papel inválido' });
        campos.push(`papel=$${idx++}`); valores.push(papel);
        campos.push(`is_master=$${idx++}`); valores.push(papel === 'MASTER');
      }
      if (ativo !== undefined) { campos.push(`ativo=$${idx++}`); valores.push(Boolean(ativo)); }
      if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar' });
      valores.push(id);
      const r = await query(`UPDATE usuarios SET ${campos.join(',')} WHERE id=$${idx} RETURNING id,nome,email,is_master,papel,ativo`, valores);
      if (!r.rows.length) return res.status(404).json({ erro: 'Usuário não encontrado' });
      return res.status(200).json(r.rows[0]);
    }

    if (req.method === 'DELETE') {
      await query('UPDATE usuarios SET ativo=FALSE WHERE id=$1', [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch(err) { return handleError(res, err); }
};
