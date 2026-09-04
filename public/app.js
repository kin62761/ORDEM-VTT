const socket = io();
const $ = id => document.getElementById(id);
let sessao = { nome:'', sala:'', perfil:'jogador' };
let fichas = {};
let fichaAtualNome = '';
let ficha = null;
let saveTimer = null;
let mapa = { url:'', largura:1600, altura:900 };
let tokens = [];
let zoom = 1;

function toast(msg, tipo='ok'){
  const el=$('toast'); el.textContent=msg; el.className=`toast ${tipo}`; setTimeout(()=>el.className='toast hidden',2400);
}
function n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function pct(atual,max){ max=n(max); atual=n(atual); return max>0?Math.max(0,Math.min(100,(atual/max)*100)):0; }
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
  fichas=estado.fichas||{}; mapa=estado.mapa||mapa; tokens=estado.tokens||[];
  $('loginBox').classList.add('hidden'); $('statusOnline').classList.remove('hidden'); $('app').classList.remove('hidden'); $('mainNav')?.classList.remove('hidden');
  const mestre=sessao.perfil==='mestre';
  $('seletorFichaMestre').classList.toggle('hidden',!mestre); $('masterMapControls').classList.toggle('hidden',!mestre); $('btnNovoFichaVisual')?.classList.toggle('hidden',!mestre);
  if(mestre){ atualizarSelectMestre(); fichaAtualNome=Object.keys(fichas)[0]||''; if(fichaAtualNome) carregarFicha(fichaAtualNome); }
  else { fichaAtualNome=sessao.nome; carregarFicha(fichaAtualNome); }
  aplicarMapa(); renderTokens(); atualizarJogadores(estado.jogadores||[]);
});

socket.on('fichaAtualizada',({nome,ficha:nova})=>{
  fichas[nome]=nova; if(nome===fichaAtualNome){ ficha=nova; preencherFicha(); }
  if(sessao.perfil==='mestre') atualizarSelectMestre();
});
socket.on('mapaAtualizado',m=>{ mapa=m; aplicarMapa(); });
socket.on('tokensAtualizados',t=>{ tokens=t||[]; renderTokens(); });
socket.on('jogadoresAtualizados',atualizarJogadores);
socket.on('rolagemCompartilhada',r=>{ const txt=`${r.jogador}: ${r.contexto||'Rolagem'} → ${r.expressao}`; if($('rolagemLog')) $('rolagemLog').textContent=txt; if($('rolagemLogMapa')) $('rolagemLogMapa').textContent=txt; });

function atualizarJogadores(lista){ $('jogadoresLista').textContent=(lista||[]).map(j=>`${j.nome}${j.perfil==='mestre'?' (Mestre)':''}`).join(', ')||'—'; }
function fichaPadraoLocal(nome){return {jogador:nome,personagem:nome,origem:'',classe:'',trilha:'',nex:5,defesa:10,pv:20,pvMax:20,pe:10,peMax:10,san:20,sanMax:20,atributos:{agi:1,for:1,int:1,pre:1,vig:1},pericias:[],ataques:[],habilidades:[],inventario:[],rituais:[],anotacoes:''};}
function carregarFicha(nome){ fichaAtualNome=nome; ficha=structuredClone(fichas[nome]||fichaPadraoLocal(nome)); preencherFicha(); }
function atualizarSelectMestre(){
  const s=$('fichaMestreSelect'); const atual=fichaAtualNome; s.innerHTML='<option value="">Selecionar ficha...</option>'+Object.keys(fichas).sort().map(nm=>`<option>${esc(nm)}</option>`).join(''); s.value=atual;
}
$('fichaMestreSelect').onchange=e=>{ if(e.target.value) carregarFicha(e.target.value); };
$('btnCriarFicha').onclick=()=>{ const nome=$('novaFichaNome').value.trim(); if(!nome)return; socket.emit('criarFicha',{nome}); $('novaFichaNome').value=''; };

function preencherFicha(){
  if(!ficha)return;
  if($('tituloFicha')) if($('tituloFicha')) $('tituloFicha').textContent=(ficha.personagem||fichaAtualNome||'PERSONAGEM').toUpperCase();
  atualizarVisualFicha();
  for(const id of ['personagem','origem','classe','trilha','nex','defesa','pv','pvMax','pe','peMax','san','sanMax']) $(id).value=ficha[id]??'';
  for(const id of ['agi','for','int','pre','vig']) $(id).value=ficha.atributos?.[id]??0;
  $('anotacoes').value=ficha.anotacoes||'';
  renderPericias(); renderAtaques(); renderHabilidades(); renderInventario(); renderRituais(); atualizarVisualFicha();
}

function lerCamposBase(){
  if(!ficha)return;
  for(const id of ['personagem','origem','classe','trilha']) ficha[id]=$(id).value;
  for(const id of ['nex','defesa','pv','pvMax','pe','peMax','san','sanMax']) ficha[id]=n($(id).value);
  ficha.atributos={}; for(const id of ['agi','for','int','pre','vig']) ficha.atributos[id]=n($(id).value);
  ficha.anotacoes=$('anotacoes').value;
  if($('tituloFicha')) if($('tituloFicha')) $('tituloFicha').textContent=(ficha.personagem||fichaAtualNome||'PERSONAGEM').toUpperCase();
  atualizarVisualFicha();
}
function agendarSalvar(){ clearTimeout(saveTimer); saveTimer=setTimeout(salvarFicha,220); }
function salvarFicha(){ if(!ficha||!fichaAtualNome)return; lerCamposBase(); socket.emit('atualizarFicha',{nome:fichaAtualNome,ficha}); }
['personagem','origem','classe','trilha','nex','defesa','pv','pvMax','pe','peMax','san','sanMax','agi','for','int','pre','vig','anotacoes'].forEach(id=>$(id).addEventListener('input',agendarSalvar));

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

$('btnSalvarMapa').onclick=()=>socket.emit('salvarMapa',{url:$('mapUrl').value,largura:n($('mapW').value,1600),altura:n($('mapH').value,900)});
$('btnCriarToken').onclick=()=>socket.emit('criarToken',{nome:$('tokenNome').value,dono:$('tokenDono').value,imagem:$('tokenImagem').value,tamanho:n($('tokenTamanho').value,72)});
$('zoomMais').onclick=()=>{zoom=Math.min(2.5,zoom+.1);aplicarZoom();}; $('zoomMenos').onclick=()=>{zoom=Math.max(.35,zoom-.1);aplicarZoom();}; $('zoomReset').onclick=()=>{zoom=1;aplicarZoom();};
function aplicarMapa(){ const s=$('mapStage'); s.style.width=`${mapa.largura}px`; s.style.height=`${mapa.altura}px`; s.style.backgroundImage=mapa.url?`url("${mapa.url.replace(/"/g,'%22')}")`:'none'; $('mapUrl').value=mapa.url||''; $('mapW').value=mapa.largura||1600; $('mapH').value=mapa.altura||900; aplicarZoom(); }
function aplicarZoom(){ $('mapStage').style.transform=`scale(${zoom})`; $('zoomReset').textContent=`${Math.round(zoom*100)}%`; }
function renderTokens(){
  const s=$('mapStage'); s.querySelectorAll('.token').forEach(e=>e.remove());
  tokens.forEach(t=>{ const el=document.createElement('div'); el.className='token'+(t.dono===sessao.nome?' mine':''); el.style.left=t.x+'px'; el.style.top=t.y+'px'; el.style.width=t.tamanho+'px'; el.style.height=t.tamanho+'px'; el.dataset.id=t.id; el.innerHTML=t.imagem?`<img src="${esc(t.imagem)}">`:`<span>${esc(t.nome)}</span>`; s.appendChild(el); ativarDrag(el,t); });
}
function ativarDrag(el,t){
  let start=null; el.onpointerdown=e=>{ const permitido=sessao.perfil==='mestre'||t.dono===sessao.nome; if(!permitido)return; el.setPointerCapture(e.pointerId); start={mx:e.clientX,my:e.clientY,x:t.x,y:t.y}; };
  el.onpointermove=e=>{ if(!start)return; const nx=start.x+(e.clientX-start.mx)/zoom, ny=start.y+(e.clientY-start.my)/zoom; el.style.left=nx+'px'; el.style.top=ny+'px'; };
  el.onpointerup=e=>{ if(!start)return; const nx=start.x+(e.clientX-start.mx)/zoom, ny=start.y+(e.clientY-start.my)/zoom; socket.emit('moverToken',{id:t.id,x:nx,y:ny}); start=null; };
  if(sessao.perfil==='mestre') el.ondblclick=()=>{ if(confirm(`Remover ${t.nome}?`))socket.emit('removerToken',t.id); };
}

$('btnNovoFichaVisual')?.addEventListener('click',()=>{ $('novaFichaNome')?.focus(); });
