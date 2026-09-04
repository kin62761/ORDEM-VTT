ORDEM VTT V4.4 — CENAS + TRILHA SONORA + CINEMÁTICAS

NOVO:
- Várias cenas por sala. Cada cena possui mapa, tokens e trilha sonora próprios.
- Mestre troca a cena e todos os jogadores mudam juntos.
- Trilha sonora sincronizada: tocar, pausar, parar, volume e loop.
- Cinemática para todos: vídeo ou imagem em tela cheia.
- Ao iniciar uma cinematica, a trilha da cena é pausada; ao encerrar, volta automaticamente.
- Links públicos do Google Drive continuam sendo convertidos automaticamente.
- Ficha automática V4 mantida: gasto automático de PE e habilidade de próximo ataque desmarcada após atacar.

IMPORTANTE SOBRE AUDIO/VIDEO:
Navegadores podem bloquear reprodução automática com som. Cada jogador deve clicar uma vez em “ATIVAR ÁUDIO” depois de entrar na sala.
Para melhor compatibilidade, prefira arquivos MP3/OGG para trilhas e MP4/WebM para cinematica.
No Google Drive, deixe o arquivo como “Qualquer pessoa com o link — Leitor”.

ESTRUTURA NO GITHUB:
server.js
package.json
README.txt
public/
  index.html
  app.js
  style.css

RENDER:
Build Command: npm install
Start Command: node server.js

TESTE:
/health deve mostrar versao V4.4-CENAS-AUDIO-CINEMATICAS.

OBSERVACAO:
Os dados ainda ficam na memoria do servidor. Quando o Render reinicia, podem ser perdidos. A persistencia no Supabase entra na etapa seguinte.
