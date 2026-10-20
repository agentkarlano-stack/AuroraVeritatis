import assert from "node:assert/strict";
import { test } from "node:test";
import { countryIndicators, handleApi } from "../src/worker/index";

const req = (path: string, method = "GET") => new Request(`https://aurorav.test${path}`, { method });

const fakeWorldBank = async (url: string) => {
  const year = url.includes("mrnev") ? "2024" : null;
  const rows = year
    ? [{ date: year, value: 42 }]
    : [
        { date: "2021", value: 2 },
        { date: "2020", value: -3 },
      ];
  return new Response(JSON.stringify([{ page: 1 }, rows]), { headers: { "content-type": "application/json" } });
};

test("health and config never leak secrets", async () => {
  const h = await (await handleApi(req("/api/health"), {})).json();
  assert.equal(h.status, "ok");
  const cfg = await (await handleApi(req("/api/config"), {})).json();
  assert.equal(cfg.supabase, null);
  assert.equal(cfg.features.auth, false);
  const cfg2 = await (await handleApi(req("/api/config"), { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" })).json();
  assert.deepEqual(cfg2.supabase, { url: "https://x.supabase.co", anonKey: "anon" });
  assert.ok(!JSON.stringify(cfg2).includes("service_role"));
});

test("events endpoint is explicitly marked as demo and filters", async () => {
  const all = await (await handleApi(req("/api/events"), {})).json();
  assert.equal(all.demo, true);
  assert.ok(all.count > 0);
  const maritime = await (await handleApi(req("/api/events?category=Maritime&minSeverity=3"), {})).json();
  assert.ok(maritime.events.every((e: { category: string; severity: number }) => e.category === "Maritime" && e.severity >= 3));
});

test("countries and 404s", async () => {
  const list = await (await handleApi(req("/api/countries"), {})).json();
  assert.ok(list.count >= 30);
  const one = await handleApi(req("/api/countries/aut"), {});
  assert.equal(one.status, 200);
  assert.equal((await one.json()).country.name, "Austria");
  assert.equal((await handleApi(req("/api/countries/XXX"), {})).status, 404);
  assert.equal((await handleApi(req("/api/nope"), {})).status, 404);
  assert.equal((await handleApi(req("/api/health", "POST"), {})).status, 405);
});

test("indicators aggregate World Bank responses with source attribution", async () => {
  const r = await countryIndicators("DEU", fakeWorldBank);
  assert.equal(r.covered, true);
  assert.equal(r.indicators.length, 8);
  assert.ok(r.indicators.every((i) => i.value === 42 && i.year === "2024"));
  assert.deepEqual(r.history["FP.CPI.TOTL.ZG"], [
    { year: 2020, value: -3 },
    { year: 2021, value: 2 },
  ]);
  assert.equal(r.source.licence, "CC BY 4.0");
});

test("indicators degrade gracefully on upstream failure and uncovered economies", async () => {
  const failing = async () => new Response("down", { status: 503 });
  const r = await countryIndicators("FRA", failing);
  assert.equal(r.indicators.length, 0);
  assert.ok(r.errors.length > 0);
  const tw = await countryIndicators("TWN", fakeWorldBank);
  assert.equal(tw.covered, false);
  assert.equal(tw.indicators.length, 0);
});
