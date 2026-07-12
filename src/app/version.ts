/**
 * Single source of truth for the site version and build date.
 *
 * Every visible build/version label (homepage status band, footer, Control
 * Plane build tag, patch notes, report) reads from here so they can never
 * disagree. Bump these together when cutting a release.
 */

export const VERSION = '1.1.0';
/** Build date in the site's YYYY.MM.DD convention. */
export const BUILD_DATE = '2026.07.11';
/** Short build label (YYYY.MM) used in compact status strips. */
export const BUILD_SHORT = '2026.07';

/** e.g. "v1.1.0" */
export const VERSION_LABEL = `v${VERSION}`;
/** e.g. "Research preview · Build v1.1.0" */
export const RESEARCH_PREVIEW_LABEL = `Research preview · Build ${VERSION_LABEL}`;
/** e.g. "v1.1.0 / build 2026.07.11" */
export const FOOTER_BUILD_LABEL = `${VERSION_LABEL} / build ${BUILD_DATE}`;
/** e.g. "v1.1.0 · 2026.07" */
export const STATUS_BUILD_LABEL = `${VERSION_LABEL} · ${BUILD_SHORT}`;
