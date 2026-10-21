import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { metaFor } from '../../shared/meta';

function setTag(selector: string, create: () => HTMLElement, attr: string, value: string | null) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (value === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

const meta = (key: 'name' | 'property', k: string) => () => {
  const m = document.createElement('meta');
  m.setAttribute(key, k);
  return m;
};

/** Keeps <title>, description, canonical, Open Graph and robots tags in sync with the current route. */
export function useRouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const m = metaFor(pathname);
    document.title = m.title;
    setTag('meta[name="description"]', meta('name', 'description'), 'content', m.description);
    setTag('meta[property="og:title"]', meta('property', 'og:title'), 'content', m.title);
    setTag('meta[property="og:description"]', meta('property', 'og:description'), 'content', m.description);
    setTag('meta[property="og:url"]', meta('property', 'og:url'), 'content', m.canonical);
    setTag('meta[name="robots"]', meta('name', 'robots'), 'content', m.noindex ? 'noindex' : null);
    setTag(
      'link[rel="canonical"]',
      () => {
        const l = document.createElement('link');
        l.rel = 'canonical';
        return l;
      },
      'href',
      m.canonical,
    );
  }, [pathname]);
}
