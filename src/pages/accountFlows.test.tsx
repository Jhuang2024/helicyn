import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import PortalPage from './PartnerPortalPage';
import AuthCallbackPage from './AuthCallbackPage';
import CareersPage from './CareersPage';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getMyFoundingPartnerApplication: vi.fn(), getMyJobApplications: vi.fn(), signOut: vi.fn(), updatePassword: vi.fn(), resendSignupEmail: vi.fn(), requestPasswordReset: vi.fn(), signInWithMagicLink: vi.fn(), submitJobApplication: vi.fn() }));
vi.mock('@/services/auth', () => mocks);
vi.mock('@/services/supabase', () => ({ initialAuthCallback: { type: 'recovery', error: null, returnTo: '/careers' } }));
vi.mock('@/app/auth/AuthProvider', () => ({ useAuth: () => ({ user: { email: 'test@example.com' }, loading: false }) }));
const show = (page: React.ReactNode) => render(<HelmetProvider><MemoryRouter>{page}</MemoryRouter></HelmetProvider>);
beforeEach(() => { vi.resetAllMocks(); });
describe('account flow regressions', () => {
  it('shows the actual reviewing status and does not hide failed sign-out', async () => {
    mocks.getMyFoundingPartnerApplication.mockResolvedValue({ status: 'reviewing', company_name: 'Example' });
    mocks.signOut.mockRejectedValue(new Error('Offline'));
    show(<PortalPage />);
    expect(await screen.findByText('Under review')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out');
  });
  it('distinguishes a failed application read from no application and retries', async () => {
    mocks.getMyFoundingPartnerApplication.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ status: 'accepted' });
    show(<PortalPage />);
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText(/haven't submitted/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Accepted')).toBeVisible();
  });
  it('waits for session initialization and keeps the recovery form on save failure', async () => {
    let resolveSession!: (session: object) => void;
    mocks.getSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    mocks.updatePassword.mockRejectedValue(new Error('Offline'));
    show(<AuthCallbackPage />);
    expect(screen.getByText('Finishing sign-in…')).toBeVisible();
    await act(async () => { resolveSession({ user: {} }); });
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    expect(screen.getByLabelText('New password')).toBeVisible();
  });
  it('sends a schema-compatible job application after required fields are completed', async () => {
    mocks.getMyJobApplications.mockResolvedValue([]);
    mocks.submitJobApplication.mockResolvedValue({ id: 'example' });
    show(<CareersPage />);
    await waitFor(() => expect(screen.getAllByLabelText('Full name *').length).toBe(4));
    const form = document.querySelector('form.hireform')!;
    expect(form).not.toHaveAttribute('novalidate');
    for (const [name, value] of Object.entries({ full_name: 'Ada', email: 'ada@example.com', q1: 'A scheduler', q2: 'Coordination' })) fireEvent.change(form.querySelector(`[name="${name}"]`)!, { target: { value } });
    fireEvent.click(form.querySelector('[name="eligible"]')!);
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.submitJobApplication).toHaveBeenCalledWith(expect.objectContaining({ role: 'cto', eligible: true, q1: 'A scheduler' })));
  });
});
