\set ON_ERROR_STOP on
-- Isolated CI database only: mimic Supabase's auth roles and owner claim.
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to authenticated;
\ir ../supabase/migrations/001_founding_partner_applications.sql
\ir ../supabase/migrations/003_job_applications.sql
-- Mimic Supabase's initial table grants so revocation is exercised.
grant all on public.founding_partner_applications, public.job_applications to anon, authenticated;
\ir ../supabase/migrations/20261001015334_protect_application_review_fields.sql
insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.job_applications (user_id, role, full_name, email, is_berkeley_student, is_sf_based, answers)
values (auth.uid(), 'cto', 'Test Applicant', 'test@example.com', true, true, '{"q1":"Answer","q2":"Answer"}');
insert into public.founding_partner_applications (user_id, email, name, company_name, consent_precommercial)
values (auth.uid(), 'test@example.com', 'Test Applicant', 'Test Company', true);
update public.job_applications set full_name = 'Updated Applicant';
update public.founding_partner_applications set company_name = 'Updated Company';
do $$ begin
  if (select status from public.job_applications) <> 'submitted' then raise exception 'Incorrect default status'; end if;
  begin
    update public.job_applications set status = 'accepted';
    raise exception 'Applicant changed job review status';
  exception when insufficient_privilege then null; end;
  begin
    update public.founding_partner_applications set status = 'accepted';
    raise exception 'Applicant changed partner review status';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.job_applications (user_id, role, full_name, email, is_berkeley_student, is_sf_based, status)
    values (auth.uid(), 'coo', 'Test', 'test@example.com', true, true, 'accepted');
    raise exception 'Applicant inserted accepted status';
  exception when insufficient_privilege then null; end;
  begin
    update public.job_applications set user_id = '00000000-0000-0000-0000-000000000002';
    raise exception 'Applicant changed ownership';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  if exists(select 1 from public.job_applications) or exists(select 1 from public.founding_partner_applications)
  then raise exception 'Another user read private applications'; end if;
  begin
    insert into public.founding_partner_applications (user_id, email, name, company_name)
    values ('00000000-0000-0000-0000-000000000001', 'test@example.com', 'Other', 'Other');
    raise exception 'Another user forged ownership';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.job_applications set status = 'accepted';
update public.founding_partner_applications set status = 'accepted';
set role anon;
do $$ begin
  begin
    perform count(*) from public.job_applications;
    raise exception 'Anonymous user read applications';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
