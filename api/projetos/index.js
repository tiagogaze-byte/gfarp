const { query } = require('../middleware/db');
const { verificarToken, handleError, handleCors } = require('../middleware/auth');

// Calcula dias úteis entre duas datas (exclui sábado e domingo)
function diasUteisEntre(inicio, fim) {
  let count = 0;
  const cur = new Date(inicio);
  const end = new Date(fim);
  while (cur <= end) {
    const dia = cur.getDay();
    if (dia !== 0 && dia !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Semáforo: retorna cor e dias restantes
function calcularSemaforo(projeto) {
  if (projeto.data_saida_diretoria) return { cor: 'FINALIZADO', dias: 0 };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const referencia = projeto.novo_prazo || projeto.data_prevista;
  if (!referencia) return { cor: 'AGUARDANDO', dias: null };

  const prazo = new Date(referencia);
  prazo.setHours(0, 0, 0, 0);

  const diff = diasUteisEntre(hoje, prazo);
  const dias = prazo >= hoje ? diff : -diasUteisEntre(prazo, hoje);

  let cor;
  if (dias >= 5) cor = 'VERDE';
  else if (dias >= 2) cor = 'AMARELO';
  else if (dias === 1) cor = 'VERMELHO';
  else cor = 'VENCIDO';

  return { cor, dias };
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const usuario = verificarToken(req);

    // ── GET /api/projetos ──────────────────────────────────────
    if (req.method === 'GET') {
      const { status, analista_id, gestor_id, tipo, busca, periodo_inicio, periodo_fim } = req.query;

      let where = [];
      let params = [];
      let idx = 1;

      // Controle de acesso: usuário padrão só vê os seus
      if (!usuario.is_master) {
        where.push(`(p.gestor_id = $${idx} OR p.analista_id = $${idx})`);
        params.push(usuario.id);
        idx++;
      }

      if (status) { where.push(`p.status = $${idx++}`); params.push(status); }
      if (analista_id) { where.push(`p.analista_id = $${idx++}`); params.push(analista_id); }
      if (gestor_id) { where.push(`p.gestor_id = $${idx++}`); params.push(gestor_id); }
      if (tipo) { where.push(`p.tipo_demanda = $${idx++}`); params.push(tipo); }
      if (busca) { where.push(`(p.osc_nome ILIKE $${idx} OR p.codigo ILIKE $${idx})`); params.push(`%${busca}%`); idx++; }
      if (periodo_inicio) { where.push(`p.data_recebimento >= $${idx++}`); params.push(periodo_inicio); }
      if (periodo_fim) { where.push(`p.data_recebimento <= $${idx++}`); params.push(periodo_fim); }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const result = await query(`
        SELECT
          p.*,
          g.nome AS gestor_nome,
          a.nome AS analista_nome
        FROM projetos p
        LEFT JOIN usuarios g ON p.gestor_id = g.id
        LEFT JOIN usuarios a ON p.analista_id = a.id
        ${whereClause}
        ORDER BY p.criado_em DESC
      `, params);

      const projetos = result.rows.map(p => ({
        ...p,
        semaforo: calcularSemaforo(p)
      }));

      return res.status(200).json(projetos);
    }

    // ── POST /api/projetos ─────────────────────────────────────
    if (req.method === 'POST') {
      const {
        tipo_demanda, osc_nome, descricao,
        data_recebimento, gestor_id, analista_id
      } = req.body;

      if (!tipo_demanda || !osc_nome || !data_recebimento) {
        return res.status(400).json({ erro: 'Campos obrigatórios: tipo_demanda, osc_nome, data_recebimento' });
      }

      // Gera código sequencial: GFARP + ano + 4 dígitos
      const countResult = await query('SELECT COUNT(*) FROM projetos');
      const seq = parseInt(countResult.rows[0].count) + 1;
      const ano = new Date().getFullYear();
      const codigo = `GFARP${ano}${String(seq).padStart(4, '0')}`;

      const result = await query(`
        INSERT INTO projetos
          (codigo, tipo_demanda, osc_nome, descricao, data_recebimento, gestor_id, analista_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *
      `, [codigo, tipo_demanda, osc_nome, descricao || null, data_recebimento,
          gestor_id || null, analista_id || null]);

      return res.status(201).json(result.rows[0]);
    }

    return res.status(405).json({ erro: 'Método não permitido' });

  } catch (err) {
    return handleError(res, err);
  }
};
