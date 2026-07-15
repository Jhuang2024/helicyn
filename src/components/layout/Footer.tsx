import { Link } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { RevealOnScroll } from '@/components/common/RevealOnScroll';
import { FOOTER_BUILD_LABEL, RESEARCH_PREVIEW_LABEL } from '@/app/version';

/** Assemble the contact address at runtime (anti-scrape, matches the original). */
function emailHref(): string {
  const dest = 'jerry' + String.fromCharCode(64) + ['helicyn', 'com'].join('.');
  return 'mailto:' + dest;
}

export function Footer() {
  return (
    <footer className="footer" data-screen-label="footer">
      <div className="wrap">
        <div className="footer__top">
          <RevealOnScroll className="footer__brand" index={0}>
            <span className="brand">
              <BrandMark size={20} />
              <span className="brand__name">Helicyn</span>
            </span>
            <p className="footer__tagline">
              The coordination layer for large-scale physical and computational systems.
            </p>
          </RevealOnScroll>

          <RevealOnScroll className="fcol" index={1}>
            <h4>Company</h4>
            <Link to="/research">Thesis / Research</Link>
            <Link to="/report">Read the Report</Link>
            <Link to="/patch-notes">Patch Notes</Link>
            <Link to="/partners">Founding Partners</Link>
            <Link to="/careers">Careers</Link>
            <Link to="/control-plane">Control Plane</Link>
            <Link to="/onboarding">Onboarding</Link>
            <Link to="/login">Login</Link>
          </RevealOnScroll>

          <RevealOnScroll className="fcol" index={2}>
            <h4>Connect</h4>
            <a
              href="https://www.linkedin.com/company/helicyn/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Follow us on LinkedIn <span className="arr" aria-hidden="true">↗</span>
            </a>
            <a href={emailHref()}>Email us</a>
            <Link to="/terms">Terms and Conditions</Link>
          </RevealOnScroll>
        </div>

        <div className="footer__base">
          <span className="mono">© 2026 Helicyn · All rights reserved</span>
          <span className="statusband__item">
            <span className="statusdot" aria-hidden="true" />
            <span className="mono">{RESEARCH_PREVIEW_LABEL}</span>
          </span>
          <span className="mono">{FOOTER_BUILD_LABEL}</span>
        </div>
      </div>
    </footer>
  );
}
