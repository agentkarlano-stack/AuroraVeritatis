import { countryName } from './countryNames';
import { shareImageFor } from './share';

export const SITE = {
  name: 'Aurora Veritatis',
  origin: 'https://aurorav.app',
  defaultTitle: 'Aurora Veritatis · Global Analysis & Strategic Insight',
  defaultDescription:
    'Track global events, countries and markets in one place. Official data, transparent sources and research tools for analysts, students and investors.',
} as const;

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute canonical URL (no query string). */
  canonical: string;
  /** Ask search engines not to index (private or utility pages). */
  noindex?: boolean;
  /** Link-preview image (absolute URL) with its size and alt text. */
  image: { url: string; width: number; height: number; alt: string };
}

const STATIC: Record<string, { title: string; description: string; noindex?: boolean }> = {
  '/': { title: SITE.defaultTitle, description: SITE.defaultDescription },
  '/hq': { title: 'HQ', description: 'Your workspace: resume recent dossiers, charts and map views, follow countries and regions, and keep saved intelligence in collections with notes.' },
  '/overview': { title: 'Platform overview', description: 'What Aurora Veritatis offers: global events, country intelligence, markets, quantitative research and a personal research graph.' },
  '/briefing': { title: 'World Briefing', description: 'The World Briefing now opens from Global Radar: the last 24 hours, 3 or 7 days in about a minute, written or narrated.', noindex: true },
  '/radar': { title: 'Global Radar', description: 'A grayscale globe of earthquakes, disaster alerts and verified news, with country dossiers, a Situation Report, a daily Operations Briefing and Comfort Mode. Every item links to its source.' },
  '/countries': { title: 'Country Dossiers', description: 'Economic, demographic, infrastructure and defence indicators for every country, sourced from World Bank Open Data.' },
  '/countries/compare': { title: 'Compare countries over time', description: 'Animated bubble chart of World Bank indicators for every economy since 1990.' },
  '/countries/vs': { title: 'Side-by-side country comparison', description: 'Compare up to four countries across World Bank indicators, each value with its reference year.' },
  '/markets': { title: 'Market Terminal', description: 'Chart editor with separate candle interval and history range, 12 chart types, 57 tested indicators, drawings, templates, saved charts and image export. Official ECB reference rates and clearly labelled simulated instruments.' },
  '/markets/commodities': { title: 'Commodity & Energy Monitor', description: 'Oil, gas, coal, gold, copper, iron ore, grains and fertilisers: official World Bank monthly prices with changes, volatility, long-run position, comparisons and exposure maps.' },
  '/lab/forecasts': { title: 'Prediction Research', description: 'Write forecasts with resolution criteria, revise them, resolve them and measure calibration with Brier and log scores. Your own estimates, not market data.' },
  '/impact': { title: 'Market Impact Radar', description: 'How geopolitical events can reach markets: mechanisms, correlations and hypotheses, each labelled by strength of evidence.' },
  '/lab': { title: 'Quant Research', description: 'Monte Carlo risk simulation and rule-based backtesting with transparent, reproducible methods.' },
  '/strategy': { title: 'Strategy Lab', description: 'Compare event scenarios against a no-event baseline with adjustable assumptions and visible uncertainty.' },
  '/geo': { title: 'Map Explorer', description: 'A 2D map and 3D globe combining NASA satellite observations, World Bank country statistics and live earthquake and disaster alerts, with sources and dates for every layer.' },
  '/newsletter': { title: 'Newsletter', description: 'Subscribe to the Aurora Veritatis newsletter with double opt-in, or unsubscribe and delete your newsletter data.' },
  '/brain': { title: 'Personal Intelligence Brain', description: 'Build your own research graph linking events, countries, companies, markets and indicators with typed, sourced relationships. Stored privately in your browser.' },
  '/share': { title: 'Share Aurora Veritatis', description: 'Link previews, Story and post images for Aurora Veritatis. Download them or copy a link to share.' },
  '/share/card': { title: 'Share card', description: 'Render target for social images.', noindex: true },
  '/macro': { title: 'Macro & FX', description: 'ECB policy rates, euro-area inflation, 10-year yields and euro reference exchange rates with history, cross rates and CSV export.' },
  '/currency': { title: 'Currency and purchasing power', description: 'Purchasing power over time, currency values against the dollar and PPP, an inflation calculator and a currency converter with historical ECB rates. Official World Bank and ECB data.' },
  '/positioning': { title: 'Futures positioning (CFTC)', description: 'Weekly CFTC Commitments of Traders data for major futures: net speculative and commercial positions, three-year positioning index and extremes.' },
  '/tension': { title: 'World Tension Index', description: 'One transparent number for geopolitical, humanitarian and financial stress, with its formula, weights and a robustness check.' },
  '/pricing': { title: 'Plans', description: 'Proposed Aurora Veritatis plans. Everything is free during early access.' },
  '/business': { title: 'Business & Institutional Solutions', description: 'Request a private quote for teams, companies, universities and institutions: seats, features and AI usage sized to your organisation.' },
  '/news': { title: 'News verification', description: 'Headlines from publishers worldwide grouped by story, with independent coverage, syndicated copies and official sources marked.' },
  '/assistant': { title: 'EVE and KNOX AI research assistants', description: 'Source-grounded AI answers about countries, events, markets and methods, with citations and usage limits.' },
  '/about': { title: 'About Aurora Veritatis', description: 'An independent intelligence and research platform bringing global events, geopolitics, economic information and financial market analysis together.' },
  '/status': { title: 'Platform status and data sources', description: 'What works today, what uses simulated data, and the licence of every data source.' },
  '/signin': { title: 'Sign in', description: 'Sign in to Aurora Veritatis.', noindex: true },
  '/account': { title: 'Account', description: 'Your Aurora Veritatis account.', noindex: true },
  '/admin': { title: 'Administration', description: 'Administrator area.', noindex: true },
  '/admin/quote': { title: 'Quotation calculator', description: 'Administrator area.', noindex: true },
};

const LEGAL: Record<string, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
  disclaimer: 'Financial & Investment Risk Disclaimer',
  ai: 'AI Transparency',
  subscriptions: 'Subscription Terms & Refund Policy',
  fairuse: 'Fair Use Policy',
  sources: 'Data Sources & Licences',
  imprint: 'Legal Notice',
};

const withSite = (t: string) => (t === SITE.defaultTitle ? t : `${t} · ${SITE.name}`);

/** Title, description, canonical URL and preview image for an app path. Unknown paths fall back to site defaults and noindex. */
export function metaFor(pathname: string): PageMeta {
  const path = pathname.replace(/\/+$/, '') || '/';
  const img = shareImageFor(path, SITE.origin);
  return { ...baseMeta(path), image: { url: img.url, width: img.width, height: img.height, alt: img.alt } };
}

function baseMeta(path: string): Omit<PageMeta, 'image'> {
  // /radar is the same page as the landing page.
  const canonical = `${SITE.origin}${path === '/' || path === '/radar' ? '/' : path}`;
  const s = STATIC[path];
  if (s) return { title: withSite(s.title), description: s.description, canonical, noindex: s.noindex };

  const country = path.match(/^\/countries\/([A-Za-z]{3})$/);
  if (country) {
    const iso3 = country[1]!.toUpperCase();
    const name = countryName(iso3);
    if (name) {
      return {
        title: withSite(`${name}: country dossier`),
        description: `${name}: population, economy, demography, infrastructure and defence indicators from World Bank Open Data, each with its source and reference year.`,
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
