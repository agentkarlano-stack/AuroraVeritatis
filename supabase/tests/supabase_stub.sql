-- Minimal stand-in for the parts of a Supabase database the migrations rely on (roles, auth.users, auth.uid(),
-- default grants). Used only by scripts/test-migrations.sh against a throwaway local Postgres.
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now(), email_confirmed_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase default: new public tables are fully granted to anon and authenticated.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
grant execute on function auth.jwt() to anon, authenticated;
-- Sessions as Supabase Auth keeps them (one row per signed-in device; refresh tokens cascade with the session).
create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users (id) on delete cascade, created_at timestamptz not null default now(), updated_at timestamptz, refreshed_at timestamp, user_agent text, ip inet, not_after timestamptz, aal text);
create table auth.refresh_tokens (id bigserial primary key, token text, user_id text, session_id uuid references auth.sessions (id) on delete cascade, revoked boolean default false);
