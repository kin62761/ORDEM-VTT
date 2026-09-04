const socket = io();
const $ = id => document.getElementById(id);
let sessao = { nome:'', sala:'', perfil:'jogador' };
let fichas = {};
let fichaAtualNome = '';
let ficha = null;
let saveTimer = null;
let cenas = [];
let cenaAtualId = '';
let mapa = { url:'', largura:1600, altura:900 };
let tokens = [];
let mascaras = [];
let modoMascara = '';
let desenhoMascara = null;
let zoom = 1;
let audioDesbloqueado = false;
let audioState = { url:'', playing:false, offset:0, startedAt:0, volume:.55, loop:true, cenaId:'' };
let cinematicTimer = null;

function toast(msg, tipo='ok'){
  const el=$('toast'); el.textContent=msg; el.className=`toast ${tipo}`; setTimeout(()=>el.className='toast hidden',2400);
}
function n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function pct(atual,max){ max=n(max); atual=n(atual); return max>0?Math.max(0,Math.min(100,(atual/max)*100)):0; }

// Converte links públicos do Google Drive em URL direta de imagem.
// Aceita, por exemplo:
// https://drive.google.com/file/d/ID/view?usp=sharing
// https://drive.google.com/open?id=ID
// https://drive.google.com/uc?id=ID
function converterLinkImagem(url){
  const original=String(url||'').trim();
  if(!original) return '';
  try{
    const u=new URL(original);
    const host=u.hostname.toLowerCase();
    if(!host.includes('drive.google.com') && !host.includes('docs.google.com')) return original;
    let id='';
    const m=u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || u.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if(m) id=m[1];
    if(!id) id=u.searchParams.get('id')||'';
    if(!id){
      const parts=u.pathname.split('/').filter(Boolean);
      const idx=parts.indexOf('folders');
      if(idx>=0 && parts[idx+1]) id=parts[idx+1];
    }
    // Pastas não são imagens; se não houver ID de arquivo válido, mantém o link.
    if(!id) return original;
    return `https://lh3.googleusercontent.com/d/${id}`;
  }catch(e){
    return original;
  }
}
window.converterLinkImagem=converterLinkImagem;

function extrairDriveId(url){
  const original=String(url||'').trim(); if(!original) return '';
  try{
    const u=new URL(original); const host=u.hostname.toLowerCase();
    if(!host.includes('drive.google.com') && !host.includes('docs.google.com')) return '';
    const m=u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || u.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if(m) return m[1]; return u.searchParams.get('id')||'';
  }catch(_){ return ''; }
}
function converterLinkMidia(url){
  const original=String(url||'').trim(); if(!original) return '';
  const id=extrairDriveId(original); return id?`/drive-media/${encodeURIComponent(id)}`:original;
}
window.converterLinkMidia=converterLinkMidia;


function atualizarVisualFicha(){
  if(!ficha)return;
  const nome=(ficha.personagem||fichaAtualNome||'PERSONAGEM');
  if($('sidebarNome')) $('sidebarNome').textContent=nome.toUpperCase();
  if($('sidebarInfo')) $('sidebarInfo').textContent=`NEX ${n(ficha.nex,5)}% • ${ficha.classe||'—'}`;
  if($('jogadorVisual')) $('jogadorVisual').value=ficha.jogador||fichaAtualNome||'';
  if($('nexBadge')) $('nexBadge').textContent=`${n(ficha.nex,5)}%`;
  if($('peTurno')) $('peTurno').textContent=Math.max(1,Math.ceil(n(ficha.nex,5)/5));
  if($('esquivaVisual')) $('esquivaVisual').textContent=10+n(ficha.atributos?.agi,0);
  if($('barPv')) $('barPv').style.setProperty('--pct',pct(ficha.pv,ficha.pvMax)+'%');
  if($('barSan')) $('barSan').style.setProperty('--pct',pct(ficha.san,ficha.sanMax)+'%');
  if($('barPe')) $('barPe').style.setProperty('--pct',pct(ficha.pe,ficha.peMax)+'%');
  if($('salaVisual')) $('salaVisual').textContent=sessao.sala||'—';
}
function abrirTela(nome){
  const fichaTela=$('sheetScreen'), mapaTela=$('mapScreen');
  const ehMapa=nome==='mapa';
  fichaTela.classList.toggle('hidden',ehMapa); mapaTela.classList.toggle('hidden',!ehMapa);
  $('navMapa')?.classList.toggle('active',ehMapa); $('navFicha')?.classList.toggle('active',!ehMapa);
}
$('navFicha')?.addEventListener('click',()=>abrirTela('ficha'));
$('navMapa')?.addEventListener('click',()=>abrirTela('mapa'));

$('btnEntrar').onclick=()=>{
  const nome=$('nomeEntrada').value.trim();
  if(!nome) return toast('Informe seu nome.','error');
  sessao={nome,sala:$('salaEntrada').value.trim()||'SELO',perfil:$('perfilEntrada').value};
  socket.emit('entrarSala',sessao);
};

socket.on('estadoInicial',estado=>{
  fichas=estado.fichas||{}; cenas=estado.cenas||[]; cenaAtualId=estado.cenaAtualId||'';
  mapa=estado.mapa||mapa; tokens=estado.tokens||[]; mascaras=estado.mascaras||[]; audioState=estado.audioState||audioState;
  $('loginBox').classList.add('hidden'); $('statusOnline').classList.remove('hidden'); $('app').classList.remove('hidden'); $('mainNav')?.classList.remove('hidden');
  const mestre=sessao.perfil==='mestre';
  $('seletorFichaMestre').classList.toggle('hidden',!mestre); $('masterMapControls').classList.toggle('hidden',!mestre); $('masterSceneControls')?.classList.toggle('hidden',!mestre); $('btnNovoFichaVisual')?.classList.toggle('hidden',!mestre);
  $('cinematicCloseMaster')?.classList.toggle('hidden',!mestre);
  if(mestre){ atualizarSelectMestre(); fichaAtualNome=Object.keys(fichas)[0]||''; if(fichaAtualNome) carregarFicha(fichaAtualNome); }
  else { fichaAtualNome=sessao.nome; carregarFicha(fichaAtualNome); }
  atualizarCenasUI(); aplicarMapa(); renderMascaras(); renderTokens(); atualizarJogadores(estado.jogadores||[]); aplicarTrilhaCenaNosControles();
  if(estado.cinematica) mostrarCinematica(estado.cinematica);
  if(audioState?.playing) aplicarAudioComando({acao:'play',...audioState,serverNow:estado.serverNow||Date.now()});
});

socket.on('fichaAtualizada',({nome,ficha:nova})=>{
  fichas[nome]=nova; if(nome===fichaAtualNome){ ficha=nova; preencherFicha(); }
  if(sessao.perfil==='mestre') atualizarSelectMestre();
});
socket.on('cenaAtualizada',estado=>{
  cenas=estado.cenas||cenas; cenaAtualId=estado.cenaAtualId||cenaAtualId; mapa=estado.mapa||mapa; tokens=estado.tokens||[]; mascaras=estado.mascaras||[];
  atualizarCenasUI(); aplicarMapa(); renderMascaras(); renderTokens(); aplicarTrilhaCenaNosControles(estado.trilha);
});
socket.on('mapaAtualizado',m=>{ mapa=m; aplicarMapa(); renderMascaras(); renderTokens(); });
socket.on('tokensAtualizados',t=>{ tokens=t||[]; renderTokens(); });
socket.on('mascarasAtualizadas',m=>{ mascaras=m||[]; renderMascaras(); renderTokens(); });
socket.on('audioComando',aplicarAudioComando);
socket.on('cinematicaIniciada',mostrarCinematica);
socket.on('cinematicaEncerrada',esconderCinematica);
socket.on('jogadoresAtualizados',atualizarJogadores);
socket.on('rolagemCompartilhada',r=>{ const txt=`${r.jogador}: ${r.contexto||'Rolagem'} → ${r.expressao}`; if($('rolagemLog')) $('rolagemLog').textContent=txt; if($('rolagemLogMapa')) $('rolagemLogMapa').textContent=txt; });

function atualizarJogadores(lista){ $('jogadoresLista').textContent=(lista||[]).map(j=>`${j.nome}${j.perfil==='mestre'?' (Mestre)':''}`).join(', ')||'—'; }
function fichaPadraoLocal(nome){return {jogador:nome,personagem:nome,origem:'',classe:'',trilha:'',nex:5,defesa:11,pv:21,pvMax:21,pe:3,peMax:3,san:12,sanMax:12,atributos:{agi:1,for:1,int:1,pre:1,vig:1},pericias:[],ataques:[],habilidades:[],inventario:[],rituais:[],anotacoes:'',fichaAutomatica:true};}
function carregarFicha(nome){ fichaAtualNome=nome; ficha=structuredClone(fichas[nome]||fichaPadraoLocal(nome)); preencherFicha(); }
function atualizarSelectMestre(){
  const s=$('fichaMestreSelect'); const atual=fichaAtualNome; s.innerHTML='<option value="">Selecionar ficha...</option>'+Object.keys(fichas).sort().map(nm=>`<option>${esc(nm)}</option>`).join(''); s.value=atual;
}
$('fichaMestreSelect').onchange=e=>{ if(e.target.value) carregarFicha(e.target.value); };
$('btnCriarFicha').onclick=()=>{ const nome=$('novaFichaNome').value.trim(); if(!nome)return; socket.emit('criarFicha',{nome}); $('novaFichaNome').value=''; };


function normalizarClasse(v){
  const x=String(v||'').trim().toLocaleLowerCase('pt-BR');
  if(x==='combatente')return 'Combatente';
  if(x==='especialista')return 'Especialista';
  if(x==='ocultista')return 'Ocultista';
  return String(v||'').trim();
}
function nivelPorNex(nex){
  const v=Math.max(5,Math.min(99,n(nex,5)));
  if(v>=99)return 20;
  return Math.max(1,Math.floor(v/5));
}
function calcularBaseFicha(f){
  const classe=normalizarClasse(f?.classe);
  const a=f?.atributos||{};
  const vig=n(a.vig,0), pre=n(a.pre,0), agi=n(a.agi,0);
  const nivel=nivelPorNex(f?.nex);
  let pvBase=0,pvNivel=0,peBase=0,peNivel=0,sanBase=0,sanNivel=0;
  if(classe==='Combatente'){
    pvBase=20+vig; pvNivel=4+vig; peBase=2+pre; peNivel=2+pre; sanBase=12; sanNivel=3;
  }else if(classe==='Especialista'){
    pvBase=16+vig; pvNivel=3+vig; peBase=3+pre; peNivel=3+pre; sanBase=16; sanNivel=4;
  }else if(classe==='Ocultista'){
    pvBase=12+vig; pvNivel=2+vig; peBase=4+pre; peNivel=4+pre; sanBase=20; sanNivel=5;
  }else{
    return {valido:false,defesa:10+agi,peTurno:nivel};
  }
  return {
    valido:true,
    pvMax:Math.max(1,pvBase+(nivel-1)*pvNivel),
    peMax:Math.max(0,peBase+(nivel-1)*peNivel),
    sanMax:Math.max(0,sanBase+(nivel-1)*sanNivel),
    defesa:10+agi, peTurno:nivel
  };
}
function ajustarAtualAoNovoMax(atual,maxAntigo,maxNovo){
  atual=n(atual,0); maxAntigo=n(maxAntigo,0); maxNovo=n(maxNovo,0);
  if(maxAntigo<=0)return maxNovo;
  const gasto=Math.max(0,maxAntigo-atual);
  return Math.max(0,Math.min(maxNovo,maxNovo-gasto));
}
function recalcularFichaAutomatica({restaurar=false,salvar=true}={}){
  if(!ficha)return;
  ficha.fichaAutomatica=!!$('fichaAutomatica')?.checked;
  const calc=calcularBaseFicha(ficha);
  ficha.defesa=calc.defesa;
  if(calc.valido && ficha.fichaAutomatica){
    const oldPvMax=n(ficha.pvMax), oldPeMax=n(ficha.peMax), oldSanMax=n(ficha.sanMax);
    const oldPv=n(ficha.pv), oldPe=n(ficha.pe), oldSan=n(ficha.san);
    ficha.pvMax=calc.pvMax; ficha.peMax=calc.peMax; ficha.sanMax=calc.sanMax;
    if(restaurar){
      ficha.pv=ficha.pvMax; ficha.pe=ficha.peMax; ficha.san=ficha.sanMax;
    }else{
      ficha.pv=ajustarAtualAoNovoMax(oldPv,oldPvMax,ficha.pvMax);
      ficha.pe=ajustarAtualAoNovoMax(oldPe,oldPeMax,ficha.peMax);
      ficha.san=ajustarAtualAoNovoMax(oldSan,oldSanMax,ficha.sanMax);
    }
  }
  for(const id of ['defesa','pv','pvMax','pe','peMax','san','sanMax']) if($(id)) $(id).value=ficha[id]??0;
  atualizarVisualFicha();
  if(salvar) salvarFicha();
}

function preencherFicha(){
  if(!ficha)return;
  if($('tituloFicha')) if($('tituloFicha')) $('tituloFicha').textContent=(ficha.personagem||fichaAtualNome||'PERSONAGEM').toUpperCase();
  atualizarVisualFicha();
  for(const id of ['personagem','origem','classe','trilha','nex','defesa','pv','pvMax','pe','peMax','san','sanMax']) $(id).value=ficha[id]??'';
  for(const id of ['agi','for','int','pre','vig']) $(id).value=ficha.atributos?.[id]??0;
  if($('fichaAutomatica')) $('fichaAutomatica').checked=ficha.fichaAutomatica!==false;
  $('anotacoes').value=ficha.anotacoes||'';
  renderPericias(); renderAtaques(); renderHabilidades(); renderInventario(); renderRituais(); atualizarVisualFicha();
}

function lerCamposBase(){
  if(!ficha)return;
  for(const id of ['personagem','origem','classe','trilha']) ficha[id]=$(id).value;
  ficha.classe=normalizarClasse(ficha.classe);
  ficha.fichaAutomatica=!!$('fichaAutomatica')?.checked;
  for(const id of ['nex','defesa','pv','pvMax','pe','peMax','san','sanMax']) ficha[id]=n($(id).value);
  ficha.atributos={}; for(const id of ['agi','for','int','pre','vig']) ficha.atributos[id]=n($(id).value);
  ficha.anotacoes=$('anotacoes').value;
  if($('tituloFicha')) if($('tituloFicha')) $('tituloFicha').textContent=(ficha.personagem||fichaAtualNome||'PERSONAGEM').toUpperCase();
  atualizarVisualFicha();
}
function agendarSalvar(){ clearTimeout(saveTimer); saveTimer=setTimeout(salvarFicha,220); }
function salvarFicha(){ if(!ficha||!fichaAtualNome)return; lerCamposBase(); socket.emit('atualizarFicha',{nome:fichaAtualNome,ficha}); }
['personagem','origem','classe','trilha','nex','defesa','pv','pvMax','pe','peMax','san','sanMax','agi','for','int','pre','vig','anotacoes'].forEach(id=>{
  $(id)?.addEventListener('input',()=>{
    lerCamposBase();
    if($('fichaAutomatica')?.checked && ['classe','nex','agi','vig','pre'].includes(id)){
      recalcularFichaAutomatica({restaurar:false,salvar:false});
    }
    agendarSalvar();
  });
});
$('classe')?.addEventListener('change',()=>{
  lerCamposBase();
  if($('fichaAutomatica')?.checked) recalcularFichaAutomatica({restaurar:false,salvar:false});
  agendarSalvar();
});
$('fichaAutomatica')?.addEventListener('change',()=>{
  if(!ficha)return;
  ficha.fichaAutomatica=$('fichaAutomatica').checked;
  if(ficha.fichaAutomatica) recalcularFichaAutomatica({restaurar:false,salvar:true});
  else salvarFicha();
});
$('btnRecalcularFicha')?.addEventListener('click',()=>recalcularFichaAutomatica({restaurar:false,salvar:true}));
$('btnRestaurarRecursos')?.addEventListener('click',()=>recalcularFichaAutomatica({restaurar:true,salvar:true}));

document.querySelectorAll('.tabs button').forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b===btn));
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.id===`tab-${btn.dataset.tab}`));
});

function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function btnDel(arr,id){ return `<button data-del="${id}">✕</button>`; }

$('addPericia').onclick=()=>{ ficha.pericias.push({id:uid(),nome:'Nova perícia',bonus:0}); renderPericias(); salvarFicha(); };
function renderPericias(){
  $('listaPericias').innerHTML=(ficha?.pericias||[]).map(p=>`<div class="row" data-id="${p.id}"><input data-k="nome" value="${esc(p.nome)}"><input data-k="bonus" type="number" value="${n(p.bonus)}"><button data-roll>🎲 Rolar</button>${btnDel('pericias',p.id)}</div>`).join('')||'<p class="muted">Nenhuma perícia cadastrada.</p>';
  bindRows('listaPericias','pericias');
}

$('addAtaque').onclick=()=>{ ficha.ataques.push({id:uid(),nome:'Novo ataque',teste:'1d20+0',dano:'1d6',critico:'20'}); renderAtaques(); salvarFicha(); };
function renderAtaques(){
  $('listaAtaques').innerHTML=(ficha?.ataques||[]).map(a=>`<div class="row attack" data-id="${a.id}"><input data-k="nome" value="${esc(a.nome)}"><input data-k="teste" value="${esc(a.teste)}"><input data-k="dano" value="${esc(a.dano)}"><input data-k="critico" value="${esc(a.critico)}"><button data-attack>⚔️ Atacar</button>${btnDel('ataques',a.id)}</div>`).join('')||'<p>Nenhum ataque cadastrado.</p>';
  bindRows('listaAtaques','ataques');
}

$('addHabilidade').onclick=()=>{ ficha.habilidades.push({id:uid(),nome:'Nova habilidade',custoPE:1,tipo:'proximo_ataque',bonusTeste:0,bonusDano:0,ativa:false}); renderHabilidades(); salvarFicha(); };
function renderHabilidades(){
  $('listaHabilidades').innerHTML=(ficha?.habilidades||[]).map(h=>`<div class="row ability ability-card ${h.ativa?'active':''}" data-id="${h.id}">
  <input class="ability-toggle" data-toggle type="checkbox" ${h.ativa?'checked':''} ${h.tipo==='passiva'?'checked disabled':''}>
  <input data-k="nome" value="${esc(h.nome)}">
  <input data-k="custoPE" type="number" min="0" value="${n(h.custoPE)}" title="Custo PE">
  <select data-k="tipo"><option value="instantanea" ${h.tipo==='instantanea'?'selected':''}>Instantânea</option><option value="proximo_ataque" ${h.tipo==='proximo_ataque'?'selected':''}>Próximo ataque</option><option value="sustentada" ${h.tipo==='sustentada'?'selected':''}>Sustentada</option><option value="manual" ${h.tipo==='manual'?'selected':''}>Manual</option><option value="reacao" ${h.tipo==='reacao'?'selected':''}>Reação</option><option value="passiva" ${h.tipo==='passiva'?'selected':''}>Passiva</option></select>
  <input data-k="bonusTeste" type="number" value="${n(h.bonusTeste)}" title="Bônus teste">
  <input data-k="bonusDano" type="number" value="${n(h.bonusDano)}" title="Bônus dano">
  ${btnDel('habilidades',h.id)}</div>`).join('')||'<p>Nenhuma habilidade cadastrada.</p>';
  bindRows('listaHabilidades','habilidades');
}

$('addItem').onclick=()=>{ ficha.inventario.push({id:uid(),nome:'Novo item',qtd:1}); renderInventario(); salvarFicha(); };
function renderInventario(){ $('listaInventario').innerHTML=(ficha?.inventario||[]).map(i=>`<div class="row item" data-id="${i.id}"><input data-k="nome" value="${esc(i.nome)}"><input data-k="qtd" type="number" value="${n(i.qtd,1)}">${btnDel('inventario',i.id)}</div>`).join('')||'<p>Inventário vazio.</p>'; bindRows('listaInventario','inventario'); }
$('addRitual').onclick=()=>{ ficha.rituais.push({id:uid(),nome:'Novo ritual',circulo:1,custoPE:1}); renderRituais(); salvarFicha(); };
function renderRituais(){ $('listaRituais').innerHTML=(ficha?.rituais||[]).map(r=>`<div class="row ritual" data-id="${r.id}"><input data-k="nome" value="${esc(r.nome)}"><input data-k="circulo" type="number" value="${n(r.circulo,1)}"><input data-k="custoPE" type="number" value="${n(r.custoPE,1)}"><button data-ritual>✦ Conjurar</button>${btnDel('rituais',r.id)}</div>`).join('')||'<p>Nenhum ritual cadastrado.</p>'; bindRows('listaRituais','rituais'); }

function bindRows(containerId,arrayKey){
  const root=$(containerId);
  root.querySelectorAll('[data-id]').forEach(row=>{
    const id=row.dataset.id;
    row.querySelectorAll('[data-k]').forEach(inp=>inp.oninput=()=>{ const o=ficha[arrayKey].find(x=>x.id===id); if(!o)return; const k=inp.dataset.k; o[k]=inp.type==='number'?n(inp.value):inp.value; agendarSalvar(); });
    const del=row.querySelector('[data-del]'); if(del) del.onclick=()=>{ ficha[arrayKey]=ficha[arrayKey].filter(x=>x.id!==id); ({pericias:renderPericias,ataques:renderAtaques,habilidades:renderHabilidades,inventario:renderInventario,rituais:renderRituais}[arrayKey])(); salvarFicha(); };
    const roll=row.querySelector('[data-roll]'); if(roll) roll.onclick=()=>rolarPericia(id);
    const att=row.querySelector('[data-attack]'); if(att) att.onclick=()=>executarAtaque(id);
    const tog=row.querySelector('[data-toggle]'); if(tog) tog.onchange=()=>alternarHabilidade(id,tog.checked);
    const rit=row.querySelector('[data-ritual]'); if(rit) rit.onclick=()=>conjurarRitual(id);
  });
}

function rolarPericia(id){ const p=ficha.pericias.find(x=>x.id===id); if(!p)return; const expr=`1d20${n(p.bonus)>=0?'+':''}${n(p.bonus)}`; socket.emit('rolarDado',{expressao:expr,contexto:p.nome}); toast(`${p.nome}: ${expr}`); }
function alternarHabilidade(id,ativar){
  const h=ficha.habilidades.find(x=>x.id===id); if(!h)return;
  if(h.tipo==='passiva'){ h.ativa=true; renderHabilidades(); return; }
  if(ativar){
    const custo=Math.max(0,n(h.custoPE));
    if(n(ficha.pe)<custo){ toast(`PE insuficiente. Necessário ${custo}, disponível ${n(ficha.pe)}.`,'error'); h.ativa=false; renderHabilidades(); return; }
    ficha.pe=Math.max(0,n(ficha.pe)-custo); $('pe').value=ficha.pe; atualizarVisualFicha();
    if(h.tipo==='instantanea'||h.tipo==='reacao'){ h.ativa=false; toast(`${h.nome}: -${custo} PE`); }
    else { h.ativa=true; toast(`${h.nome} ativada: -${custo} PE`); }
  } else h.ativa=false;
  renderHabilidades(); salvarFicha();
}
function executarAtaque(id){
  const a=ficha.ataques.find(x=>x.id===id); if(!a)return;
  const ativas=(ficha.habilidades||[]).filter(h=>h.ativa && (h.tipo==='proximo_ataque'||h.tipo==='sustentada'||h.tipo==='manual'||h.tipo==='passiva'));
  const bonusTeste=ativas.reduce((s,h)=>s+n(h.bonusTeste),0); const bonusDano=ativas.reduce((s,h)=>s+n(h.bonusDano),0);
  const teste=aplicarBonus(a.teste,bonusTeste); const dano=aplicarBonus(a.dano,bonusDano);
  socket.emit('rolarDado',{expressao:`Teste ${teste} | Dano ${dano}`,contexto:a.nome});
  const consumidas=ativas.filter(h=>h.tipo==='proximo_ataque'); consumidas.forEach(h=>h.ativa=false);
  if(consumidas.length) toast(`Ataque realizado. ${consumidas.map(h=>h.nome).join(', ')} desativada após o ataque.`); else toast(`${a.nome}: ${teste} | ${dano}`);
  renderHabilidades(); salvarFicha();
}
function aplicarBonus(expr,bonus){ const e=String(expr||'').trim()||'1d20'; if(!bonus)return e; return `${e}${bonus>=0?'+':''}${bonus}`; }
function conjurarRitual(id){ const r=ficha.rituais.find(x=>x.id===id); if(!r)return; const custo=Math.max(0,n(r.custoPE)); if(n(ficha.pe)<custo)return toast(`PE insuficiente para ${r.nome}.`,'error'); ficha.pe-=custo; $('pe').value=ficha.pe; atualizarVisualFicha(); socket.emit('rolarDado',{expressao:`-${custo} PE`,contexto:`Ritual: ${r.nome}`}); toast(`${r.nome}: -${custo} PE`); salvarFicha(); }

// ===== CENAS =====
function cenaAtual(){ return cenas.find(c=>c.id===cenaAtualId)||null; }
function atualizarCenasUI(){
  const sel=$('cenaSelect'); if(!sel)return;
  sel.innerHTML=(cenas||[]).map(c=>`<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
  sel.value=cenaAtualId;
  const c=cenaAtual(); $('cenaNomeAtual').textContent=c?.nome||'Cena';
  if($('renomearCenaNome')) $('renomearCenaNome').value=c?.nome||'';
}
$('cenaSelect')?.addEventListener('change',e=>{
  if(sessao.perfil!=='mestre'){ e.target.value=cenaAtualId; return toast('Somente o Mestre troca a cena para todos.','error'); }
  socket.emit('trocarCena',{id:e.target.value});
});
$('btnCriarCena')?.addEventListener('click',()=>{
  const nome=$('novaCenaNome').value.trim()||`Cena ${cenas.length+1}`;
  socket.emit('criarCena',{nome}); $('novaCenaNome').value='';
});
$('btnRenomearCena')?.addEventListener('click',()=>{ const nome=$('renomearCenaNome').value.trim(); if(nome) socket.emit('renomearCena',{id:cenaAtualId,nome}); });
$('btnRemoverCena')?.addEventListener('click',()=>{ if(cenas.length<=1)return toast('É preciso manter pelo menos uma cena.','error'); if(confirm('Excluir esta cena e os tokens dela?'))socket.emit('removerCena',{id:cenaAtualId}); });

$('btnSalvarMapa').onclick=()=>{ const original=$('mapUrl').value.trim(); const url=converterLinkImagem(original); $('mapUrl').value=url; socket.emit('salvarMapa',{url,largura:n($('mapW').value,1600),altura:n($('mapH').value,900)}); toast(original!==url?'Mapa salvo. Link do Google Drive convertido automaticamente.':'Mapa salvo nesta cena.'); };
$('btnCriarToken').onclick=()=>{
  const original=$('tokenImagem').value.trim();
  const bordaOriginal=$('tokenBorda')?.value.trim()||'';
  const imagem=converterLinkImagem(original), borda=converterLinkImagem(bordaOriginal);
  $('tokenImagem').value=imagem; if($('tokenBorda'))$('tokenBorda').value=borda;
  const oculto=!!$('tokenOculto')?.checked;
  socket.emit('criarToken',{nome:$('tokenNome').value,dono:$('tokenDono').value,imagem,borda,tamanho:n($('tokenTamanho').value,72),oculto});
  toast(oculto?'Token criado oculto para os jogadores.':(borda?'Token criado com borda PNG.':(original && original!==imagem?'Token criado. Link do Google Drive convertido automaticamente.':'Token criado nesta cena.')));
};
$('zoomMais').onclick=()=>{zoom=Math.min(2.5,zoom+.1);aplicarZoom();}; $('zoomMenos').onclick=()=>{zoom=Math.max(.35,zoom-.1);aplicarZoom();}; $('zoomReset').onclick=()=>{zoom=1;aplicarZoom();};
function aplicarMapa(){ const s=$('mapStage'); s.style.width=`${mapa.largura}px`; s.style.height=`${mapa.altura}px`; const mapImg=converterLinkImagem(mapa.url); s.style.backgroundImage=mapImg?`url("${mapImg.replace(/"/g,'%22')}")`:'none'; $('mapUrl').value=mapa.url||''; $('mapW').value=mapa.largura||1600; $('mapH').value=mapa.altura||900; aplicarZoom(); }
function aplicarZoom(){ $('mapStage').style.transform=`scale(${zoom})`; $('zoomReset').textContent=`${Math.round(zoom*100)}%`; }
function normalizarNomeToken(v){
  return String(v||'').trim().toLocaleLowerCase('pt-BR');
}
function podeMoverToken(t){
  if(sessao.perfil==='mestre') return true;
  return !!t?.dono && normalizarNomeToken(t.dono)===normalizarNomeToken(sessao.nome);
}
function renderTokens(){
  const s=$('mapStage');
  s.querySelectorAll('.token').forEach(e=>e.remove());
  tokens.forEach(t=>{
    if(sessao.perfil!=='mestre' && t.oculto) return;
    const el=document.createElement('div');
    const permitido=podeMoverToken(t);
    el.className='token'+(normalizarNomeToken(t.dono)===normalizarNomeToken(sessao.nome)?' mine':'')+(permitido?' movable':' locked')+(t.oculto&&sessao.perfil==='mestre'?' token-hidden-master':'');
    el.style.left=n(t.x)+'px'; el.style.top=n(t.y)+'px';
    el.style.width=n(t.tamanho,72)+'px'; el.style.height=n(t.tamanho,72)+'px';
    el.dataset.id=t.id; el.dataset.movable=permitido?'1':'0';
    el.title=t.oculto&&sessao.perfil==='mestre'?`${t.nome} — OCULTO DOS JOGADORES`:(permitido?`${t.nome} — arraste para mover`:`${t.nome}${t.dono?' — pertence a '+t.dono:' — sem dono'}`);
    const tokenImg=converterLinkImagem(t.imagem);
    const tokenBorda=converterLinkImagem(t.borda);
    if(!tokenBorda) el.classList.add('no-png-frame');
    const retrato=tokenImg
      ? `<img class="token-art" draggable="false" src="${esc(tokenImg)}" alt="${esc(t.nome)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="token-fallback" style="display:none">${esc(t.nome)}</span>`
      : `<span class="token-fallback">${esc(t.nome)}</span>`;
    const frame=tokenBorda?`<img class="token-frame" draggable="false" src="${esc(tokenBorda)}" alt="" aria-hidden="true" onerror="this.style.display='none'">`:'';
    el.innerHTML=`<div class="token-media">${retrato}${frame}</div>`+(sessao.perfil==='mestre'?`<button class="token-eye" type="button" title="${t.oculto?'Mostrar aos jogadores':'Ocultar dos jogadores'}">${t.oculto?'🙈':'👁'}</button>`:'');
    s.appendChild(el);
    if(sessao.perfil==='mestre'){
      const eye=el.querySelector('.token-eye');
      eye?.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();});
      eye?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();socket.emit('alterarVisibilidadeToken',{id:t.id,oculto:!t.oculto});toast(!t.oculto?`${t.nome} ficou oculto para os jogadores.`:`${t.nome} ficou visível para os jogadores.`);});
    }
    ativarDrag(el,t);
  });
}
function ativarDrag(el,t){
  let drag=null;
  const mover=e=>{
    if(!drag || e.pointerId!==drag.pointerId)return;
    e.preventDefault();
    const nx=drag.x+(e.clientX-drag.mx)/zoom;
    const ny=drag.y+(e.clientY-drag.my)/zoom;
    drag.nx=nx; drag.ny=ny;
    el.style.left=nx+'px'; el.style.top=ny+'px';
  };
  const finalizar=e=>{
    if(!drag || (e.pointerId!=null && e.pointerId!==drag.pointerId))return;
    const nx=Number.isFinite(drag.nx)?drag.nx:drag.x;
    const ny=Number.isFinite(drag.ny)?drag.ny:drag.y;
    socket.emit('moverToken',{id:t.id,x:nx,y:ny});
    try{ if(el.hasPointerCapture?.(drag.pointerId)) el.releasePointerCapture(drag.pointerId); }catch(_){ }
    drag=null;
    document.removeEventListener('pointermove',mover,true);
    document.removeEventListener('pointerup',finalizar,true);
    document.removeEventListener('pointercancel',finalizar,true);
  };
  el.addEventListener('dragstart',e=>e.preventDefault());
  el.addEventListener('pointerdown',e=>{
    if(!podeMoverToken(t)){
      toast(t.dono?`Este token pertence a ${t.dono}.`:'Este token não tem dono.','error');
      return;
    }
    if(e.button!==undefined && e.button!==0)return;
    e.preventDefault(); e.stopPropagation();
    const atual=tokens.find(x=>x.id===t.id)||t;
    drag={pointerId:e.pointerId,mx:e.clientX,my:e.clientY,x:n(atual.x),y:n(atual.y),nx:n(atual.x),ny:n(atual.y)};
    try{ el.setPointerCapture?.(e.pointerId); }catch(_){ }
    document.addEventListener('pointermove',mover,true);
    document.addEventListener('pointerup',finalizar,true);
    document.addEventListener('pointercancel',finalizar,true);
  });
  if(sessao.perfil==='mestre') el.ondblclick=()=>{ if(confirm(`Remover ${t.nome}?`))socket.emit('removerToken',t.id); };
}

// ===== NEBLINA / ESCURIDÃO =====
function renderMascaras(){
  const stage=$('mapStage'); if(!stage)return;
  stage.querySelectorAll('.visibility-mask,.mask-preview').forEach(e=>e.remove());
  (mascaras||[]).forEach(m=>{
    const el=document.createElement('div');
    el.className=`visibility-mask mask-${m.tipo||'fog'} ${sessao.perfil==='mestre'?'master-mask':''}`;
    el.style.left=n(m.x)+'px'; el.style.top=n(m.y)+'px'; el.style.width=n(m.w)+'px'; el.style.height=n(m.h)+'px';
    el.style.setProperty('--mask-opacity',Math.max(.1,Math.min(1,n(m.opacidade,m.tipo==='dim'?.5:.94))));
    el.dataset.id=m.id;
    if(sessao.perfil==='mestre'){
      el.title='Dois cliques para remover esta área';
      el.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();socket.emit('removerMascara',m.id);});
    }
    stage.appendChild(el);
  });
}
function ativarModoMascara(tipo){
  if(sessao.perfil!=='mestre')return;
  modoMascara=tipo;
  $('mapStage')?.classList.add('mask-drawing');
  $('btnFogMode')?.classList.toggle('active-mask-tool',tipo==='fog');
  $('btnDimMode')?.classList.toggle('active-mask-tool',tipo==='dim');
  toast(tipo==='fog'?'Arraste no mapa para criar a neblina.':'Arraste no mapa para escurecer uma área.');
}
function cancelarModoMascara(){
  modoMascara=''; desenhoMascara=null;
  $('mapStage')?.classList.remove('mask-drawing');
  $('btnFogMode')?.classList.remove('active-mask-tool'); $('btnDimMode')?.classList.remove('active-mask-tool');
  $('mapStage')?.querySelectorAll('.mask-preview').forEach(e=>e.remove());
}
$('btnFogMode')?.addEventListener('click',()=>ativarModoMascara('fog'));
$('btnDimMode')?.addEventListener('click',()=>ativarModoMascara('dim'));
$('btnCancelarMask')?.addEventListener('click',cancelarModoMascara);
$('btnLimparMascaras')?.addEventListener('click',()=>{if(confirm('Remover toda a neblina e escuridão desta cena?'))socket.emit('limparMascaras');});

function coordenadaNoMapa(e){
  const stage=$('mapStage'); const r=stage.getBoundingClientRect();
  return {x:Math.max(0,(e.clientX-r.left)/zoom),y:Math.max(0,(e.clientY-r.top)/zoom)};
}
$('mapStage')?.addEventListener('pointerdown',e=>{
  if(sessao.perfil!=='mestre'||!modoMascara)return;
  if(e.button!==undefined&&e.button!==0)return;
  if(e.target.closest('.token'))return;
  e.preventDefault(); e.stopPropagation();
  const p=coordenadaNoMapa(e); const stage=$('mapStage');
  const preview=document.createElement('div'); preview.className=`mask-preview mask-${modoMascara}`;
  preview.style.left=p.x+'px';preview.style.top=p.y+'px';preview.style.width='1px';preview.style.height='1px';
  const op=Math.max(.15,Math.min(1,n($('maskOpacity')?.value,.9))); preview.style.setProperty('--mask-opacity',op*.45);
  stage.appendChild(preview);
  desenhoMascara={pointerId:e.pointerId,tipo:modoMascara,x0:p.x,y0:p.y,preview,opacidade:op};
  try{stage.setPointerCapture?.(e.pointerId)}catch(_){}
});
$('mapStage')?.addEventListener('pointermove',e=>{
  if(!desenhoMascara||e.pointerId!==desenhoMascara.pointerId)return;
  e.preventDefault(); const p=coordenadaNoMapa(e); const d=desenhoMascara;
  const x=Math.min(d.x0,p.x),y=Math.min(d.y0,p.y),w=Math.abs(p.x-d.x0),h=Math.abs(p.y-d.y0);
  d.preview.style.left=x+'px';d.preview.style.top=y+'px';d.preview.style.width=w+'px';d.preview.style.height=h+'px';
});
function finalizarMascara(e){
  if(!desenhoMascara||e.pointerId!==desenhoMascara.pointerId)return;
  const d=desenhoMascara,p=coordenadaNoMapa(e); desenhoMascara=null;
  const x=Math.min(d.x0,p.x),y=Math.min(d.y0,p.y),w=Math.abs(p.x-d.x0),h=Math.abs(p.y-d.y0); d.preview.remove();
  if(w>=8&&h>=8)socket.emit('adicionarMascara',{tipo:d.tipo,x,y,w,h,opacidade:d.opacidade});
}
$('mapStage')?.addEventListener('pointerup',finalizarMascara);
$('mapStage')?.addEventListener('pointercancel',e=>{if(desenhoMascara?.preview)desenhoMascara.preview.remove();desenhoMascara=null;});

// ===== TRILHA SONORA SINCRONIZADA =====
function aplicarTrilhaCenaNosControles(trilha){
  const t=trilha||cenaAtual()?.trilha||{};
  if($('trilhaUrl')) $('trilhaUrl').value=t.url||'';
  if($('trilhaVolume')) $('trilhaVolume').value=n(t.volume,.55);
  if($('trilhaLoop')) $('trilhaLoop').checked=t.loop!==false;
}
$('btnAtivarAudio')?.addEventListener('click',async()=>{
  const a=$('audioTrilha');
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(Ctx){ window.__ordemAudioCtx=window.__ordemAudioCtx||new Ctx(); await window.__ordemAudioCtx.resume(); }
    // Reprodução silenciosa iniciada pelo clique do usuário para liberar HTMLMediaElement.
    a.muted=true;
    a.src='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    try{ await a.play(); }catch(_){ }
    a.pause(); try{a.currentTime=0}catch(_){ }
    a.removeAttribute('src'); a.load(); a.muted=false;
    audioDesbloqueado=true;
    $('btnAtivarAudio').classList.add('ready'); $('btnAtivarAudio').textContent='🔊 ÁUDIO ATIVO';
    toast('Áudio liberado neste dispositivo.');
  }catch(_){
    audioDesbloqueado=true;
    $('btnAtivarAudio').classList.add('ready'); $('btnAtivarAudio').textContent='🔊 ÁUDIO PRONTO';
    toast('Áudio preparado.');
  }
});
$('btnSalvarTrilha')?.addEventListener('click',()=>{
  const url=converterLinkMidia($('trilhaUrl').value.trim()); $('trilhaUrl').value=url;
  socket.emit('salvarTrilhaCena',{url,volume:n($('trilhaVolume').value,.55),loop:$('trilhaLoop').checked}); toast('Trilha salva nesta cena.');
});
$('btnPlayTrilha')?.addEventListener('click',()=>{
  const url=converterLinkMidia($('trilhaUrl').value.trim()); if(!url)return toast('Informe a URL da trilha.','error');
  socket.emit('salvarTrilhaCena',{url,volume:n($('trilhaVolume').value,.55),loop:$('trilhaLoop').checked});
  socket.emit('audioControle',{acao:'play',url,volume:n($('trilhaVolume').value,.55),loop:$('trilhaLoop').checked,offset:0});
});
$('btnPauseTrilha')?.addEventListener('click',()=>socket.emit('audioControle',{acao:'pause',offset:$('audioTrilha').currentTime||0}));
$('btnStopTrilha')?.addEventListener('click',()=>socket.emit('audioControle',{acao:'stop'}));
$('trilhaVolume')?.addEventListener('input',()=>{ $('audioTrilha').volume=n($('trilhaVolume').value,.55); if(sessao.perfil==='mestre')socket.emit('audioControle',{acao:'volume',volume:n($('trilhaVolume').value,.55)}); });
function aplicarAudioComando(cmd){
  audioState={...audioState,...cmd}; const a=$('audioTrilha'); if(!a)return;
  a.volume=Math.max(0,Math.min(1,n(cmd.volume,.55))); a.loop=cmd.loop!==false;
  if(cmd.acao==='stop'){ a.pause(); try{a.currentTime=0}catch(_){} return; }
  if(cmd.acao==='pause'){ a.pause(); if(Number.isFinite(n(cmd.offset,NaN))) try{a.currentTime=Math.max(0,n(cmd.offset))}catch(_){} return; }
  if(cmd.acao==='volume') return;
  if(cmd.acao==='play' && cmd.url){
    const url=converterLinkMidia(cmd.url);
    const atual=a.getAttribute('src')||'';
    if(atual!==url){ a.src=url; a.load(); }
    a.onerror=()=>toast('Não foi possível carregar a trilha. Verifique se o arquivo está público e se é MP3/OGG/WAV.','error');
    const elapsed=cmd.startedAt?Math.max(0,((cmd.serverNow||Date.now())-cmd.startedAt)/1000):0;
    const target=Math.max(0,n(cmd.offset)+elapsed);
    const start=()=>{ try{ if(Number.isFinite(a.duration)&&a.duration>0&&a.loop) a.currentTime=target%a.duration; else a.currentTime=target; }catch(_){}; a.play().catch(()=>{ toast('🔇 O navegador bloqueou o som. Clique em “ATIVAR ÁUDIO”.','error'); }); };
    if(a.readyState>=1) start(); else a.onloadedmetadata=()=>{a.onloadedmetadata=null;start();};
  }
}

// ===== CINEMÁTICA PARA TODOS =====
$('btnIniciarCine')?.addEventListener('click',()=>{
  const tipo=$('cineTipo').value; const original=$('cineUrl').value.trim(); if(!original)return toast('Informe a URL da cinematica.','error');
  const url=tipo==='imagem'?converterLinkImagem(original):converterLinkMidia(original); $('cineUrl').value=url;
  socket.emit('iniciarCinematica',{titulo:$('cineTitulo').value.trim()||'CINEMÁTICA',tipo,url,duracao:n($('cineDuracao').value,0)});
});
$('btnPararCine')?.addEventListener('click',()=>socket.emit('encerrarCinematica'));
$('cinematicCloseMaster')?.addEventListener('click',()=>socket.emit('encerrarCinematica'));
function mostrarCinematica(c){
  if(!c?.url)return; clearTimeout(cinematicTimer);
  const ov=$('cinematicOverlay'), video=$('cinematicVideo'), img=$('cinematicImage');
  $('cinematicTitle').textContent=c.titulo||'CINEMÁTICA'; ov.classList.remove('hidden');
  video.pause(); video.removeAttribute('src'); video.load(); img.removeAttribute('src'); video.classList.add('hidden'); img.classList.add('hidden');
  if(c.tipo==='imagem'){
    img.src=converterLinkImagem(c.url); img.classList.remove('hidden');
    if(c.duracao>0) cinematicTimer=setTimeout(()=>{ if(sessao.perfil==='mestre')socket.emit('encerrarCinematica'); else esconderCinematica(); },c.duracao*1000);
  }else{
    video.src=converterLinkMidia(c.url); video.classList.remove('hidden'); video.controls=false; video.volume=1; video.load();
    const aviso=$('cinematicAudioWarning');
    const playVideo=()=>video.play().then(()=>aviso.classList.add('hidden')).catch(()=>{
      aviso.textContent='▶ CLIQUE AQUI PARA REPRODUZIR A CINEMÁTICA COM SOM';
      aviso.classList.remove('hidden'); video.controls=true;
    });
    aviso.onclick=()=>{ video.muted=false; playVideo(); };
    video.onerror=()=>{ aviso.textContent='❌ Não foi possível carregar o vídeo. Verifique se está público e use MP4/WebM.'; aviso.classList.remove('hidden'); };
    if(video.readyState>=2) playVideo(); else video.oncanplay=()=>{video.oncanplay=null;playVideo();};
    video.onended=()=>{ if(sessao.perfil==='mestre')socket.emit('encerrarCinematica'); else esconderCinematica(); };
  }
}
function esconderCinematica(){
  clearTimeout(cinematicTimer); const video=$('cinematicVideo'); video.pause(); video.removeAttribute('src'); video.load(); $('cinematicImage').removeAttribute('src'); $('cinematicOverlay').classList.add('hidden'); $('cinematicAudioWarning').classList.add('hidden');
}

$('btnNovoFichaVisual')?.addEventListener('click',()=>{ $('novaFichaNome')?.focus(); });
