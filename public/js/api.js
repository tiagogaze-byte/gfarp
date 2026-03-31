// ── API CLIENT ────────────────────────────────────────────────────────────────
const API = {
  async login(email, password) {
    const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password}) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.erro || 'Erro ao fazer login');
    return d;
  },
  async me() {
    const r = await fetch('/api/auth/me');
    if (!r.ok) return null;
    return r.json();
  },
  async logout() {
    await fetch('/api/auth/me', {method:'DELETE'});
    window.location.href = '/login.html';
  },
  async listarProjetos(f={}) {
    const p = new URLSearchParams(f).toString();
    const r = await fetch('/api/projetos'+(p?'?'+p:''));
    if (r.status===401){window.location.href='/login.html';return[];}
    if (!r.ok) throw new Error('Erro ao buscar projetos');
    return r.json();
  },
  async criarProjeto(d) {
    const r = await fetch('/api/projetos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro||'Erro ao criar projeto');
    return j;
  },
  async buscarProjeto(id) {
    const r = await fetch('/api/projetos/'+id);
    if (r.status===401){window.location.href='/login.html';return null;}
    if (!r.ok) throw new Error('Projeto não encontrado');
    return r.json();
  },
  async atualizarProjeto(id,d) {
    const r = await fetch('/api/projetos/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro||'Erro ao atualizar');
    return j;
  },
  async tramitarProjeto(id) { return this.atualizarProjeto(id,{acao:'tramitar'}); },
  async listarHistorico(pid) {
    const r = await fetch('/api/projetos/'+pid+'/historico');
    if (!r.ok) return [];
    return r.json();
  },
  async adicionarComentario(pid,texto,tipo='comentario') {
    const r = await fetch('/api/projetos/'+pid+'/historico',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto,tipo})});
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro||'Erro');
    return j;
  },
  async listarUsuarios() {
    const r = await fetch('/api/usuarios');
    if (!r.ok) throw new Error('Erro ao buscar usuários');
    return r.json();
  },
  async criarUsuario(d) {
    const r = await fetch('/api/usuarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro||'Erro ao criar usuário');
    return j;
  },
  async desativarUsuario(id) {
    const r = await fetch('/api/usuarios/'+id,{method:'DELETE'});
    if (!r.ok) throw new Error('Erro');
    return r.json();
  },
  async relatorio(f={}) {
    const p = new URLSearchParams(f).toString();
    const r = await fetch('/api/relatorios'+(p?'?'+p:''));
    if (!r.ok) throw new Error('Erro no relatório');
    return r.json();
  },
  exportarCSV(f={}) { window.open('/api/relatorios?'+new URLSearchParams({...f,exportar:'csv'}).toString(),'_blank'); },
  semaforoCor(s) {
    return {VERDE:'#2eac49',AMARELO:'#f59e0b',VERMELHO:'#ba1a1a',VENCIDO:'#000000',FINALIZADO:'#466270',AGUARDANDO:'#747781'}[s?.cor]||'#747781';
  },
  semaforoLabel(s) {
    if (!s||s.dias===null||s.dias===undefined) return 'Aguardando distribuição';
    if (s.cor==='FINALIZADO') return 'Finalizado';
    if (s.dias>0) return s.dias+' dia(s) restante(s)';
    if (s.dias===0) return 'Vence hoje';
    return Math.abs(s.dias)+' dia(s) de atraso';
  },
  statusLabel(s) { return {EM_ANALISE:'Em Análise',GFCAP:'GFCAP',OSC:'OSC',FINALIZADO:'Finalizado'}[s]||s; },
  formatarData(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('pt-BR'); },
  formatarDataHora(d) { if (!d) return ''; const dt=new Date(d); return dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
};

// ── PROTEÇÃO DE ROTA ──────────────────────────────────────────────────────────
async function protegerRota() {
  const r = await API.me();
  if (!r?.usuario) { window.location.href='/login.html'; return null; }
  return r.usuario;
}

// ── SIDEBAR DINÂMICA ──────────────────────────────────────────────────────────
function montarSidebar(usuario, paginaAtiva) {
  const pages = [
    {href:'/index.html',    icon:'dashboard',  label:'Dashboard',  id:'dash'},
    {href:'/projetos.html', icon:'assignment', label:'Projetos',   id:'proj'},
    {href:'/usuarios.html', icon:'group',      label:'Usuários',   id:'user', masterOnly:true},
    {href:'/relatorios.html',icon:'assessment',label:'Relatórios', id:'rel'},
  ];

  const nav = pages
    .filter(p => !p.masterOnly || usuario.is_master)
    .map(p => {
      const ativo = p.id === paginaAtiva;
      return `<a href="${p.href}" class="flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-medium transition-colors ${ativo ? 'bg-white text-[#00193c] shadow-sm font-bold border-r-4 border-[#00193c]' : 'text-slate-500 hover:text-[#00193c] hover:bg-slate-100'}">
        <span class="material-symbols-outlined">${p.icon}</span>${p.label}
      </a>`;
    }).join('');

  const inicial = usuario.nome.charAt(0).toUpperCase();

  document.getElementById('sidebar').innerHTML = `
    <div class="mb-10 px-2">
      <span class="text-xl font-black tracking-tighter text-[#00193c]">Gestão de Demandas</span>
      <p class="text-[10px] uppercase tracking-widest text-slate-400 mt-1">Sistema GFARP</p>
    </div>
    <nav class="flex-1 space-y-1">${nav}</nav>
    <div class="mt-auto pt-6 border-t border-slate-100">
      <button onclick="API.logout()" class="w-full bg-gradient-to-br from-[#00193c] to-[#002d62] text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 mb-6">
        <span class="material-symbols-outlined text-sm">logout</span>Sair
      </button>
      <div class="flex items-center gap-3 px-2">
        <div class="w-10 h-10 rounded-full bg-[#00193c] flex items-center justify-center text-white font-bold text-sm">${inicial}</div>
        <div class="overflow-hidden">
          <p class="text-sm font-bold text-[#00193c] truncate">${usuario.nome}</p>
          <p class="text-xs text-slate-400">${usuario.is_master ? 'Administrador' : 'Usuário'}</p>
        </div>
      </div>
    </div>`;
}

// ── MODAL NOVO PROJETO ────────────────────────────────────────────────────────
let _usuariosCache = null;
async function abrirModalNovoProjeto() {
  if (!_usuariosCache) _usuariosCache = await API.listarUsuarios().catch(()=>[]);
  const opts = _usuariosCache.map(u=>`<option value="${u.id}">${u.nome}</option>`).join('');
  const modal = document.getElementById('modal-projeto');
  if (!modal) return;
  modal.querySelector('#mp-opts-gestor').innerHTML = '<option value="">— Selecione —</option>'+opts;
  modal.querySelector('#mp-opts-analista').innerHTML = '<option value="">— Selecione —</option>'+opts;
  modal.querySelector('#mp-erro').textContent = '';
  modal.querySelector('form').reset();
  modal.classList.remove('hidden');
}
function fecharModalNovoProjeto() {
  document.getElementById('modal-projeto')?.classList.add('hidden');
}
