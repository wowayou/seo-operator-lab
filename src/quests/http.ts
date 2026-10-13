/**
 * Shared HTTP evidence helpers.
 *
 * `PlaygroundClient.request()` does not follow redirects and returns raw
 * `headers` as `Record<string, string[]>`, so a Quest can observe a redirect's
 * status and destination directly. These helpers carry no Quest-specific
 * knowledge; they only normalize evidence collection.
 */

/** Read all values, including differently cased duplicate header names. */
export function readHeaders(headers: Record<string, string[]>, name: string): string[] {
  const wanted = name.toLowerCase();
  return Object.entries(headers).filter(([key]) => key.toLowerCase() === wanted).flatMap(([, values]) => values);
}

/** Reads the first value case-insensitively. */
export function readHeader(headers: Record<string, string[]>, name: string): string | undefined {
  return readHeaders(headers, name)[0];
}

export function isRedirect(status: number): boolean {
  // 304 is a cache response, not a navigational redirect.
  return [301, 302, 303, 307, 308].includes(status);
}

/** Extracts the URL path. Runtime scope prefixes remain; compare against a scoped expectation. */
export function pathOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, 'http://placeholder.invalid').pathname;
  } catch {
    return undefined;
  }
}

export interface RedirectObservation {
  status: number;
  location?: string;
}

export function describeRedirect(observation: RedirectObservation): string {
  return isRedirect(observation.status)
    ? `HTTP ${observation.status} -> ${pathOf(observation.location) ?? '(no Location)'}`
    : `HTTP ${observation.status}（无跳转）`;
}
