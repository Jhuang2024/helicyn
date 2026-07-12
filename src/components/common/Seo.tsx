import { Helmet } from 'react-helmet-async';

export interface SeoProps {
  title: string;
  description?: string;
  /** Canonical path, e.g. "/research". */
  canonicalPath: string;
  ogType?: 'website' | 'article';
  /** Set true to keep a page out of search results (parity with legacy noindex). */
  noindex?: boolean;
  image?: string;
  /** JSON-LD structured data object. */
  jsonLd?: Record<string, unknown>;
  /** Include Open Graph tags (some legacy pages had them, some did not). */
  openGraph?: boolean;
  twitterCard?: boolean;
}

const ORIGIN = 'https://helicyn.com';
const DEFAULT_IMAGE = `${ORIGIN}/og-image.png`;

/**
 * Per-route document head. Keeps titles, descriptions, canonical URLs, OG /
 * Twitter previews, structured data, and indexing behavior at parity with the
 * original multi-page site. Rendered content is also emitted by the prerender
 * step so marketing routes remain in the static HTML for SEO.
 */
export function Seo({
  title,
  description,
  canonicalPath,
  ogType = 'website',
  noindex = false,
  image = DEFAULT_IMAGE,
  jsonLd,
  openGraph = true,
  twitterCard = false,
}: SeoProps) {
  const url = `${ORIGIN}${canonicalPath}`;
  return (
    <Helmet>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex" />}
      {openGraph && <meta property="og:type" content={ogType} />}
      {openGraph && <meta property="og:site_name" content="Helicyn" />}
      {openGraph && <meta property="og:url" content={url} />}
      {openGraph && <meta property="og:title" content={title} />}
      {openGraph && description && <meta property="og:description" content={description} />}
      {openGraph && <meta property="og:image" content={image} />}
      {twitterCard && <meta name="twitter:card" content="summary_large_image" />}
      {twitterCard && <meta name="twitter:title" content={title} />}
      {twitterCard && description && <meta name="twitter:description" content={description} />}
      {twitterCard && <meta name="twitter:image" content={image} />}
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
