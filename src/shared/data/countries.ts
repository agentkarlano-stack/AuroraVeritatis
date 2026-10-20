/**
 * Country reference registry.
 *
 * Contains ONLY slow-changing structural facts (codes, capital, region,
 * currency, selected memberships). Quantitative indicators are fetched at
 * runtime from the World Bank Open Data API and always shown with their
 * source and year. Memberships reflect the reviewed state noted in
 * `REGISTRY_REVIEWED` and must be re-verified on each data review.
 */

export const REGISTRY_REVIEWED = "2026-06";

export type Region =
  | "North America"
  | "Latin America & Caribbean"
  | "Europe & Central Asia"
  | "Middle East & North Africa"
  | "Sub-Saharan Africa"
  | "South Asia"
  | "East Asia & Pacific";

export type Membership = "UN" | "G7" | "G20" | "EU" | "NATO" | "OPEC" | "BRICS";

export interface CountryRecord {
  name: string;
  iso2: string;
  iso3: string;
  /** ISO 3166-1 numeric, zero-padded — matches world-atlas feature ids. */
  numeric: string;
  capital: string;
  region: Region;
  currency: string;
  memberships: Membership[];
  /** Whether World Bank WDI publishes data for this economy. */
  worldBank: boolean;
  note?: string;
}

const c = (
  name: string,
  iso2: string,
  iso3: string,
  numeric: string,
  capital: string,
  region: Region,
  currency: string,
  memberships: Membership[],
  extra: Partial<CountryRecord> = {},
): CountryRecord => ({ name, iso2, iso3, numeric, capital, region, currency, memberships, worldBank: true, ...extra });

export const COUNTRIES: CountryRecord[] = [
  c("United States", "US", "USA", "840", "Washington, D.C.", "North America", "USD", ["UN", "G7", "G20", "NATO"]),
  c("Canada", "CA", "CAN", "124", "Ottawa", "North America", "CAD", ["UN", "G7", "G20", "NATO"]),
  c("Mexico", "MX", "MEX", "484", "Mexico City", "Latin America & Caribbean", "MXN", ["UN", "G20"]),
  c("Brazil", "BR", "BRA", "076", "Brasília", "Latin America & Caribbean", "BRL", ["UN", "G20", "BRICS"]),
  c("Argentina", "AR", "ARG", "032", "Buenos Aires", "Latin America & Caribbean", "ARS", ["UN", "G20"]),
  c("United Kingdom", "GB", "GBR", "826", "London", "Europe & Central Asia", "GBP", ["UN", "G7", "G20", "NATO"]),
  c("France", "FR", "FRA", "250", "Paris", "Europe & Central Asia", "EUR", ["UN", "G7", "G20", "EU", "NATO"]),
  c("Germany", "DE", "DEU", "276", "Berlin", "Europe & Central Asia", "EUR", ["UN", "G7", "G20", "EU", "NATO"]),
  c("Italy", "IT", "ITA", "380", "Rome", "Europe & Central Asia", "EUR", ["UN", "G7", "G20", "EU", "NATO"]),
  c("Spain", "ES", "ESP", "724", "Madrid", "Europe & Central Asia", "EUR", ["UN", "EU", "NATO"]),
  c("Poland", "PL", "POL", "616", "Warsaw", "Europe & Central Asia", "PLN", ["UN", "EU", "NATO"]),
  c("Austria", "AT", "AUT", "040", "Vienna", "Europe & Central Asia", "EUR", ["UN", "EU"]),
  c("Hungary", "HU", "HUN", "348", "Budapest", "Europe & Central Asia", "HUF", ["UN", "EU", "NATO"]),
  c("Norway", "NO", "NOR", "578", "Oslo", "Europe & Central Asia", "NOK", ["UN", "NATO"]),
  c("Ukraine", "UA", "UKR", "804", "Kyiv", "Europe & Central Asia", "UAH", ["UN"]),
  c("Russia", "RU", "RUS", "643", "Moscow", "Europe & Central Asia", "RUB", ["UN", "G20", "BRICS"]),
  c("Türkiye", "TR", "TUR", "792", "Ankara", "Europe & Central Asia", "TRY", ["UN", "G20", "NATO"]),
  c("Israel", "IL", "ISR", "376", "Jerusalem", "Middle East & North Africa", "ILS", ["UN"], {
    note: "The status of Jerusalem as capital is disputed internationally; many states maintain embassies in Tel Aviv.",
  }),
  c("Iran", "IR", "IRN", "364", "Tehran", "Middle East & North Africa", "IRR", ["UN", "OPEC", "BRICS"]),
  c("Saudi Arabia", "SA", "SAU", "682", "Riyadh", "Middle East & North Africa", "SAR", ["UN", "G20", "OPEC"]),
  c("United Arab Emirates", "AE", "ARE", "784", "Abu Dhabi", "Middle East & North Africa", "AED", ["UN", "OPEC", "BRICS"]),
  c("Qatar", "QA", "QAT", "634", "Doha", "Middle East & North Africa", "QAR", ["UN"]),
  c("Egypt", "EG", "EGY", "818", "Cairo", "Middle East & North Africa", "EGP", ["UN", "BRICS"]),
  c("Nigeria", "NG", "NGA", "566", "Abuja", "Sub-Saharan Africa", "NGN", ["UN", "OPEC"]),
  c("South Africa", "ZA", "ZAF", "710", "Pretoria (executive)", "Sub-Saharan Africa", "ZAR", ["UN", "G20", "BRICS"]),
  c("India", "IN", "IND", "356", "New Delhi", "South Asia", "INR", ["UN", "G20", "BRICS"]),
  c("Pakistan", "PK", "PAK", "586", "Islamabad", "South Asia", "PKR", ["UN"]),
  c("China", "CN", "CHN", "156", "Beijing", "East Asia & Pacific", "CNY", ["UN", "G20", "BRICS"]),
  c("Taiwan", "TW", "TWN", "158", "Taipei", "East Asia & Pacific", "TWD", [], {
    worldBank: false,
    note: "Not covered by World Bank WDI. Indicators require an alternative official source (planned).",
  }),
  c("Japan", "JP", "JPN", "392", "Tokyo", "East Asia & Pacific", "JPY", ["UN", "G7", "G20"]),
  c("South Korea", "KR", "KOR", "410", "Seoul", "East Asia & Pacific", "KRW", ["UN", "G20"]),
  c("Indonesia", "ID", "IDN", "360", "Jakarta", "East Asia & Pacific", "IDR", ["UN", "G20", "BRICS"]),
  c("Australia", "AU", "AUS", "036", "Canberra", "East Asia & Pacific", "AUD", ["UN", "G20"]),
];

const byIso3 = new Map(COUNTRIES.map((x) => [x.iso3, x]));
const byNumeric = new Map(COUNTRIES.map((x) => [x.numeric, x]));

export function countryByIso3(iso3: string): CountryRecord | undefined {
  return byIso3.get(iso3.toUpperCase());
}

export function countryByNumeric(id: string | number | undefined): CountryRecord | undefined {
  if (id === undefined) return undefined;
  return byNumeric.get(String(id).padStart(3, "0"));
}

export const REGIONS: Region[] = [
  "North America",
  "Latin America & Caribbean",
  "Europe & Central Asia",
  "Middle East & North Africa",
  "Sub-Saharan Africa",
  "South Asia",
  "East Asia & Pacific",
];
