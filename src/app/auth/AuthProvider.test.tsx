import { act, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('@/services/auth', () => mocks);
vi.mock('@/services/supabase', () => ({ isSupabaseConfigured: true }));
function State() { const auth = useAuth(); return <output>{auth.loading ? 'loading' : auth.user?.email ?? 'signed out'}</output>; }
it('does not replace a newer auth event with a stale initial session read', async () => {
  let resolve!: (value: Session | null) => void;
  let change!: (value: Session | null) => void;
  mocks.getSession.mockReturnValue(new Promise((done) => { resolve = done; }));
  mocks.onAuthStateChange.mockImplementation((callback) => { change = callback; return { unsubscribe: vi.fn() }; });
  render(<AuthProvider><State /></AuthProvider>);
  act(() => change(null));
  await act(async () => resolve({ user: { email: 'old@example.com' } } as Session));
  expect(screen.getByRole('status')).toHaveTextContent('signed out');
});
