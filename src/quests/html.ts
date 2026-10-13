import { parse, type DefaultTreeAdapterTypes } from 'parse5';

type Element = DefaultTreeAdapterTypes.Element;
type Node = DefaultTreeAdapterTypes.Node;
const ROBOT_AGENTS = new Set(['robots', 'googlebot', 'bingbot']);

function children(node: Node): Node[] { return 'childNodes' in node ? node.childNodes : []; }
function isElement(node: Node): node is Element { return 'tagName' in node; }
function attribute(node: Element, name: string): string { return node.attrs.find((attr) => attr.name === name)?.value ?? ''; }
function elements(node: Node): Element[] {
  // Iterative traversal avoids recursive copying/stack overflow on edited HTML.
  // Template contents are a separate inert tree, deliberately not traversed.
  const result: Element[] = [];
  const queue = [...children(node)].reverse();
  while (queue.length) {
    const child = queue.pop()!;
    if (!isElement(child)) continue;
    result.push(child);
    for (let i = children(child).length - 1; i >= 0; --i) queue.push(children(child)[i]);
  }
  return result;
}

export function normalizeDirectives(value: string): string[] {
  return value.toLowerCase().split(/[\s,]+/).filter(Boolean).flatMap((directive) => directive === 'none' ? ['noindex', 'nofollow'] : [directive]);
}

function countProducts(value: unknown, inheritedContext = false): number {
  if (Array.isArray(value)) return value.reduce((sum, entry) => sum + countProducts(entry, inheritedContext), 0);
  if (!value || typeof value !== 'object') return 0;
  const object = value as Record<string, unknown>;
  const context = object['@context'];
  const schemaContext = (entry: unknown): boolean => typeof entry === 'string' && /^https?:\/\/schema\.org\/?$/.test(entry);
  const validContext = inheritedContext || schemaContext(context) || (Array.isArray(context) && context.some(schemaContext));
  const type = object['@type'];
  const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
  const current = validContext && isProduct && typeof object.name === 'string' && object.name.trim() ? 1 : 0;
  return current + (object['@graph'] ? countProducts(object['@graph'], validContext) : 0);
}

export interface HtmlEvidence {
  hasHead: boolean;
  canonicals: string[];
  robots: string[];
  genericRobots: string[];
  productCount: number;
}

/** HTML5 parsing without executing scripts, loading images, or touching the DOM. */
export function inspectHtml(html: string): HtmlEvidence {
  if (html.length > 2_000_000) throw new Error('HTML 超过本实验的 2,000,000 字符检查上限');
  const document = parse(html, { sourceCodeLocationInfo: true });
  const nodes = elements(document);
  const head = nodes.find((node) => node.tagName === 'head');
  const headNodes = head ? elements(head) : [];
  const canonicals = headNodes.filter((node) => node.tagName === 'link' && attribute(node, 'rel').toLowerCase().split(/\s+/).includes('canonical')).map((node) => attribute(node, 'href').trim());
  const robotTags = headNodes.filter((node) => node.tagName === 'meta' && ROBOT_AGENTS.has(attribute(node, 'name').trim().toLowerCase()));
  const robots = robotTags.flatMap((node) => normalizeDirectives(attribute(node, 'content')));
  const genericRobots = robotTags.filter((node) => attribute(node, 'name').trim().toLowerCase() === 'robots').flatMap((node) => normalizeDirectives(attribute(node, 'content')));
  const productCount = nodes.filter((node) => node.tagName === 'script' && attribute(node, 'type').trim().toLowerCase() === 'application/ld+json').reduce((sum, node) => {
    const text = children(node).map((child) => child.nodeName === '#text' ? (child as DefaultTreeAdapterTypes.TextNode).value : '').join('');
    try { return sum + countProducts(JSON.parse(text)); } catch { return sum; }
  }, 0);
  return { hasHead: Boolean(head?.sourceCodeLocation), canonicals, robots: [...new Set(robots)], genericRobots: [...new Set(genericRobots)], productCount };
}

export function parseCanonicalLinks(html: string): string[] { return inspectHtml(html).canonicals; }
export function parseRobotsDirectives(html: string): string[] { return inspectHtml(html).robots; }

/** Generic, Googlebot and Bingbot directives; restrictive directives win. */
export function parseRobotsHeaders(values: string[], genericOnly = false): string[] {
  const directives: string[] = [];
  const parameterizedDirectives = new Set(['unavailable_after', 'max-snippet', 'max-image-preview', 'max-video-preview']);
  for (const value of values) {
    let agent = 'robots';
    for (const part of value.toLowerCase().split(',')) {
      let content = part.trim();
      const scoped = content.match(/^([\w-]+):\s*(.*)$/);
      if (scoped && !parameterizedDirectives.has(scoped[1])) {
        agent = scoped[1];
        content = scoped[2];
      }
      if (ROBOT_AGENTS.has(agent) && (!genericOnly || agent === 'robots')) directives.push(...normalizeDirectives(content));
    }
  }
  return [...new Set(directives)];
}
