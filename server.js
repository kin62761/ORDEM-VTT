const express = require('express');
const http = require('http');
const path = require('path');
const { Readable } = require('stream');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Proxy de mídia do Google Drive. Isso evita depender do link /uc diretamente no navegador,
// que pode retornar uma página HTML em vez do MP3/MP4.
app.get('/drive-media/:id', async (req, res) => {
  const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) return res.status(400).send('ID inválido');

  const candidates = [
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}&confirm=t`
  ];

  try {
    let upstream = null;
    for (const url of candidates) {
      const headers = { 'User-Agent': 'Mozilla/5.0 ORDEM-VTT/4.5' };
      if (req.headers.range) headers.Range = req.headers.range;
      const r = await fetch(url, { headers, redirect: 'follow' });
      const ct = String(r.headers.get('content-type') || '').toLowerCase();
      if (r.ok && !ct.includes('text/html')) { upstream = r; break; }
    }
    if (!upstream) return res.status(502).send('O Google Drive não liberou o arquivo como mídia. Confirme que está em “Qualquer pessoa com o link”.');

    res.status(upstream.status);
    for (const h of ['content-type','content-length','content-range','accept-ranges','cache-control','etag','last-modified']) {
      const v = upstream.headers.get(h); if (v) res.setHeader(h, v);
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('Erro proxy Drive:', err);
    res.status(502).send('Falha ao carregar mídia do Google Drive.');
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, versao: 'V4.5-CORRIGIDO' }));

const salas = new Map();

function fichaPadrao(nome = '') {
  return {
    jogador: nome, personagem: nome, origem: '', classe: '', trilha: '', nex: 5, defesa: 10,
    pv: 20, pvMax: 20, pe: 10, peMax: 10, san: 20, sanMax: 20,
    atributos: { agi: 1, for: 1, int: 1, pre: 1, vig: 1 },
    pericias: [], ataques: [], habilidades: [], inventario: [], rituais: [], anotacoes: '', updatedAt: Date.now()
  };
}

function cenaPadrao(nome = 'Cena 1') {
  return {
    id: 'cena_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    nome,
    mapa: { url: '', largura: 1600, altura: 900 },
    tokens: [],
    trilha: { url: '', volume: 0.55, loop: true }
  };
}

function salaPadrao() {
  const cena = cenaPadrao('Cena 1');
  return {
    cenas: [cena], cenaAtualId: cena.id,
    fichas: {}, jogadores: {},
    audioState: { url: '', playing: false, offset: 0, startedAt: 0, volume: 0.55, loop: true, cenaId: cena.id },
    cinematica: null,
    audioAntesCinematica: null
  };
}

function getSala(codigo) {
  const key = String(codigo || 'SELO').trim().toUpperCase() || 'SELO';
  if (!salas.has(key)) salas.set(key, salaPadrao());
  return { key, sala: salas.get(key) };
}

function getCenaAtual(sala) {
  let cena = sala.cenas.find(c => c.id === sala.cenaAtualId);
  if (!cena) {
    cena = sala.cenas[0] || cenaPadrao('Cena 1');
    if (!sala.cenas.length) sala.cenas.push(cena);
    sala.cenaAtualId = cena.id;
  }
  return cena;
}

function sanitizeFicha(data, nome) {
  const base = fichaPadrao(nome);
  const f = data && typeof data === 'object' ? data : {};
  return {
    ...base, ...f, jogador: nome,
    atributos: { ...base.atributos, ...(f.atributos || {}) },
    pericias: Array.isArray(f.pericias) ? f.pericias : [],
    ataques: Array.isArray(f.ataques) ? f.ataques : [],
    habilidades: Array.isArray(f.habilidades) ? f.habilidades : [],
    inventario: Array.isArray(f.inventario) ? f.inventario : [],
    rituais: Array.isArray(f.rituais) ? f.rituais : [],
    updatedAt: Date.now()
  };
}

function extrairDriveId(url) {
  const original = String(url || '').trim();
  if (!original) return '';
  try {
    const u = new URL(original);
    const host = u.hostname.toLowerCase();
    if (!host.includes('drive.google.com') && !host.includes('docs.google.com')) return '';
    const m = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || u.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return u.searchParams.get('id') || '';
  } catch (_) { return ''; }
}
function converterLinkImagem(url) {
  const original = String(url || '').trim();
  if (!original) return '';
  const id = extrairDriveId(original);
  return id ? `https://lh3.googleusercontent.com/d/${id}` : original;
}
function converterLinkMidia(url) {
  const original = String(url || '').trim();
  if (!original) return '';
  const id = extrairDriveId(original);
  return id ? `/drive-media/${encodeURIComponent(id)}` : original;
}
function audioOffsetAtual(a) {
  if (!a) return 0;
  if (!a.playing) return Number(a.offset) || 0;
  return (Number(a.offset) || 0) + Math.max(0, (Date.now() - (Number(a.startedAt) || Date.now())) / 1000);
}
function estadoPublico(sala) {
  const cena = getCenaAtual(sala);
  return {
    cenas: sala.cenas,
    cenaAtualId: sala.cenaAtualId,
    mapa: cena.mapa,
    tokens: cena.tokens,
    fichas: sala.fichas,
    jogadores: Object.values(sala.jogadores),
    audioState: sala.audioState,
    cinematica: sala.cinematica,
    serverNow: Date.now()
  };
}
function emitirCena(key, sala) {
  const cena = getCenaAtual(sala);
  io.to(key).emit('cenaAtualizada', {
    cenas: sala.cenas, cenaAtualId: sala.cenaAtualId,
    mapa: cena.mapa, tokens: cena.tokens, trilha: cena.trilha
  });
}

io.on('connection', socket => {
  socket.on('entrarSala', payload => {
    const nome = String(payload?.nome || 'Jogador').trim();
    const perfil = payload?.perfil === 'mestre' ? 'mestre' : 'jogador';
    const { key, sala } = getSala(payload?.sala);
    socket.join(key);
    socket.data.sala = key; socket.data.nome = nome; socket.data.perfil = perfil;
    sala.jogadores[socket.id] = { nome, perfil };
    if (perfil === 'jogador' && !sala.fichas[nome]) sala.fichas[nome] = fichaPadrao(nome);
    socket.emit('estadoInicial', { sala: key, ...estadoPublico(sala) });
    io.to(key).emit('jogadoresAtualizados', Object.values(sala.jogadores));
  });

  socket.on('criarFicha', ({ nome }) => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key); const n = String(nome || '').trim(); if (!n) return;
    if (!sala.fichas[n]) sala.fichas[n] = fichaPadrao(n);
    io.to(key).emit('fichaAtualizada', { nome: n, ficha: sala.fichas[n] });
  });
  socket.on('atualizarFicha', ({ nome, ficha }) => {
    const key = socket.data.sala; if (!key) return;
    const sala = salas.get(key); const alvo = String(nome || socket.data.nome || '').trim(); if (!alvo) return;
    if (socket.data.perfil !== 'mestre' && alvo !== socket.data.nome) return;
    sala.fichas[alvo] = sanitizeFicha(ficha, alvo);
    io.to(key).emit('fichaAtualizada', { nome: alvo, ficha: sala.fichas[alvo] });
  });
  socket.on('rolarDado', ({ expressao, contexto }) => {
    const key = socket.data.sala; if (!key) return;
    io.to(key).emit('rolagemCompartilhada', { jogador: socket.data.nome, expressao: String(expressao || ''), contexto: String(contexto || ''), quando: Date.now() });
  });

  // CENAS
  socket.on('criarCena', payload => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key); const cena = cenaPadrao(String(payload?.nome || `Cena ${sala.cenas.length + 1}`).trim());
    cena.mapa.url = converterLinkImagem(payload?.mapaUrl || '');
    cena.trilha.url = converterLinkMidia(payload?.trilhaUrl || '');
    sala.cenas.push(cena); sala.cenaAtualId = cena.id;
    sala.audioState = { url: cena.trilha.url, playing: false, offset: 0, startedAt: 0, volume: cena.trilha.volume, loop: cena.trilha.loop, cenaId: cena.id };
    emitirCena(key, sala); io.to(key).emit('audioComando', { acao: 'stop', ...sala.audioState, serverNow: Date.now() });
  });
  socket.on('trocarCena', ({ id }) => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key); const cena = sala.cenas.find(c => c.id === id); if (!cena) return;
    sala.cenaAtualId = cena.id;
    sala.audioState = { url: cena.trilha.url || '', playing: false, offset: 0, startedAt: 0, volume: Number(cena.trilha.volume) || 0.55, loop: cena.trilha.loop !== false, cenaId: cena.id };
    emitirCena(key, sala); io.to(key).emit('audioComando', { acao: 'stop', ...sala.audioState, serverNow: Date.now() });
  });
  socket.on('renomearCena', ({ id, nome }) => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key); const cena = sala.cenas.find(c => c.id === id); if (!cena) return;
    cena.nome = String(nome || cena.nome).trim() || cena.nome; emitirCena(key, sala);
  });
  socket.on('removerCena', ({ id }) => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key); if (sala.cenas.length <= 1) return;
    sala.cenas = sala.cenas.filter(c => c.id !== id);
    if (sala.cenaAtualId === id) sala.cenaAtualId = sala.cenas[0].id;
    const cena = getCenaAtual(sala);
    sala.audioState = { url: cena.trilha.url || '', playing: false, offset: 0, startedAt: 0, volume: cena.trilha.volume, loop: cena.trilha.loop, cenaId: cena.id };
    emitirCena(key, sala); io.to(key).emit('audioComando', { acao: 'stop', ...sala.audioState, serverNow: Date.now() });
  });
  socket.on('salvarMapa', mapa => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key); const cena = getCenaAtual(sala);
    cena.mapa = { url: converterLinkImagem(mapa?.url), largura: Number(mapa?.largura) || 1600, altura: Number(mapa?.altura) || 900 };
    emitirCena(key, sala);
  });
  socket.on('salvarTrilhaCena', trilha => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key); const cena = getCenaAtual(sala);
    cena.trilha = { url: converterLinkMidia(trilha?.url), volume: Math.max(0, Math.min(1, Number(trilha?.volume) || 0.55)), loop: trilha?.loop !== false };
    sala.audioState = { ...sala.audioState, url: cena.trilha.url, volume: cena.trilha.volume, loop: cena.trilha.loop, cenaId: cena.id };
    emitirCena(key, sala);
  });

  // TRILHA SONORA SINCRONIZADA
  socket.on('audioControle', payload => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key); const cena = getCenaAtual(sala); const acao = String(payload?.acao || '');
    if (acao === 'play') {
      const url = converterLinkMidia(payload?.url || cena.trilha.url || sala.audioState.url);
      const volume = Math.max(0, Math.min(1, Number(payload?.volume ?? cena.trilha.volume ?? 0.55)));
      const loop = payload?.loop !== false;
      const offset = Math.max(0, Number(payload?.offset) || 0);
      cena.trilha = { url, volume, loop };
      sala.audioState = { url, playing: true, offset, startedAt: Date.now(), volume, loop, cenaId: cena.id };
    } else if (acao === 'pause') {
      sala.audioState.offset = Math.max(0, Number(payload?.offset) || audioOffsetAtual(sala.audioState));
      sala.audioState.playing = false; sala.audioState.startedAt = 0;
    } else if (acao === 'stop') {
      sala.audioState.playing = false; sala.audioState.offset = 0; sala.audioState.startedAt = 0;
    } else if (acao === 'volume') {
      sala.audioState.volume = Math.max(0, Math.min(1, Number(payload?.volume) || 0));
      cena.trilha.volume = sala.audioState.volume;
    }
    io.to(key).emit('audioComando', { acao, ...sala.audioState, serverNow: Date.now() });
  });

  // CINEMÁTICA PARA TODOS
  socket.on('iniciarCinematica', payload => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key);
    const tipo = payload?.tipo === 'imagem' ? 'imagem' : 'video';
    const url = tipo === 'imagem' ? converterLinkImagem(payload?.url) : converterLinkMidia(payload?.url);
    if (!url) return;
    if (sala.audioState.playing) {
      sala.audioAntesCinematica = { ...sala.audioState, offset: audioOffsetAtual(sala.audioState), playing: true };
      sala.audioState.offset = sala.audioAntesCinematica.offset; sala.audioState.playing = false; sala.audioState.startedAt = 0;
      io.to(key).emit('audioComando', { acao: 'pause', ...sala.audioState, serverNow: Date.now() });
    } else sala.audioAntesCinematica = null;
    sala.cinematica = { id: 'cine_' + Date.now(), titulo: String(payload?.titulo || 'CINEMÁTICA'), url, tipo, duracao: Math.max(0, Number(payload?.duracao) || 0), startedAt: Date.now() };
    io.to(key).emit('cinematicaIniciada', { ...sala.cinematica, serverNow: Date.now() });
  });
  socket.on('encerrarCinematica', () => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key); sala.cinematica = null;
    io.to(key).emit('cinematicaEncerrada');
    if (sala.audioAntesCinematica?.url) {
      const a = sala.audioAntesCinematica;
      sala.audioState = { ...a, playing: true, startedAt: Date.now() };
      io.to(key).emit('audioComando', { acao: 'play', ...sala.audioState, serverNow: Date.now() });
    }
    sala.audioAntesCinematica = null;
  });

  // TOKENS POR CENA
  socket.on('criarToken', token => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key); const cena = getCenaAtual(sala);
    const novo = { id: String(Date.now()) + Math.random().toString(16).slice(2), nome: String(token?.nome || 'Token'), dono: String(token?.dono || ''), imagem: converterLinkImagem(token?.imagem), x: Number(token?.x) || 200, y: Number(token?.y) || 200, tamanho: Number(token?.tamanho) || 72 };
    cena.tokens.push(novo); io.to(key).emit('tokensAtualizados', cena.tokens);
  });
  socket.on('moverToken', ({ id, x, y }) => {
    const key = socket.data.sala; if (!key) return;
    const sala = salas.get(key); const cena = getCenaAtual(sala); const t = cena.tokens.find(t => t.id === id); if (!t) return;
    const autorizado = socket.data.perfil === 'mestre' || (t.dono && t.dono === socket.data.nome); if (!autorizado) return;
    t.x = Number(x) || 0; t.y = Number(y) || 0; io.to(key).emit('tokensAtualizados', cena.tokens);
  });
  socket.on('removerToken', id => {
    const key = socket.data.sala; if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key); const cena = getCenaAtual(sala); cena.tokens = cena.tokens.filter(t => t.id !== id); io.to(key).emit('tokensAtualizados', cena.tokens);
  });

  socket.on('disconnect', () => {
    const key = socket.data.sala; if (!key || !salas.has(key)) return;
    const sala = salas.get(key); delete sala.jogadores[socket.id]; io.to(key).emit('jogadoresAtualizados', Object.values(sala.jogadores));
  });
});

server.listen(PORT, () => console.log(`ORDEM VTT V4.5 ativo na porta ${PORT}`));
