-- Helicyn: founding-team job applications table + RLS policies.
--
-- Run this in the Supabase SQL editor (or `supabase db push` if you use
-- the Supabase CLI) against a real Supabase project. See
-- docs/auth_setup.md for full setup instructions.

create extension if not exists pgcrypto;

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null references auth.users(id) on delete cascade,

  role text not null check (role in ('cto', 'coo', 'cmo', 'cfo')),

  full_name text not null,
  email text not null,
  linkedin text,
  resume_url text,
  availability text,

  is_berkeley_student boolean not null default false,
  is_sf_based boolean not null default false,

  answers jsonb not null default '{}'::jsonb,

  status text not null default 'submitted'
    check (status in ('submitted', 'reviewing', 'accepted', 'declined')),

  constraint job_applications_email_format
    check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint job_applications_eligibility
    check (is_berkeley_student and is_sf_based),

  unique (user_id, role)
);

comment on table public.job_applications is
  'Founding-team role applications (CTO/COO/CMO/CFO). Open only to current '
  'UC Berkeley students based in the SF Bay Area. One application per role per user.';

-- updated_at trigger --------------------------------------------------------

create or replace function public.set_job_applications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_job_applications_updated_at on public.job_applications;

create trigger trg_job_applications_updated_at
  before update on public.job_applications
  for each row
  execute function public.set_job_applications_updated_at();

create index if not exists idx_job_applications_user_id
  on public.job_applications (user_id);

-- Row Level Security ---------------------------------------------------------
-- Same private-to-submitter model as founding_partner_applications: a user
-- signs in, then applies, and can only ever read/update their own rows.

alter table public.job_applications enable row level security;

drop policy if exists "Authenticated users can insert their own job application"
  on public.job_applications;
create policy "Authenticated users can insert their own job application"
  on public.job_applications
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can read their own job applications"
  on public.job_applications;
create policy "Authenticated users can read their own job applications"
  on public.job_applications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Authenticated users can update their own job application"
  on public.job_applications;
create policy "Authenticated users can update their own job application"
  on public.job_applications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
