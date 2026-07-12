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

/** Previous release strings, replaced when syncing ported legacy content. */
const OLD_VERSION = 'v1.0.1';
const OLD_BUILD_DATE = '2026.07.10';

/**
 * Update stale version/build labels in ported legacy page bodies so no page
 * shows a conflicting version. NOTE: do not use this on the patch-notes
 * changelog — historical entries legitimately mention older versions.
 */
export function syncVersionStrings(html: string): string {
  return html
    .split(`${OLD_VERSION} · ${BUILD_SHORT}`)
    .join(STATUS_BUILD_LABEL)
    .split(`build ${OLD_BUILD_DATE}`)
    .join(`build ${BUILD_DATE}`)
    .split(`Build ${OLD_VERSION}`)
    .join(`Build ${VERSION_LABEL}`);
}
