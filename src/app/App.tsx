import { lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { HomePage } from '@/pages/HomePage';

// Marketing/legal pages are small; the Control Plane and its charts are heavy
// and lazy-loaded so a visitor reading a research page never downloads the
// simulation bundle.
const ResearchPage = lazy(() => import('@/pages/ResearchPage'));
const ReportPage = lazy(() => import('@/pages/ReportPage'));
const PatchNotesPage = lazy(() => import('@/pages/PatchNotesPage'));
const PartnersPage = lazy(() => import('@/pages/PartnersPage'));
const CareersPage = lazy(() => import('@/pages/CareersPage'));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const AuthCallbackPage = lazy(() => import('@/pages/AuthCallbackPage'));
const TermsPage = lazy(() => import('@/pages/TermsPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const PartnerPortalPage = lazy(() => import('@/pages/PartnerPortalPage'));
const ControlPlanePage = lazy(() => import('@/pages/ControlPlanePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="research" element={<ResearchPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="patch-notes" element={<PatchNotesPage />} />
        <Route path="partners" element={<PartnersPage />} />
        <Route path="careers" element={<CareersPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="auth-callback" element={<AuthCallbackPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="partner-portal" element={<PartnerPortalPage />} />
        <Route path="control-plane" element={<ControlPlanePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
