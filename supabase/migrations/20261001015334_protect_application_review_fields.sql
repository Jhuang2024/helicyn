-- RLS controls row ownership; column grants reserve review decisions for staff.
-- No rows are rewritten. Existing service-role/admin review access is retained.
revoke all on public.founding_partner_applications, public.job_applications from public, anon;
revoke insert, update, delete on public.founding_partner_applications, public.job_applications from authenticated;
grant select on public.founding_partner_applications, public.job_applications to authenticated;
grant insert (user_id, email, name, role_title, linkedin, company_name, website, industry,
  company_size, region, relationship_to_data_centers, infrastructure_scale,
  primary_concern, founding_partner_interests, message, consent_precommercial)
  on public.founding_partner_applications to authenticated;
grant update (email, name, role_title, linkedin, company_name, website, industry,
  company_size, region, relationship_to_data_centers, infrastructure_scale,
  primary_concern, founding_partner_interests, message, consent_precommercial)
  on public.founding_partner_applications to authenticated;
grant insert (user_id, role, full_name, email, linkedin, resume_url, availability,
  is_berkeley_student, is_sf_based, answers) on public.job_applications to authenticated;
grant update (role, full_name, email, linkedin, resume_url, availability,
  is_berkeley_student, is_sf_based, answers) on public.job_applications to authenticated;
