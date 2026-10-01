/**
 * Single source of truth for the site version and build date.
 *
 * Every visible build/version label (homepage status band, footer, Control
 * Plane build tag, patch notes, report) reads from here so they can never
 * disagree. Bump these together when cutting a release.
 */

export const VERSION = '1.2.0';
/** Build date in the site's YYYY.MM.DD convention. */
export const BUILD_DATE = '2026.10.01';
/** Short build label (YYYY.MM) used in compact status strips. */
export const BUILD_SHORT = '2026.10';

/** e.g. "v1.2.0" */
export const VERSION_LABEL = `v${VERSION}`;
/** e.g. "Research preview · Build v1.2.0" */
export const RESEARCH_PREVIEW_LABEL = `Research preview · Build ${VERSION_LABEL}`;
/** e.g. "v1.2.0 / build 2026.10.01" */
export const FOOTER_BUILD_LABEL = `${VERSION_LABEL} / build ${BUILD_DATE}`;
/** e.g. "v1.2.0 · 2026.10" */
export const STATUS_BUILD_LABEL = `${VERSION_LABEL} · ${BUILD_SHORT}`;

/** Keep ported page labels current; never apply this to historical patch notes. */
export function syncVersionStrings(html: string): string {
  return html
    .replace(/v(?:1\.0\.1|1\.1\.0) · 2026\.07/g, STATUS_BUILD_LABEL)
    .replace(/build 2026\.07\.(?:10|11|13)/g, `build ${BUILD_DATE}`)
    .replace(/Build v(?:1\.0\.1|1\.1\.0)/g, `Build ${VERSION_LABEL}`);
}
