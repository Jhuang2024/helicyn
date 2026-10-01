const AUTH_DESTINATIONS = new Set(['/onboarding', '/careers', '/profile', '/partner-portal']);
/** Only known local account destinations may receive an authentication redirect. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || (value.includes('\\') || Array.from(value).some((char) => char.charCodeAt(0) < 32))) return '/partner-portal';
  try {
    const url = new URL(value, 'https://helicyn.com');
    return url.origin === 'https://helicyn.com' && AUTH_DESTINATIONS.has(url.pathname)
      ? url.pathname + url.search + url.hash : '/partner-portal';
  } catch { return '/partner-portal'; }
}
export function readAuthCallback(search: string, hash: string) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  return { type: query.get('type') ?? fragment.get('type'), error: query.get('error') ?? fragment.get('error'),
    returnTo: safeReturnTo(query.get('next')) };
}
