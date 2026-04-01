const bcrypt = require('bcryptjs');
const { query } = require('../middleware/db');
const { verificarToken, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const usuario = verificarToken(req);
    const papel = usuario.papel || (usuario.is_master ? 'MASTER' : 'PADRAO');
    if (papel !== 'MASTER') return res.status(403).json({ erro: 'Acesso restrito a administradores' });
    const { id } = req.query;

    if (req.method === 'PATCH') {
      const { nome, email, senha, papel: novoPapel, ativo } = req.body;
      const campos = [], valores = []; let idx = 1;
      if (nome) { campos.push(`nome=$${idx++}`); valores.push(nome.trim()); }
      if (email) { campos.push(`email=$${idx++}`); valores.push(email.toLowerCase().trim()); }
      if (senha && senha.length >= 6) { campos.push(`senha=$${idx++}`); valores.push(await bcrypt.hash(senha, 10)); }
      if (novoPapel && ['MASTER','SUPERVISOR','PADRAO'].includes(novoPapel)) {
        campos.push(`papel=$${idx++}`); valores.push(novoPapel);
        campos.push(`is_master=$${idx++}`); valores.push(novoPapel === 'MASTER');
      }
      if (ativo !== undefined) { campos.push(`ativo=$${idx++}`); valores.push(Boolean(ativo)); }
      if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar' });
      valores.push(id);
      const r = await query(
        `UPDATE usuarios SET ${campos.join(',')} WHERE id=$${idx}
         RETURNING id,nome,email,is_master,COALESCE(papel,'PADRAO') AS papel,ativo`, valores);
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
