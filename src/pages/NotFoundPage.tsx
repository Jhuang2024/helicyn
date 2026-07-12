import { Link } from 'react-router-dom';
import { Seo } from '@/components/common/Seo';

export default function NotFoundPage() {
  return (
    <div className="page notfound">
      <Seo title="Helicyn · Page not found" canonicalPath="/404" noindex openGraph={false} />
      <span className="eyebrow mono">404</span>
      <h1>Page not found</h1>
      <p style={{ color: 'var(--text-dim)', maxWidth: '52ch' }}>
        The page you were looking for doesn't exist or has moved. Head back to the coordination
        layer.
      </p>
      <Link className="navlink navlink--cta" to="/">
        Return home <span className="arr" aria-hidden="true">↗</span>
      </Link>
    </div>
  );
}
