ORDEM VTT SOCKET V2.1 - PERSISTÊNCIA
====================================

Esta versão mantém a V2 funcionando e adiciona persistência real com Supabase.

O que passa a ser salvo:
- URL e tamanho do mapa
- Tokens
- Posição dos tokens
- Dono e tamanho dos tokens

IMPORTANTE:
Sem Supabase configurado, o sistema continua funcionando em memória.
No Render gratuito, memória/arquivos locais podem ser perdidos quando o serviço reinicia.

CONFIGURAÇÃO SUPABASE
1. Crie um projeto no Supabase.
2. Abra SQL Editor.
3. Execute o conteúdo de supabase.sql.
4. Pegue no Supabase:
   - Project URL
   - service_role key
5. No Render > ORDEM-VTT > Environment, crie:
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
6. Salve e faça um novo deploy.

SEGURANÇA:
Nunca coloque a service_role key em app.js, index.html ou no GitHub.
Ela deve existir somente nas Environment Variables do Render.

TESTE:
Abra:
https://SEU-ENDERECO.onrender.com/health

Com Supabase ativo deverá retornar:
{"ok":true,"versao":"2.1","persistencia":"supabase"}
