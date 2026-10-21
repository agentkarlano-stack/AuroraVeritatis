import { countryName } from './countryNames';

export const SITE = {
  name: 'Aurora Veritatis',
  origin: 'https://aurorav.app',
  defaultTitle: 'Aurora Veritatis — Global Analysis & Strategic Insight',
  defaultDescription:
    'Aurora Veritatis connects geopolitical developments, country intelligence and financial markets in one research platform for analysts, students and investors.',
} as const;

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute canonical URL (no query string). */
  canonical: string;
  /** Ask search engines not to index (private or utility pages). */
  noindex?: boolean;
}

const STATIC: Record<string, { title: string; description: string; noindex?: boolean }> = {
  '/': { title: SITE.defaultTitle, description: SITE.defaultDescription },
  '/hq': { title: 'Headquarters', description: 'Your personal dashboard: daily briefing, events, World Tension Index, markets, watchlist, alerts and saved research.' },
  '/radar': { title: 'Global Radar', description: 'Interactive world map of geopolitical events, earthquakes and disaster alerts with filters, timeline and source labels.' },
  '/countries': { title: 'Country Dossiers', description: 'Economic, demographic, infrastructure and defence indicators for every country, sourced from World Bank Open Data.' },
  '/countries/compare': { title: 'Compare Countries Over Time', description: 'Animated bubble chart of World Bank indicators for every economy since 1990.' },
  '/countries/vs': { title: 'Side-by-side Country Comparison', description: 'Compare up to four countries across World Bank indicators, each value with its reference year.' },
  '/markets': { title: 'Market Terminal', description: 'Interactive charts, technical indicators, drawing tools and relative-performance comparison, annotated with geopolitical events.' },
  '/impact': { title: 'Market Impact Radar', description: 'How geopolitical events can transmit to markets — mechanisms, correlations and hypotheses labelled by strength of evidence.' },
  '/lab': { title: 'Quant Research', description: 'Monte Carlo risk simulation and rule-based backtesting with transparent, reproducible methods.' },
  '/strategy': { title: 'Strategy Lab', description: 'Compare event scenarios against a no-event baseline with adjustable assumptions and visible uncertainty.' },
  '/positioning': { title: 'Futures Positioning (CFTC COT)', description: 'Weekly CFTC Commitments of Traders data for major futures: net speculative and commercial positions, three-year positioning index and extremes.' },
  '/tension': { title: 'World Tension Index', description: 'A transparent composite of geopolitical, humanitarian and financial stress with published formula, weights and robustness check.' },
  '/pricing': { title: 'Plans', description: 'Proposed Aurora Veritatis subscription tiers. The early-access preview is free.' },
  '/status': { title: 'Platform Status & Data Sources', description: 'What works today, what uses demonstration data, and the licences of every data source.' },
  '/signin': { title: 'Sign In', description: 'Sign in to Aurora Veritatis.', noindex: true },
  '/account': { title: 'Account', description: 'Your Aurora Veritatis account.', noindex: true },
};

const LEGAL: Record<string, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
  disclaimer: 'Financial & Investment Risk Disclaimer',
  ai: 'AI Transparency',
  subscriptions: 'Subscription Terms & Refund Policy',
  imprint: 'Legal Notice',
};

const withSite = (t: string) => (t === SITE.defaultTitle ? t : `${t} · ${SITE.name}`);

/** Title, description and canonical URL for an app path. Unknown paths fall back to site defaults and noindex. */
export function metaFor(pathname: string): PageMeta {
  const path = pathname.replace(/\/+$/, '') || '/';
  const canonical = `${SITE.origin}${path === '/' ? '/' : path}`;
  const s = STATIC[path];
  if (s) return { title: withSite(s.title), description: s.description, canonical, noindex: s.noindex };

  const country = path.match(/^\/countries\/([A-Za-z]{3})$/);
  if (country) {
    const iso3 = country[1]!.toUpperCase();
    const name = countryName(iso3);
    if (name) {
      return {
        title: withSite(`${name} — Country Dossier`),
        description: `${name}: population, economy, demography, infrastructure and defence indicators from World Bank Open Data, each with source and reference year.`,
        canonical: `${SITE.origin}/countries/${iso3}`,
      };
    }
  }

  const legal = path.match(/^\/legal\/([a-z]+)$/);
  if (legal && LEGAL[legal[1]!]) {
    return { title: withSite(`${LEGAL[legal[1]!]} (draft)`), description: `Draft ${LEGAL[legal[1]!]} for Aurora Veritatis, pending legal review.`, canonical, noindex: true };
  }

  return { title: withSite('Page not found'), description: SITE.defaultDescription, canonical: `${SITE.origin}/`, noindex: true };
}
