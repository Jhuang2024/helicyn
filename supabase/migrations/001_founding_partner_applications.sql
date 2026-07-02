-- Helicyn: founding partner applications table + RLS policies.
--
-- Run this in the Supabase SQL editor (or `supabase db push` if you use
-- the Supabase CLI) against a real Supabase project. See
-- docs/auth_setup.md for full setup instructions.

create extension if not exists pgcrypto;

create table if not exists public.founding_partner_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid references auth.users(id) on delete set null,

  email text not null,
  name text not null,
  role_title text,
  linkedin text,

  company_name text not null,
  website text,
  industry text,
  company_size text,
  region text,

  relationship_to_data_centers text,
  infrastructure_scale text,
  primary_concern text,

  founding_partner_interests text[],
  message text,

  consent_precommercial boolean not null default false,

  status text not null default 'submitted'
    check (status in ('not_started', 'submitted', 'reviewing', 'accepted', 'waitlisted', 'declined')),

  constraint founding_partner_applications_email_format
    check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

comment on table public.founding_partner_applications is
  'Founding partner program applications. Pre-commercial stage: see docs/founding_partner_program.md. '
  'No production customer or billing data is stored here.';

-- updated_at trigger --------------------------------------------------------

create or replace function public.set_founding_partner_applications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_founding_partner_applications_updated_at
  on public.founding_partner_applications;

create trigger trg_founding_partner_applications_updated_at
  before update on public.founding_partner_applications
  for each row
  execute function public.set_founding_partner_applications_updated_at();

create index if not exists idx_founding_partner_applications_user_id
  on public.founding_partner_applications (user_id);

-- Row Level Security ---------------------------------------------------------
-- Recommended flow: user signs in, then submits the application, which is
-- linked to auth.uid() automatically. Applications are private to the
-- submitting user; there is no admin/review UI in this phase, so no
-- separate admin-read policy is added here.

alter table public.founding_partner_applications enable row level security;

drop policy if exists "Authenticated users can insert their own application"
  on public.founding_partner_applications;
create policy "Authenticated users can insert their own application"
  on public.founding_partner_applications
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can read their own application"
  on public.founding_partner_applications;
create policy "Authenticated users can read their own application"
  on public.founding_partner_applications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Authenticated users can update their own application"
  on public.founding_partner_applications;
create policy "Authenticated users can update their own application"
  on public.founding_partner_applications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No public (anonymous) insert/select policy is created: this phase
-- requires sign-in before an application is submitted or viewed, so a
-- partner portal never has to pretend pre-auth access exists. If a future
-- phase wants "apply before you have an account", add a scoped anonymous
-- insert policy plus a later account-linking step -- do not widen this
-- policy to anonymous select.
