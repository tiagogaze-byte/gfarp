// ============================================================
// API CLIENT — gestao-demandas
// Centraliza todas as chamadas ao backend
// ============================================================

const API = {

  // ── AUTH ────────────────────────────────────────────────────

  async login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.erro || 'Erro ao fazer login');
    }
    return res.json();
  },

  async me() {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    return res.json();
  },

  async logout() {
    await fetch('/api/auth/me', { method: 'DELETE' });
    window.location.href = '/login.html';
  },

  // ── PROJETOS ────────────────────────────────────────────────

  async listarProjetos(filtros = {}) {
    const params = new URLSearchParams(filtros).toString();
    const res = await fetch(`/api/projetos${params ? '?' + params : ''}`);
    if (!res.ok) throw new Error('Erro ao buscar projetos');
    return res.json();
  },

  async criarProjeto(dados) {
    const res = await fetch('/api/projetos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.erro || 'Erro ao criar projeto');
    }
    return res.json();
  },

  async buscarProjeto(id) {
    const res = await fetch(`/api/projetos/${id}`);
    if (!res.ok) throw new Error('Projeto não encontrado');
    return res.json();
  },

  async atualizarProjeto(id, dados) {
    const res = await fetch(`/api/projetos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.erro || 'Erro ao atualizar projeto');
    }
    return res.json();
  },

  async tramitarProjeto(id) {
    return this.atualizarProjeto(id, { acao: 'tramitar' });
  },

  // ── HISTÓRICO DE ATENDIMENTO ────────────────────────────────

  async listarHistorico(projetoId) {
    const res = await fetch(`/api/projetos/${projetoId}/historico`);
    if (!res.ok) throw new Error('Erro ao buscar histórico');
    return res.json();
  },

  async adicionarComentario(projetoId, texto, tipo = 'comentario') {
    const res = await fetch(`/api/projetos/${projetoId}/historico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, tipo })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.erro || 'Erro ao adicionar comentário');
    }
    return res.json();
  },

  // ── USUÁRIOS ────────────────────────────────────────────────

  async listarUsuarios() {
    const res = await fetch('/api/usuarios');
    if (!res.ok) throw new Error('Erro ao buscar usuários');
    return res.json();
  },

  async criarUsuario(dados) {
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.erro || 'Erro ao criar usuário');
    }
    return res.json();
  },

  async atualizarUsuario(id, dados) {
    const res = await fetch(`/api/usuarios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.erro || 'Erro ao atualizar usuário');
    }
    return res.json();
  },

  async desativarUsuario(id) {
    const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao desativar usuário');
    return res.json();
  },

  // ── RELATÓRIOS ──────────────────────────────────────────────

  async relatorio(filtros = {}) {
    const params = new URLSearchParams(filtros).toString();
    const res = await fetch(`/api/relatorios${params ? '?' + params : ''}`);
    if (!res.ok) throw new Error('Erro ao gerar relatório');
    return res.json();
  },

  exportarCSV(filtros = {}) {
    const params = new URLSearchParams({ ...filtros, exportar: 'csv' }).toString();
    window.open(`/api/relatorios?${params}`, '_blank');
  },

  // ── UTILITÁRIOS ─────────────────────────────────────────────

  semaforoCor(semaforo) {
    const mapa = {
      'VERDE': '#2eac49',
      'AMARELO': '#f59e0b',
      'VERMELHO': '#ba1a1a',
      'VENCIDO': '#000000',
      'FINALIZADO': '#466270',
      'AGUARDANDO': '#747781'
    };
    return mapa[semaforo?.cor] || '#747781';
  },

  semaforoLabel(semaforo) {
    if (!semaforo || semaforo.dias === null) return 'Aguardando distribuição';
    if (semaforo.cor === 'FINALIZADO') return 'Finalizado';
    if (semaforo.dias > 0) return `${semaforo.dias} dia(s) restante(s)`;
    if (semaforo.dias === 0) return 'Vence hoje';
    return `${Math.abs(semaforo.dias)} dia(s) de atraso`;
  },

  formatarData(dataStr) {
    if (!dataStr) return '—';
    return new Date(dataStr).toLocaleDateString('pt-BR');
  },

  statusLabel(status) {
    const mapa = {
      'EM_ANALISE': 'Em Análise',
      'GFCAP': 'GFCAP',
      'OSC': 'OSC',
      'FINALIZADO': 'Finalizado'
    };
    return mapa[status] || status;
  }
};

// Proteção de rota — redireciona para login se não autenticado
async function protegerRota() {
  const resultado = await API.me();
  if (!resultado || !resultado.usuario) {
    window.location.href = '/login.html';
    return null;
  }
  return resultado.usuario;
}
