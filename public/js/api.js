const API = {
  async login(email,password){const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const d=await r.json();if(!r.ok)throw new Error(d.erro||'Erro');return d;},
  async me(){const r=await fetch('/api/auth/me');if(!r.ok)return null;return r.json();},
  async logout(){await fetch('/api/auth/me',{method:'DELETE'});window.location.href='/login.html';},
  async listarProjetos(f={}){const p=Object.keys(f).length?'?'+new URLSearchParams(f):'';const r=await fetch('/api/projetos'+p);if(r.status===401){window.location.href='/login.html';return[];}if(!r.ok)throw new Error('Erro');return r.json();},
  async criarProjeto(d){const r=await fetch('/api/projetos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const j=await r.json();if(!r.ok)throw new Error(j.erro||'Erro');return j;},
  async buscarProjeto(id){const r=await fetch('/api/projetos/'+id);if(r.status===401){window.location.href='/login.html';return null;}if(!r.ok)throw new Error('Não encontrado');return r.json();},
  async atualizarProjeto(id,d){const r=await fetch('/api/projetos/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const j=await r.json();if(!r.ok)throw new Error(j.erro||'Erro');return j;},
  async tramitarProjeto(id,destino){return this.atualizarProjeto(id,{acao:'tramitar',destino});},
  async listarHistorico(pid){const r=await fetch('/api/projetos/'+pid+'/historico');if(!r.ok)return[];return r.json();},
  async adicionarRegistro(pid,texto,tipo='atendimento'){const r=await fetch('/api/projetos/'+pid+'/historico',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto,tipo})});const j=await r.json();if(!r.ok)throw new Error(j.erro||'Erro');return j;},
  async listarUsuarios(){const r=await fetch('/api/usuarios');if(!r.ok)throw new Error('Erro ao buscar usuários');return r.json();},
  async criarUsuario(d){const r=await fetch('/api/usuarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const j=await r.json();if(!r.ok)throw new Error(j.erro||'Erro');return j;},
  async editarUsuario(id,d){const r=await fetch('/api/usuarios/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const j=await r.json();if(!r.ok)throw new Error(j.erro||'Erro');return j;},
  async desativarUsuario(id){const r=await fetch('/api/usuarios/'+id,{method:'DELETE'});if(!r.ok)throw new Error('Erro');return r.json();},
  async relatorio(f={}){const p=Object.keys(f).length?'?'+new URLSearchParams(f):'';const r=await fetch('/api/relatorios'+p);if(!r.ok)throw new Error('Erro');return r.json();},
  exportarCSV(f={}){window.open('/api/relatorios?'+new URLSearchParams({...f,exportar:'csv'}),'_blank');},
  exportarCSVProjeto(pid){window.open('/api/relatorios?projeto_id='+pid+'&exportar=csv','_blank');},

  semaforoCor(s){return{VERDE:'#16a34a',AMARELO:'#d97706',VERMELHO:'#dc2626',VENCIDO:'#111827',FINALIZADO:'#6b7280',AGUARDANDO:'#94a3b8'}[s?.cor]||'#94a3b8';},
  semaforoLabel(s){if(!s||s.dias===null||s.dias===undefined)return'Aguardando distribuição';if(s.cor==='FINALIZADO')return'Finalizado';if(s.dias>0)return s.dias+' dia(s) restante(s)';if(s.dias===0)return'Vence hoje';return Math.abs(s.dias)+' dia(s) de atraso';},
  statusLabel(s){return{EM_ANALISE:'Em Análise',GFCAP:'GFCAP',OSC:'OSC',FINALIZADO:'Finalizado'}[s]||s;},
  papelLabel(p){return{MASTER:'Administrador',SUPERVISOR:'Supervisor',PADRAO:'Padrão'}[p]||p||'Padrão';},
  fmt(d){if(!d)return'—';try{return new Date(d).toLocaleDateString('pt-BR');}catch{return'—';}},
  formatarData(d){return this.fmt(d);},
  fmtHora(d){if(!d)return'';try{const dt=new Date(d);return dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}catch{return'';}},
  tipoIcon(t){return{tramitacao:'swap_horiz',pausa:'pause_circle',retomada:'play_circle',observacao:'visibility',atendimento:'edit_note'}[t]||'edit_note';},
  tipoCor(t){return{tramitacao:'#3b82f6',pausa:'#f59e0b',retomada:'#16a34a',observacao:'#8b5cf6',atendimento:'#00193c'}[t]||'#00193c';}
};

async function protegerRota(){const r=await API.me();if(!r?.usuario){window.location.href='/login.html';return null;}return r.usuario;}
function getPapel(u){return u.papel||(u.is_master?'MASTER':'PADRAO');}
function isMasterUser(u){const p=getPapel(u);return p==='MASTER'||p==='SUPERVISOR';}

let _uc=null;
async function getUsuarios(){if(!_uc)_uc=await API.listarUsuarios().catch(()=>[]);return _uc;}

function montarSidebar(usuario,ativa){
  const papel=getPapel(usuario);
  const master=papel==='MASTER';
  const relatorio=papel==='MASTER'||papel==='SUPERVISOR';
  const pages=[
    {href:'/index.html',icon:'dashboard',label:'Dashboard',id:'dash'},
    {href:'/projetos.html',icon:'assignment',label:'Projetos',id:'proj'},
    master&&{href:'/usuarios.html',icon:'group',label:'Usuários',id:'user'},
    relatorio&&{href:'/relatorios.html',icon:'assessment',label:'Relatórios',id:'rel'},
  ].filter(Boolean);
  const nav=pages.map(p=>`<a href="${p.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${p.id===ativa?'bg-white text-[#00193c] shadow-sm font-bold border-r-4 border-[#00193c]':'text-slate-500 hover:text-[#00193c] hover:bg-white/70'}"><span class="material-symbols-outlined text-[20px]">${p.icon}</span>${p.label}</a>`).join('');
  const ini=usuario.nome.charAt(0).toUpperCase();
  document.getElementById('sidebar').innerHTML=`
    <div class="mb-8 px-2"><p class="text-lg font-black text-[#00193c] tracking-tight">Gestão de Demandas</p><p class="text-[10px] uppercase tracking-widest text-slate-400 mt-0.5">Sistema GFARP</p></div>
    <nav class="flex-1 space-y-0.5">${nav}</nav>
    <div class="mt-auto pt-4 border-t border-slate-200">
      ${master?`<button onclick="abrirModalNovoProjeto()" class="w-full bg-[#00193c] text-white py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 mb-3"><span class="material-symbols-outlined text-sm">add</span>Novo Projeto</button>`:''}
      <button onclick="API.logout()" class="w-full text-left px-2 py-2 text-sm text-slate-400 hover:text-red-500 flex items-center gap-2"><span class="material-symbols-outlined text-sm">logout</span>Sair</button>
      <div class="flex items-center gap-3 px-2 mt-3"><div class="w-8 h-8 rounded-full bg-[#00193c] flex items-center justify-center text-white font-bold text-xs">${ini}</div><div><p class="text-sm font-bold text-[#00193c] truncate">${usuario.nome}</p><p class="text-xs text-slate-400">${API.papelLabel(papel)}</p></div></div>
    </div>`;
}

function abrirModalNovoProjeto(){
  const m=document.getElementById('modal-projeto');if(!m)return;
  m.querySelector('form').reset();
  const e=m.querySelector('#mp-erro');if(e)e.textContent='';
  getUsuarios().then(lista=>{
    const opts='<option value="">— Nenhum —</option>'+lista.map(u=>`<option value="${u.id}">${u.nome}</option>`).join('');
    const g=m.querySelector('#mp-gestor');if(g)g.innerHTML=opts;
    const a=m.querySelector('#mp-analista');if(a)a.innerHTML=opts;
  });
  m.classList.remove('hidden');
}
function fecharModalNovoProjeto(){document.getElementById('modal-projeto')?.classList.add('hidden');}
