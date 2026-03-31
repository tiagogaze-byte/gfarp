const { query } = require('../middleware/db');
const { verificarToken, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const usuario = verificarToken(req);

    if (req.method !== 'GET') {
      return res.status(405).json({ erro: 'Método não permitido' });
    }

    const {
      status, analista_id, gestor_id, tipo,
      periodo_inicio, periodo_fim,
      exportar // 'csv' para exportar
    } = req.query;

    let where = [];
    let params = [];
    let idx = 1;

    // Controle de acesso
    if (!usuario.is_master) {
      where.push(`(p.gestor_id = $${idx} OR p.analista_id = $${idx})`);
      params.push(usuario.id);
      idx++;
    }

    if (status) { where.push(`p.status = $${idx++}`); params.push(status); }
    if (analista_id) { where.push(`p.analista_id = $${idx++}`); params.push(analista_id); }
    if (gestor_id) { where.push(`p.gestor_id = $${idx++}`); params.push(gestor_id); }
    if (tipo) { where.push(`p.tipo_demanda = $${idx++}`); params.push(tipo); }
    if (periodo_inicio) { where.push(`p.data_recebimento >= $${idx++}`); params.push(periodo_inicio); }
    if (periodo_fim) { where.push(`p.data_recebimento <= $${idx++}`); params.push(periodo_fim); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await query(`
      SELECT
        p.codigo, p.tipo_demanda, p.osc_nome, p.status,
        p.data_recebimento, p.data_distribuicao, p.prazo_dias,
        p.data_prevista, p.data_saida_diretoria,
        g.nome AS gestor, a.nome AS analista,
        p.principais_apontamentos,
        CASE
          WHEN p.data_saida_diretoria IS NOT NULL THEN 0
          WHEN p.data_prevista IS NULL THEN NULL
          ELSE (p.novo_prazo::date - CURRENT_DATE)
        END AS dias_restantes
      FROM projetos p
      LEFT JOIN usuarios g ON p.gestor_id = g.id
      LEFT JOIN usuarios a ON p.analista_id = a.id
      ${whereClause}
      ORDER BY p.data_recebimento DESC
    `, params);

    // ── Totalizadores ──────────────────────────────────────────
    const totais = {
      total: result.rows.length,
      em_analise: result.rows.filter(r => r.status === 'EM_ANALISE').length,
      gfcap: result.rows.filter(r => r.status === 'GFCAP').length,
      osc: result.rows.filter(r => r.status === 'OSC').length,
      finalizado: result.rows.filter(r => r.status === 'FINALIZADO').length,
      atrasados: result.rows.filter(r => r.dias_restantes !== null && r.dias_restantes <= 0).length
    };

    // ── Exportação CSV ─────────────────────────────────────────
    if (exportar === 'csv') {
      const cabecalho = [
        'Código', 'Tipo', 'OSC', 'Status', 'Gestor', 'Analista',
        'Recebimento', 'Distribuição', 'Prazo (dias)', 'Data Prevista',
        'Saída Diretoria', 'Dias Restantes', 'Apontamentos'
      ].join(';');

      const linhas = result.rows.map(r => [
        r.codigo, r.tipo_demanda, r.osc_nome, r.status,
        r.gestor || '', r.analista || '',
        r.data_recebimento ? r.data_recebimento.toISOString().split('T')[0] : '',
        r.data_distribuicao ? r.data_distribuicao.toISOString().split('T')[0] : '',
        r.prazo_dias,
        r.data_prevista ? r.data_prevista.toISOString().split('T')[0] : '',
        r.data_saida_diretoria ? r.data_saida_diretoria.toISOString().split('T')[0] : '',
        r.dias_restantes !== null ? r.dias_restantes : '',
        (r.principais_apontamentos || '').replace(/;/g, ',')
      ].join(';'));

      const csv = [cabecalho, ...linhas].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-${Date.now()}.csv"`);
      return res.status(200).send('\uFEFF' + csv); // BOM para Excel
    }

    // ── Resposta JSON padrão ───────────────────────────────────
    return res.status(200).json({ totais, projetos: result.rows });

  } catch (err) {
    return handleError(res, err);
  }
};
