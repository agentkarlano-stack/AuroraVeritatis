import { metaFor } from '../shared/meta';

/**
 * Rewrites the SPA shell's <head> for the requested route so crawlers and link-preview bots (which do not run
 * JavaScript) see the page's own title, description, canonical URL and robots directive. Values are inserted via
 * HTMLRewriter APIs, which escape them.
 */
export function withRouteMeta(res: Response, pathname: string): Response {
  const m = metaFor(pathname);
  const set = (attr: string, value: string) => ({
    element(el: Element) {
      el.setAttribute(attr, value);
    },
  });
  return new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(m.title);
      },
    })
    .on('meta[name="description"]', set('content', m.description))
    .on('meta[property="og:title"]', set('content', m.title))
    .on('meta[property="og:description"]', set('content', m.description))
    .on('meta[property="og:url"]', set('content', m.canonical))
    .on('link[rel="canonical"]', set('href', m.canonical))
    .on('meta[property="og:image"]', set('content', m.image.url))
    .on('meta[property="og:image:width"]', set('content', String(m.image.width)))
    .on('meta[property="og:image:height"]', set('content', String(m.image.height)))
    .on('meta[property="og:image:alt"]', set('content', m.image.alt))
    .on('meta[name="twitter:title"]', set('content', m.title))
    .on('meta[name="twitter:description"]', set('content', m.description))
    .on('meta[name="twitter:image"]', set('content', m.image.url))
    .on('meta[name="twitter:image:alt"]', set('content', m.image.alt))
    .on('head', {
      element(el) {
        if (m.noindex) el.append('<meta name="robots" content="noindex">', { html: true });
      },
    })
    .transform(res);
}
