/** Whitelist browser input into the columns defined by the application schema. */
function text(fields: Record<string, unknown>, key: string, required = false): string {
  const value = typeof fields[key] === 'string' ? fields[key].trim() : '';
  if (required && !value) throw new Error(`Please complete ${key.replaceAll('_', ' ')}.`);
  return value;
}
function email(fields: Record<string, unknown>): string {
  const value = text(fields, 'email', true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Enter a valid email address.');
  return value;
}
function url(fields: Record<string, unknown>, key: string): string {
  const value = text(fields, key);
  if (!value) return '';
  try {
    if (!['https:', 'http:'].includes(new URL(value).protocol)) throw new Error();
  } catch { throw new Error(`Enter a valid ${key.replaceAll('_', ' ')} URL.`); }
  return value;
}
export function jobApplicationPayload(fields: Record<string, unknown>) {
  const role = text(fields, 'role', true);
  if (!['cto', 'coo', 'cmo', 'cfo'].includes(role)) throw new Error('Choose an available role.');
  if (fields.eligible !== true) throw new Error('Please confirm your eligibility.');
  return {
    role, full_name: text(fields, 'full_name', true), email: email(fields),
    linkedin: url(fields, 'linkedin'), resume_url: url(fields, 'resume_url'),
    availability: text(fields, 'availability'),
    is_berkeley_student: true, is_sf_based: true,
    answers: { q1: text(fields, 'q1', true), q2: text(fields, 'q2', true) },
  };
}
export function partnerApplicationPayload(fields: Record<string, unknown>) {
  if (fields.consent_precommercial !== true) throw new Error('Please confirm the pre-commercial acknowledgement.');
  return {
    company_name: text(fields, 'company_name', true), name: text(fields, 'name', true), email: email(fields),
    website: url(fields, 'website'), linkedin: url(fields, 'linkedin'),
    industry: text(fields, 'industry'), company_size: text(fields, 'company_size'), region: text(fields, 'region'),
    role_title: text(fields, 'role_title'), relationship_to_data_centers: text(fields, 'relationship_to_data_centers'),
    infrastructure_scale: text(fields, 'infrastructure_scale'), primary_concern: text(fields, 'primary_concern'),
    founding_partner_interests: Array.isArray(fields.founding_partner_interests)
      ? fields.founding_partner_interests.filter((item): item is string => typeof item === 'string') : [],
    message: text(fields, 'message'), consent_precommercial: true,
  };
}
