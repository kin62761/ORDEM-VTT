ORDEM VTT SOCKET V4 - FICHA AUTOMATICA

RECURSOS PRINCIPAIS
- Sala em tempo real com Socket.IO
- Mestre e jogadores
- Ficha sincronizada em tempo real
- PV / PE / SAN
- Pericias, ataques, habilidades, inventario, rituais e anotacoes
- Habilidades descontam PE automaticamente
- Tipo "Proximo ataque" e desmarcado depois que o ataque e usado
- Bonus de teste e dano de habilidades ativas entram no ataque
- Ritual desconta PE automaticamente
- Bloqueio quando PE e insuficiente
- Mapa, tokens, imagem/GIF e movimentacao em tempo real

PUBLICACAO NO RENDER
Build Command: npm install
Start Command: node server.js

ESTRUTURA CORRETA NO GITHUB
server.js
package.json
README.txt
public/
  index.html
  app.js
  style.css

TESTE
/health deve responder:
{"ok":true,"versao":"V4-FICHA-AUTOMATICA"}

IMPORTANTE
Esta V4 ainda usa memoria do servidor. Se o Render reiniciar, os dados podem ser perdidos.
A persistencia em Supabase pode ser integrada depois sem mudar a interface da ficha.
