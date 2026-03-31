const { query } = require('../middleware/db');
const { verificarToken, handleError, handleCors } = require('../middleware/auth');

function diasUteisAFrente(inicio, n) {
  let count = 0, cur = new Date(inicio);
  while (count < n) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
  }
  return cur;
}

function calcularSemaforo(p) {
  if (p.data_saida_diretoria) return { cor: 'FINALIZADO', dias: 0 };
  const ref = p.novo_prazo || p.data_prevista;
  if (!ref) return { cor: 'AGUARDANDO', dias: null };
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const prazo = new Date(ref); prazo.setHours(0,0,0,0);
  let dias = 0, cur = new Date(hoje);
  if (prazo >= hoje) {
    while (cur < prazo) { cur.setDate(cur.getDate()+1); const d=cur.getDay(); if(d!==0&&d!==6) dias++; }
  } else {
    while (cur > prazo) { cur.setDate(cur.getDate()-1); const d=cur.getDay(); if(d!==0&&d!==6) dias--; }
  }
  let cor = dias >= 5 ? 'VERDE' : dias >= 2 ? 'AMARELO' : dias === 1 ? 'VERMELHO' : 'VENCIDO';
  return { cor, dias };
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const usuario = verificarToken(req);

    if (req.method === 'GET') {
      const { status, analista_id, gestor_id, tipo, busca, periodo_inicio, periodo_fim, responsavel } = req.query;
      let where = [], params = [], idx = 1;
      if (!usuario.is_master && usuario.papel !== 'MASTER' && usuario.papel !== 'SUPERVISOR') {
        where.push(`(p.gestor_id=$${idx} OR p.analista_id=$${idx})`);
        params.push(usuario.id); idx++;
      }
      if (status) { where.push(`p.status=$${idx++}`); params.push(status); }
      if (analista_id) { where.push(`p.analista_id=$${idx++}`); params.push(analista_id); }
      if (gestor_id) { where.push(`p.gestor_id=$${idx++}`); params.push(gestor_id); }
      if (tipo) { where.push(`p.tipo_demanda=$${idx++}`); params.push(tipo); }
      if (busca) { where.push(`(p.osc_nome ILIKE $${idx} OR p.codigo ILIKE $${idx})`); params.push('%'+busca+'%'); idx++; }
      if (responsavel) { where.push(`(g.nome ILIKE $${idx} OR a.nome ILIKE $${idx})`); params.push('%'+responsavel+'%'); idx++; }
      if (periodo_inicio) { where.push(`p.data_recebimento>=$${idx++}`); params.push(periodo_inicio); }
      if (periodo_fim) { where.push(`p.data_recebimento<=$${idx++}`); params.push(periodo_fim); }
      const wc = where.length ? 'WHERE '+where.join(' AND ') : '';
      const r = await query(`SELECT p.*,g.nome AS gestor_nome,a.nome AS analista_nome FROM projetos p LEFT JOIN usuarios g ON p.gestor_id=g.id LEFT JOIN usuarios a ON p.analista_id=a.id ${wc} ORDER BY p.criado_em DESC`, params);
      return res.status(200).json(r.rows.map(p => ({ ...p, semaforo: calcularSemaforo(p) })));
    }

    if (req.method === 'POST') {
      const { tipo_demanda, osc_nome, data_recebimento, prazo_dias, gestor_id, analista_id } = req.body;
      if (!tipo_demanda || !osc_nome || !data_recebimento) return res.status(400).json({ erro: 'Campos obrigatórios: tipo_demanda, osc_nome, data_recebimento' });
      const cnt = await query('SELECT COUNT(*) FROM projetos');
      const seq = parseInt(cnt.rows[0].count) + 1;
      const codigo = `GFARP${new Date().getFullYear()}${String(seq).padStart(4,'0')}`;
      const prazo = parseInt(prazo_dias) || 7;
      const r = await query(
        `INSERT INTO projetos (codigo,tipo_demanda,osc_nome,data_recebimento,prazo_dias,gestor_id,analista_id,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'EM_ANALISE') RETURNING *`,
        [codigo, tipo_demanda, osc_nome, data_recebimento, prazo, gestor_id||null, analista_id||null]
      );
      return res.status(201).json(r.rows[0]);
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch(err) { return handleError(res, err); }
};
