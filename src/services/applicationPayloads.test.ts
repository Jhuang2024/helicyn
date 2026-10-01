import { describe, expect, it } from 'vitest';
import { jobApplicationPayload, partnerApplicationPayload } from './applicationPayloads';
const job = { role: 'cto', full_name: ' Ada ', email: 'ada@example.com', q1: 'Built a scheduler', q2: 'Coordination', eligible: true };
describe('application schema mapping', () => {
  it('sends answers and eligibility columns without unknown fields or review status', () => {
    const result = jobApplicationPayload({ ...job, status: 'accepted', user_id: 'another-user' });
    expect(result).toMatchObject({ full_name: 'Ada', is_berkeley_student: true, is_sf_based: true, answers: { q1: job.q1, q2: job.q2 } });
    for (const key of ['q1', 'q2', 'eligible', 'status', 'user_id']) expect(result).not.toHaveProperty(key);
  });
  it('rejects empty answers, invalid email, and missing consent', () => {
    expect(() => jobApplicationPayload({ ...job, q1: '  ' })).toThrow();
    expect(() => jobApplicationPayload({ ...job, email: 'invalid' })).toThrow();
    expect(() => jobApplicationPayload({ ...job, eligible: false })).toThrow();
    expect(() => partnerApplicationPayload({ company_name: '  ', name: 'Ada', email: job.email, consent_precommercial: true })).toThrow();
  });
});
