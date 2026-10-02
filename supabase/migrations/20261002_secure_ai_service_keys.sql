-- Vaani Studio: encrypted AI service credentials in Supabase Vault.
-- Run this migration once in the Supabase SQL Editor as the postgres role.

create extension if not exists supabase_vault with schema vault;

create table if not exists public.ai_service_config (
  provider text primary key check (
    provider in ('sarvam', 'azure', 'google', 'aws', 'elevenlabs', 'openai')
  ),
  secret_id uuid not null unique,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.ai_service_config enable row level security;

-- Nobody using a browser key can read or modify the secret mapping table.
revoke all on table public.ai_service_config from public, anon, authenticated;

-- Safe public endpoint: returns provider names only, never secret IDs or values.
create or replace function public.list_configured_ai_services()
returns table (provider text)
language sql
stable
security definer
set search_path = ''
as $$
  select config.provider
  from public.ai_service_config as config
  where config.enabled = true
  order by config.provider;
$$;

revoke all on function public.list_configured_ai_services() from public;
grant execute on function public.list_configured_ai_services() to anon, authenticated;

-- Privileged endpoint used by an administrator or a server-side Edge Function.
-- It creates a Vault secret the first time and updates that same secret later.
create or replace function public.upsert_ai_service_key(
  p_provider text,
  p_api_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_secret_id uuid;
  new_secret_id uuid;
begin
  if p_provider not in ('sarvam', 'azure', 'google', 'aws', 'elevenlabs', 'openai') then
    raise exception 'Unsupported provider';
  end if;

  if p_api_key is null or length(trim(p_api_key)) < 8 then
    raise exception 'API key is missing or too short';
  end if;

  select config.secret_id
    into existing_secret_id
  from public.ai_service_config as config
  where config.provider = p_provider;

  if existing_secret_id is null then
    select vault.create_secret(
      p_api_key,
      'vaani_' || p_provider || '_api_key',
      'Vaani Studio API key for ' || p_provider
    ) into new_secret_id;

    insert into public.ai_service_config (provider, secret_id, enabled, updated_at)
    values (p_provider, new_secret_id, true, now());
  else
    perform vault.update_secret(
      existing_secret_id,
      p_api_key,
      'vaani_' || p_provider || '_api_key',
      'Vaani Studio API key for ' || p_provider
    );

    update public.ai_service_config
    set enabled = true,
        updated_at = now()
    where provider = p_provider;
  end if;
end;
$$;

revoke all on function public.upsert_ai_service_key(text, text)
  from public, anon, authenticated;
grant execute on function public.upsert_ai_service_key(text, text) to service_role;

-- Server-only lookup for an Edge Function. Never grant this to browser roles.
create or replace function public.get_ai_service_key(p_provider text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted.decrypted_secret
  from public.ai_service_config as config
  join vault.decrypted_secrets as decrypted
    on decrypted.id = config.secret_id
  where config.provider = p_provider
    and config.enabled = true
  limit 1;
$$;

revoke all on function public.get_ai_service_key(text)
  from public, anon, authenticated;
grant execute on function public.get_ai_service_key(text) to service_role;

comment on table public.ai_service_config is
  'Maps Vaani AI providers to encrypted Supabase Vault secrets. No browser access.';

-- Verification: this must return provider names only.
select * from public.list_configured_ai_services();

-- Add keys AFTER this migration by running statements like these separately.
-- Never commit real values to Git:
-- select public.upsert_ai_service_key('sarvam', 'PASTE_REAL_SARVAM_KEY_HERE');
-- select public.upsert_ai_service_key('openai', 'PASTE_REAL_OPENAI_KEY_HERE');
