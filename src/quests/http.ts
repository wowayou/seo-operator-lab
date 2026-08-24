/**
 * Shared HTTP evidence helpers.
 *
 * `PlaygroundClient.request()` does not follow redirects and returns raw
 * `headers` as `Record<string, string[]>`, so a Quest can observe a redirect's
 * status and destination directly. These helpers carry no Quest-specific
 * knowledge; they only normalize evidence collection.
 */

/** Reads one header case-insensitively, since header casing is not guaranteed. */
export function readHeader(headers: Record<string, string[]>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, values] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return values[0];
  }
  return undefined;
}

export function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

/** Compares only the path, so a runtime-specific scope prefix does not matter. */
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
