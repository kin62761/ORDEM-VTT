create table if not exists public.vtt_salas (
  codigo text primary key,
  estado jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.vtt_salas enable row level security;

-- Não crie política pública.
-- O Node.js acessa esta tabela pela SERVICE ROLE KEY do Render.
