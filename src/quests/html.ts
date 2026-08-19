export function extractAttribute(tag: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
}

export function parseCanonicalLinks(html: string): string[] {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  return links
    .filter((tag) => extractAttribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes('canonical'))
    .map((tag) => extractAttribute(tag, 'href') ?? '');
}

export function parseRobotsDirectives(html: string): string[] {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  return tags
    .filter((tag) => extractAttribute(tag, 'name')?.toLowerCase() === 'robots')
    .flatMap((tag) => (extractAttribute(tag, 'content') ?? '').toLowerCase().split(/[\s,]+/))
    .filter(Boolean);
}

export function countMarkedElements(html: string, marker: string): number {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...html.matchAll(new RegExp(`\\bdata-seo-lab\\s*=\\s*["']${escapedMarker}["']`, 'gi'))].length;
}
