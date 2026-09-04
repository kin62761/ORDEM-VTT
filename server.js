const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

const salas = {};

function chaveNome(nome) {
  return String(nome || "").trim().toLowerCase();
}
function fichaPadrao(nome) {
  return {
    donoNome: nome,
    personagem: nome,
    classe: "",
    trilha: "",
    origem: "",
    nex: 5,
    defesa: 10,
    pv: 20, pvMax: 20,
    pe: 10, peMax: 10,
    san: 15, sanMax: 15,
    agi: 1, for: 1, int: 1, pre: 1, vig: 1,
    pericias: [],
    ataques: [],
    inventario: []
  };
}
function salaPadrao(codigo) {
  return {
    codigo,
    mapa: { imagem: "", largura: 1600, altura: 900 },
    tokens: [],
    fichas: {},
    jogadores: {}
  };
}
function obterSala(codigo) {
  if (!salas[codigo]) salas[codigo] = salaPadrao(codigo);
  return salas[codigo];
}
function garantirFicha(sala, nome) {
  const k = chaveNome(nome);
  if (!sala.fichas[k]) sala.fichas[k] = fichaPadrao(nome);
  return sala.fichas[k];
}
function podeEditarFicha(socket, donoNome) {
  return socket.data.perfil === "mestre" ||
    chaveNome(socket.data.nome) === chaveNome(donoNome);
}
function jogadoresDaSala(sala) {
  return Object.values(sala.jogadores || {});
}
function emitirJogadores(codigo) {
  const sala = salas[codigo];
  if (sala) io.to(codigo).emit("jogadoresAtualizados", jogadoresDaSala(sala));
}

io.on("connection", socket => {
  socket.on("entrarSala", dados => {
    const codigo = String(dados?.sala || "SELO").trim().toUpperCase();
    const nome = String(dados?.nome || "Jogador").trim().slice(0, 50);
    const perfil = dados?.perfil === "mestre" ? "mestre" : "jogador";

    socket.join(codigo);
    socket.data.sala = codigo;
    socket.data.nome = nome;
    socket.data.perfil = perfil;

    const sala = obterSala(codigo);
    sala.jogadores[socket.id] = { id: socket.id, nome, perfil };

    if (perfil === "jogador") garantirFicha(sala, nome);

    socket.emit("estadoSala", {
      sala: codigo,
      mapa: sala.mapa,
      tokens: sala.tokens,
      fichas: sala.fichas,
      jogadores: jogadoresDaSala(sala),
      eu: sala.jogadores[socket.id]
    });
    emitirJogadores(codigo);
  });

  socket.on("salvarMapa", mapa => {
    const codigo = socket.data.sala;
    if (!codigo || socket.data.perfil !== "mestre") return;
    const sala = obterSala(codigo);
    sala.mapa = {
      imagem: String(mapa?.imagem || "").trim(),
      largura: Math.max(600, Math.min(5000, Number(mapa?.largura) || 1600)),
      altura: Math.max(400, Math.min(5000, Number(mapa?.altura) || 900))
    };
    io.to(codigo).emit("mapaAtualizado", sala.mapa);
  });

  socket.on("criarToken", dados => {
    const codigo = socket.data.sala;
    if (!codigo || socket.data.perfil !== "mestre") return;
    const sala = obterSala(codigo);
    const token = {
      id: "TK-" + Date.now() + "-" + Math.random().toString(36).slice(2,7),
      nome: String(dados?.nome || "Token").trim(),
      imagem: String(dados?.imagem || "").trim(),
      donoNome: String(dados?.donoNome || "").trim(),
      tamanho: Math.max(40, Math.min(220, Number(dados?.tamanho) || 80)),
      x: Number(dados?.x) || sala.mapa.largura/2,
      y: Number(dados?.y) || sala.mapa.altura/2
    };
    sala.tokens.push(token);
    io.to(codigo).emit("tokenCriado", token);
  });

  socket.on("moverToken", dados => {
    const codigo = socket.data.sala;
    if (!codigo) return;
    const sala = obterSala(codigo);
    const t = sala.tokens.find(x => x.id === dados?.id);
    if (!t) return;
    const autorizado = socket.data.perfil === "mestre" ||
      (t.donoNome && chaveNome(t.donoNome) === chaveNome(socket.data.nome));
    if (!autorizado) return;
    t.x = Number(dados.x) || 0;
    t.y = Number(dados.y) || 0;
    io.to(codigo).emit("tokenMovido", { id:t.id, x:t.x, y:t.y });
  });

  socket.on("removerToken", id => {
    const codigo = socket.data.sala;
    if (!codigo || socket.data.perfil !== "mestre") return;
    const sala = obterSala(codigo);
    sala.tokens = sala.tokens.filter(t => t.id !== id);
    io.to(codigo).emit("tokenRemovido", id);
  });

  socket.on("criarFicha", nome => {
    const codigo = socket.data.sala;
    if (!codigo || socket.data.perfil !== "mestre") return;
    const n = String(nome || "").trim().slice(0,50);
    if (!n) return;
    const sala = obterSala(codigo);
    const ficha = garantirFicha(sala, n);
    io.to(codigo).emit("fichaAtualizada", { donoNome:n, ficha });
  });

  socket.on("atualizarFicha", dados => {
    const codigo = socket.data.sala;
    if (!codigo) return;
    const sala = obterSala(codigo);
    const donoNome = String(dados?.donoNome || socket.data.nome || "").trim();
    if (!donoNome || !podeEditarFicha(socket, donoNome)) return;

    const ficha = garantirFicha(sala, donoNome);
    const p = dados?.patch || {};
    const textos = ["personagem","classe","trilha","origem"];
    const numeros = ["nex","defesa","pv","pvMax","pe","peMax","san","sanMax","agi","for","int","pre","vig"];
    textos.forEach(c => { if (p[c] !== undefined) ficha[c] = String(p[c]).slice(0,100); });
    numeros.forEach(c => { if (p[c] !== undefined && Number.isFinite(Number(p[c]))) ficha[c] = Number(p[c]); });
    if (Array.isArray(p.pericias)) ficha.pericias = p.pericias.slice(0,100);
    if (Array.isArray(p.ataques)) ficha.ataques = p.ataques.slice(0,100);
    if (Array.isArray(p.inventario)) ficha.inventario = p.inventario.slice(0,200);
    ficha.donoNome = donoNome;

    io.to(codigo).emit("fichaAtualizada", { donoNome, ficha });
  });

  socket.on("rolarDado", dados => {
    const codigo = socket.data.sala;
    if (!codigo) return;
    const lados = Math.max(2, Math.min(1000, Number(dados?.lados) || 20));
    const qtd = Math.max(1, Math.min(20, Number(dados?.qtd) || 1));
    const bonus = Number(dados?.bonus) || 0;
    const resultados = Array.from({length:qtd}, () => 1 + Math.floor(Math.random()*lados));
    const total = resultados.reduce((a,b)=>a+b,0)+bonus;
    io.to(codigo).emit("resultadoDado", {
      nome: socket.data.nome || "Jogador",
      expressao: `${qtd}d${lados}${bonus ? (bonus>0?"+":"")+bonus : ""}`,
      resultados, total
    });
  });

  socket.on("disconnect", () => {
    const codigo = socket.data.sala;
    if (!codigo || !salas[codigo]) return;
    delete salas[codigo].jogadores[socket.id];
    emitirJogadores(codigo);
  });
});

app.get("/health", (req,res)=>res.json({ok:true,versao:"V3-FICHA"}));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`ORDEM VTT V3 rodando na porta ${PORT}`));
