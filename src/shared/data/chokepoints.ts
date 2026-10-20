/**
 * Strategic maritime chokepoints and their qualitative market transmission
 * channels — the seed of the Market Impact Radar.
 *
 * Coordinates are approximate reference points. The transmission notes are
 * an analytical framework describing HOW disruptions can propagate; they are
 * not forecasts and contain no live data.
 */

export interface TransmissionChannel {
  market: string;
  assetClass: "Energy" | "Commodities" | "Equities" | "FX" | "Rates" | "Freight" | "Safe havens";
  mechanism: string;
}

export interface Chokepoint {
  id: string;
  name: string;
  lon: number;
  lat: number;
  connects: string;
  significance: string;
  channels: TransmissionChannel[];
  references: { label: string; url: string }[];
}

const EIA = {
  label: "U.S. EIA — World Oil Transit Chokepoints",
  url: "https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints",
};

export const CHOKEPOINTS: Chokepoint[] = [
  {
    id: "hormuz",
    name: "Strait of Hormuz",
    lon: 56.25,
    lat: 26.57,
    connects: "Persian Gulf ↔ Gulf of Oman / Arabian Sea",
    significance: "Principal export route for Gulf crude oil and Qatari LNG; few practical bypass options.",
    channels: [
      { market: "Brent & WTI crude", assetClass: "Energy", mechanism: "Supply-risk premium on seaborne crude flows." },
      { market: "LNG (Asia/Europe spot)", assetClass: "Energy", mechanism: "Qatari LNG exports transit the strait." },
      { market: "Tanker rates", assetClass: "Freight", mechanism: "War-risk insurance and rerouting raise charter costs." },
      { market: "Energy equities", assetClass: "Equities", mechanism: "Producer margins vs. refiner and airline input costs." },
      { market: "Inflation breakevens", assetClass: "Rates", mechanism: "Energy pass-through to headline inflation expectations." },
      { market: "Gold", assetClass: "Safe havens", mechanism: "Geopolitical hedging demand." },
    ],
    references: [EIA],
  },
  {
    id: "bab-el-mandeb",
    name: "Bab-el-Mandeb",
    lon: 43.33,
    lat: 12.58,
    connects: "Red Sea ↔ Gulf of Aden",
    significance: "Southern gateway to the Suez route between Asia and Europe.",
    channels: [
      { market: "Container freight (Asia–Europe)", assetClass: "Freight", mechanism: "Diversion around the Cape lengthens voyages." },
      { market: "European goods inflation", assetClass: "Rates", mechanism: "Higher shipping costs and delivery delays." },
      { market: "Crude & products", assetClass: "Energy", mechanism: "Tanker diversion and insurance premiums." },
      { market: "Shipping & logistics equities", assetClass: "Equities", mechanism: "Rate spikes vs. operational disruption." },
    ],
    references: [EIA],
  },
  {
    id: "suez",
    name: "Suez Canal",
    lon: 32.35,
    lat: 30.42,
    connects: "Mediterranean ↔ Red Sea",
    significance: "Shortest sea link between Europe and Asia; canal revenue is significant for Egypt.",
    channels: [
      { market: "Container & dry-bulk freight", assetClass: "Freight", mechanism: "Capacity absorbed by longer routes." },
      { market: "Egyptian pound / sovereign credit", assetClass: "FX", mechanism: "Canal receipts are a major FX source." },
      { market: "European energy imports", assetClass: "Energy", mechanism: "Product flows from Middle East and Asia." },
    ],
    references: [EIA],
  },
  {
    id: "malacca",
    name: "Strait of Malacca",
    lon: 101.4,
    lat: 2.5,
    connects: "Indian Ocean ↔ South China Sea",
    significance: "Key route for energy imports to East Asian economies.",
    channels: [
      { market: "Asian crude & LNG import costs", assetClass: "Energy", mechanism: "Alternative routes via Lombok/Sunda add distance." },
      { market: "Asian FX (JPY, KRW, CNY)", assetClass: "FX", mechanism: "Terms-of-trade shock for energy importers." },
      { market: "Regional manufacturing equities", assetClass: "Equities", mechanism: "Input cost and supply-chain timing." },
    ],
    references: [EIA],
  },
  {
    id: "taiwan-strait",
    name: "Taiwan Strait",
    lon: 119.5,
    lat: 24.5,
    connects: "East China Sea ↔ South China Sea",
    significance: "Major commercial shipping lane adjacent to concentrated advanced-semiconductor production.",
    channels: [
      { market: "Semiconductor equities", assetClass: "Equities", mechanism: "Supply concentration in leading-edge chip manufacturing." },
      { market: "TWD, CNY, JPY, KRW", assetClass: "FX", mechanism: "Regional risk repricing and capital flows." },
      { market: "Container freight", assetClass: "Freight", mechanism: "Rerouting around affected waters." },
      { market: "US Treasuries & gold", assetClass: "Safe havens", mechanism: "Flight-to-quality flows." },
    ],
    references: [],
  },
  {
    id: "turkish-straits",
    name: "Turkish Straits (Bosporus)",
    lon: 29.07,
    lat: 41.12,
    connects: "Black Sea ↔ Sea of Marmara ↔ Mediterranean",
    significance: "Outlet for Black Sea grain and oil exports; passage governed by the Montreux Convention.",
    channels: [
      { market: "Wheat & corn", assetClass: "Commodities", mechanism: "Black Sea grain export availability." },
      { market: "CPC / Urals crude differentials", assetClass: "Energy", mechanism: "Tanker transit delays and restrictions." },
      { market: "TRY", assetClass: "FX", mechanism: "Regional risk and transit economics." },
    ],
    references: [EIA],
  },
  {
    id: "panama",
    name: "Panama Canal",
    lon: -79.68,
    lat: 9.08,
    connects: "Atlantic ↔ Pacific",
    significance: "Draft and transit limits are sensitive to water levels in Gatún Lake.",
    channels: [
      { market: "US Gulf LNG & LPG to Asia", assetClass: "Energy", mechanism: "Transit restrictions force longer routes." },
      { market: "Grain exports (US Gulf)", assetClass: "Commodities", mechanism: "Freight cost competitiveness vs. other origins." },
      { market: "Container freight", assetClass: "Freight", mechanism: "Transit slot scarcity." },
    ],
    references: [EIA],
  },
  {
    id: "danish-straits",
    name: "Danish Straits",
    lon: 11.5,
    lat: 55.5,
    connects: "Baltic Sea ↔ North Sea",
    significance: "Route for Baltic oil exports and regional trade; subsea infrastructure nearby.",
    channels: [
      { market: "Urals crude flows", assetClass: "Energy", mechanism: "Baltic port export route." },
      { market: "European gas & power", assetClass: "Energy", mechanism: "Proximity of subsea pipelines and cables." },
    ],
    references: [EIA],
  },
  {
    id: "gibraltar",
    name: "Strait of Gibraltar",
    lon: -5.6,
    lat: 35.95,
    connects: "Atlantic ↔ Mediterranean",
    significance: "Western gateway to the Mediterranean for all Suez-route traffic.",
    channels: [{ market: "Mediterranean trade flows", assetClass: "Freight", mechanism: "Combined exposure with the Suez route." }],
    references: [],
  },
  {
    id: "cape",
    name: "Cape of Good Hope",
    lon: 18.47,
    lat: -34.36,
    connects: "Atlantic ↔ Indian Ocean",
    significance: "Main alternative when Red Sea / Suez transit is disrupted.",
    channels: [
      { market: "Bunker fuel demand", assetClass: "Energy", mechanism: "Longer voyages increase fuel consumption." },
      { market: "Effective fleet capacity", assetClass: "Freight", mechanism: "More vessel-days per voyage tightens supply." },
    ],
    references: [],
  },
];
