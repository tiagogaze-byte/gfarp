const { query } = require('../middleware/db');
const { verificarToken, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const usuario = verificarToken(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const pr = await query('SELECT * FROM projetos WHERE id=$1', [id]);
    if (!pr.rows.length) return res.status(404).json({ erro: 'Projeto não encontrado' });
    const projeto = pr.rows[0];

    const papel = usuario.papel || (usuario.is_master ? 'MASTER' : 'PADRAO');
    const isMaster = papel === 'MASTER' || papel === 'SUPERVISOR';
    const isResp = projeto.gestor_id === usuario.id || projeto.analista_id === usuario.id;
    if (!isMaster && !isResp) return res.status(403).json({ erro: 'Sem permissão' });

    if (req.method === 'GET') {
      const r = await query(
        `SELECT h.*,u.nome AS usuario_nome FROM historico_atendimento h
         LEFT JOIN usuarios u ON h.usuario_id=u.id WHERE h.projeto_id=$1 ORDER BY h.criado_em ASC`,
        [id]);
      return res.status(200).json(r.rows);
    }

    if (req.method === 'POST') {
      const { texto, tipo } = req.body;
      if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Texto obrigatório' });

      // Normaliza tipo — aceita qualquer valor, converte para o que o banco aceita
      // O constraint original do schema é: comentario, tramitacao, pausa, retomada, apontamento
      const normalize = {
        'atendimento': 'comentario',
        'observacao':  'comentario',
        'observação':  'comentario',
        'comentario':  'comentario',
        'tramitacao':  'tramitacao',
        'tramitação':  'tramitacao',
        'pausa':       'pausa',
        'retomada':    'retomada',
        'apontamento': 'apontamento',
      };
      const tipoNorm = normalize[tipo] || 'comentario';

      const r = await query(
        `INSERT INTO historico_atendimento (projeto_id,usuario_id,tipo,texto) VALUES ($1,$2,$3,$4) RETURNING *`,
        [id, usuario.id, tipoNorm, texto.trim()]);
      return res.status(201).json({ ...r.rows[0], usuario_nome: usuario.nome, tipo_original: tipo });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch(err) { return handleError(res, err); }
};
