const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, versao: 'V4-FICHA-AUTOMATICA' }));

const salas = new Map();

function fichaPadrao(nome = '') {
  return {
    jogador: nome,
    personagem: nome,
    origem: '',
    classe: '',
    trilha: '',
    nex: 5,
    defesa: 10,
    pv: 20,
    pvMax: 20,
    pe: 10,
    peMax: 10,
    san: 20,
    sanMax: 20,
    atributos: { agi: 1, for: 1, int: 1, pre: 1, vig: 1 },
    pericias: [],
    ataques: [],
    habilidades: [],
    inventario: [],
    rituais: [],
    anotacoes: '',
    updatedAt: Date.now()
  };
}

function salaPadrao() {
  return {
    mapa: { url: '', largura: 1600, altura: 900 },
    tokens: [],
    fichas: {},
    jogadores: {}
  };
}

function getSala(codigo) {
  const key = String(codigo || 'SELO').trim().toUpperCase() || 'SELO';
  if (!salas.has(key)) salas.set(key, salaPadrao());
  return { key, sala: salas.get(key) };
}

function sanitizeFicha(data, nome) {
  const base = fichaPadrao(nome);
  const f = data && typeof data === 'object' ? data : {};
  return {
    ...base,
    ...f,
    jogador: nome,
    atributos: { ...base.atributos, ...(f.atributos || {}) },
    pericias: Array.isArray(f.pericias) ? f.pericias : [],
    ataques: Array.isArray(f.ataques) ? f.ataques : [],
    habilidades: Array.isArray(f.habilidades) ? f.habilidades : [],
    inventario: Array.isArray(f.inventario) ? f.inventario : [],
    rituais: Array.isArray(f.rituais) ? f.rituais : [],
    updatedAt: Date.now()
  };
}

io.on('connection', socket => {
  socket.on('entrarSala', payload => {
    const nome = String(payload?.nome || 'Jogador').trim();
    const perfil = payload?.perfil === 'mestre' ? 'mestre' : 'jogador';
    const { key, sala } = getSala(payload?.sala);

    socket.join(key);
    socket.data.sala = key;
    socket.data.nome = nome;
    socket.data.perfil = perfil;
    sala.jogadores[socket.id] = { nome, perfil };

    if (perfil === 'jogador' && !sala.fichas[nome]) sala.fichas[nome] = fichaPadrao(nome);

    socket.emit('estadoInicial', {
      sala: key,
      mapa: sala.mapa,
      tokens: sala.tokens,
      fichas: sala.fichas,
      jogadores: Object.values(sala.jogadores)
    });
    io.to(key).emit('jogadoresAtualizados', Object.values(sala.jogadores));
  });

  socket.on('criarFicha', ({ nome }) => {
    const key = socket.data.sala;
    if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key);
    const n = String(nome || '').trim();
    if (!n) return;
    if (!sala.fichas[n]) sala.fichas[n] = fichaPadrao(n);
    io.to(key).emit('fichaAtualizada', { nome: n, ficha: sala.fichas[n] });
  });

  socket.on('atualizarFicha', ({ nome, ficha }) => {
    const key = socket.data.sala;
    if (!key) return;
    const sala = salas.get(key);
    const alvo = String(nome || socket.data.nome || '').trim();
    if (!alvo) return;
    if (socket.data.perfil !== 'mestre' && alvo !== socket.data.nome) return;
    sala.fichas[alvo] = sanitizeFicha(ficha, alvo);
    io.to(key).emit('fichaAtualizada', { nome: alvo, ficha: sala.fichas[alvo] });
  });

  socket.on('rolarDado', ({ expressao, contexto }) => {
    const key = socket.data.sala;
    if (!key) return;
    io.to(key).emit('rolagemCompartilhada', {
      jogador: socket.data.nome,
      expressao: String(expressao || ''),
      contexto: String(contexto || ''),
      quando: Date.now()
    });
  });

  socket.on('salvarMapa', mapa => {
    const key = socket.data.sala;
    if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key);
    sala.mapa = {
      url: String(mapa?.url || ''),
      largura: Number(mapa?.largura) || 1600,
      altura: Number(mapa?.altura) || 900
    };
    io.to(key).emit('mapaAtualizado', sala.mapa);
  });

  socket.on('criarToken', token => {
    const key = socket.data.sala;
    if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key);
    const novo = {
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      nome: String(token?.nome || 'Token'),
      dono: String(token?.dono || ''),
      imagem: String(token?.imagem || ''),
      x: Number(token?.x) || 200,
      y: Number(token?.y) || 200,
      tamanho: Number(token?.tamanho) || 72
    };
    sala.tokens.push(novo);
    io.to(key).emit('tokensAtualizados', sala.tokens);
  });

  socket.on('moverToken', ({ id, x, y }) => {
    const key = socket.data.sala;
    if (!key) return;
    const sala = salas.get(key);
    const t = sala.tokens.find(t => t.id === id);
    if (!t) return;
    const autorizado = socket.data.perfil === 'mestre' || (t.dono && t.dono === socket.data.nome);
    if (!autorizado) return;
    t.x = Number(x) || 0;
    t.y = Number(y) || 0;
    io.to(key).emit('tokensAtualizados', sala.tokens);
  });

  socket.on('removerToken', id => {
    const key = socket.data.sala;
    if (!key || socket.data.perfil !== 'mestre') return;
    const sala = salas.get(key);
    sala.tokens = sala.tokens.filter(t => t.id !== id);
    io.to(key).emit('tokensAtualizados', sala.tokens);
  });

  socket.on('disconnect', () => {
    const key = socket.data.sala;
    if (!key || !salas.has(key)) return;
    const sala = salas.get(key);
    delete sala.jogadores[socket.id];
    io.to(key).emit('jogadoresAtualizados', Object.values(sala.jogadores));
  });
});

server.listen(PORT, () => console.log(`ORDEM VTT V4 ativo na porta ${PORT}`));
