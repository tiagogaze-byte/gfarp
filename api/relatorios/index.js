const { query } = require('../middleware/db');
const { verificarToken, podeVerRelatorios, handleError, handleCors } = require('../middleware/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const usuario = verificarToken(req);
    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

    const { status, tipo, periodo_inicio, periodo_fim, exportar, projeto_id } = req.query;

    // Relatório de um projeto específico (histórico completo)
    if (projeto_id) {
      const pr = await query(`SELECT p.*,g.nome AS gestor_nome,a.nome AS analista_nome FROM projetos p LEFT JOIN usuarios g ON p.gestor_id=g.id LEFT JOIN usuarios a ON p.analista_id=a.id WHERE p.id=$1`, [projeto_id]);
      if (!pr.rows.length) return res.status(404).json({ erro: 'Projeto não encontrado' });
      const hist = await query(`SELECT h.*,u.nome AS usuario_nome FROM historico_atendimento h LEFT JOIN usuarios u ON h.usuario_id=u.id WHERE h.projeto_id=$1 ORDER BY h.criado_em ASC`, [projeto_id]);

      if (exportar === 'csv') {
        const p = pr.rows[0];
        const cabecalho = 'Data;Usuário;Tipo;Registro';
        const linhas = hist.rows.map(h => [
          new Date(h.criado_em).toLocaleString('pt-BR'),
          h.usuario_nome||'Sistema',
          h.tipo||'atendimento',
          (h.texto||'').replace(/;/g,',')
        ].join(';'));
        const info = `Projeto;${p.codigo}\nOSC;${p.osc_nome}\nTipo;${p.tipo_demanda}\nStatus;${p.status}\nGestor;${p.gestor_nome||'-'}\nAnalista;${p.analista_nome||'-'}\n\n`;
        const csv = info + [cabecalho,...linhas].join('\n');
        res.setHeader('Content-Type','text/csv;charset=utf-8');
        res.setHeader('Content-Disposition',`attachment;filename="atendimento-${p.codigo}.csv"`);
        return res.status(200).send('\uFEFF'+csv);
      }

      return res.status(200).json({ projeto: pr.rows[0], historico: hist.rows });
    }

    // Relatório geral — MASTER e SUPERVISOR veem tudo, PADRAO só os seus
    let where = [], params = [], idx = 1;
    const papel = usuario.papel || (usuario.is_master ? 'MASTER' : 'PADRAO');
    if (papel === 'PADRAO') {
      where.push(`(p.gestor_id=$${idx} OR p.analista_id=$${idx})`);
      params.push(usuario.id); idx++;
    }
    if (status) { where.push(`p.status=$${idx++}`); params.push(status); }
    if (tipo) { where.push(`p.tipo_demanda=$${idx++}`); params.push(tipo); }
    if (periodo_inicio) { where.push(`p.data_recebimento>=$${idx++}`); params.push(periodo_inicio); }
    if (periodo_fim) { where.push(`p.data_recebimento<=$${idx++}`); params.push(periodo_fim); }
    const wc = where.length ? 'WHERE '+where.join(' AND ') : '';

    const r = await query(`
      SELECT p.*,g.nome AS gestor,a.nome AS analista,
        CASE WHEN p.data_saida_diretoria IS NOT NULL THEN 0
             WHEN p.data_prevista IS NULL THEN NULL
             ELSE (p.novo_prazo::date - CURRENT_DATE) END AS dias_restantes
      FROM projetos p LEFT JOIN usuarios g ON p.gestor_id=g.id LEFT JOIN usuarios a ON p.analista_id=a.id
      ${wc} ORDER BY p.data_recebimento DESC`, params);

    const rows = r.rows;
    const totais = {
      total: rows.length,
      em_analise: rows.filter(x=>x.status==='EM_ANALISE').length,
      gfcap: rows.filter(x=>x.status==='GFCAP').length,
      osc: rows.filter(x=>x.status==='OSC').length,
      finalizado: rows.filter(x=>x.status==='FINALIZADO').length,
      atrasados: rows.filter(x=>x.dias_restantes!==null&&x.dias_restantes<=0).length
    };

    if (exportar === 'csv') {
      const cab = 'Código;OSC;Tipo;Status;Gestor;Analista;Recebimento;Distribuição;Data Prevista;Saída Diretoria;Dias Restantes;Apontamentos';
      const linhas = rows.map(p=>[
        p.codigo,p.osc_nome,p.tipo_demanda,p.status,
        p.gestor||'',p.analista||'',
        p.data_recebimento?new Date(p.data_recebimento).toLocaleDateString('pt-BR'):'',
        p.data_distribuicao?new Date(p.data_distribuicao).toLocaleDateString('pt-BR'):'',
        p.data_prevista?new Date(p.data_prevista).toLocaleDateString('pt-BR'):'',
        p.data_saida_diretoria?new Date(p.data_saida_diretoria).toLocaleDateString('pt-BR'):'',
        p.dias_restantes!==null?p.dias_restantes:'',
        (p.principais_apontamentos||'').replace(/;/g,',')
      ].join(';'));
      const csv = [cab,...linhas].join('\n');
      res.setHeader('Content-Type','text/csv;charset=utf-8');
      res.setHeader('Content-Disposition',`attachment;filename="relatorio-${Date.now()}.csv"`);
      return res.status(200).send('\uFEFF'+csv);
    }

    return res.status(200).json({ totais, projetos: rows });
  } catch(err) { return handleError(res, err); }
};
