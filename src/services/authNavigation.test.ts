import { describe, expect, it } from 'vitest';
import { readAuthCallback, safeReturnTo } from './authNavigation';
describe('authentication intent', () => {
  it('retains recovery intent even when Supabase later clears the fragment', () => {
    const intent = readAuthCallback('?next=%2Fcareers', '#access_token=example&type=recovery');
    expect(intent).toEqual({ type: 'recovery', error: null, returnTo: '/careers' });
    expect(readAuthCallback('?type=recovery', '').type).toBe('recovery');
  });
  it('permits known local destinations only', () => {
    for (const value of ['https://evil.com', '//evil.com', '/\\evil.com', '/login', '/unknown']) expect(safeReturnTo(value)).toBe('/partner-portal');
    expect(safeReturnTo('/careers#cto')).toBe('/careers#cto');
  });
});
