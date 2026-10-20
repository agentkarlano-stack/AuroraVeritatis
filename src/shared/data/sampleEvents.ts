/**
 * SAMPLE EVENTS — FICTIONAL PLACEHOLDER RECORDS.
 *
 * These records exist only to exercise the Global Radar UI, filtering and
 * API contract until a verified OSINT ingestion pipeline exists. They do
 * NOT describe real events, and every consumer must display the `demo` flag.
 */

export type EventCategory = "Maritime" | "Security" | "Political" | "Economic" | "Energy" | "Cyber";

export interface GeoEvent {
  id: string;
  demo: true;
  title: string;
  category: EventCategory;
  /** 1 (low) – 5 (critical). */
  severity: 1 | 2 | 3 | 4 | 5;
  lon: number;
  lat: number;
  region: string;
  summary: string;
  /** ISO timestamp of the fictional record (not a real event time). */
  recordedAt: string;
  relatedChokepoint?: string;
  source: { name: string; verified: false };
}

const src = { name: "Aurora Veritatis sample dataset", verified: false } as const;

export const SAMPLE_EVENTS: GeoEvent[] = [
  {
    id: "sample-001",
    demo: true,
    title: "Sample: shipping advisory scenario near a Gulf chokepoint",
    category: "Maritime",
    severity: 3,
    lon: 56.9,
    lat: 25.9,
    region: "Middle East",
    summary: "Fictional record used to demonstrate how a maritime advisory links to the Market Impact Radar.",
    recordedAt: "2026-01-01T00:00:00Z",
    relatedChokepoint: "hormuz",
    source: src,
  },
  {
    id: "sample-002",
    demo: true,
    title: "Sample: container rerouting scenario, Red Sea corridor",
    category: "Maritime",
    severity: 2,
    lon: 41.5,
    lat: 15.2,
    region: "Middle East",
    summary: "Fictional record demonstrating freight-rate transmission channels.",
    recordedAt: "2026-01-01T00:00:00Z",
    relatedChokepoint: "bab-el-mandeb",
    source: src,
  },
  {
    id: "sample-003",
    demo: true,
    title: "Sample: central bank decision placeholder",
    category: "Economic",
    severity: 2,
    lon: 8.68,
    lat: 50.11,
    region: "Europe",
    summary: "Fictional placeholder illustrating how Strategic Calendar items will appear on the map.",
    recordedAt: "2026-01-01T00:00:00Z",
    source: src,
  },
  {
    id: "sample-004",
    demo: true,
    title: "Sample: grid outage report placeholder",
    category: "Energy",
    severity: 1,
    lon: -46.6,
    lat: -23.5,
    region: "South America",
    summary: "Fictional placeholder for infrastructure incident reporting.",
    recordedAt: "2026-01-01T00:00:00Z",
    source: src,
  },
  {
    id: "sample-005",
    demo: true,
    title: "Sample: election calendar placeholder",
    category: "Political",
    severity: 1,
    lon: 77.2,
    lat: 28.6,
    region: "South Asia",
    summary: "Fictional placeholder illustrating political-calendar records.",
    recordedAt: "2026-01-01T00:00:00Z",
    source: src,
  },
  {
    id: "sample-006",
    demo: true,
    title: "Sample: cyber incident disclosure placeholder",
    category: "Cyber",
    severity: 2,
    lon: 139.7,
    lat: 35.7,
    region: "East Asia",
    summary: "Fictional placeholder for public cyber-incident disclosures.",
    recordedAt: "2026-01-01T00:00:00Z",
    source: src,
  },
  {
    id: "sample-007",
    demo: true,
    title: "Sample: security alert placeholder",
    category: "Security",
    severity: 4,
    lon: 20.0,
    lat: 5.0,
    region: "Africa",
    summary: "Fictional high-severity record to test severity styling. Location is arbitrary.",
    recordedAt: "2026-01-01T00:00:00Z",
    source: src,
  },
];

export const EVENT_CATEGORIES: EventCategory[] = ["Maritime", "Security", "Political", "Economic", "Energy", "Cyber"];
