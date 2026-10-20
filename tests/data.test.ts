import assert from "node:assert/strict";
import { test } from "node:test";
import { CHOKEPOINTS } from "../src/shared/data/chokepoints";
import { COUNTRIES, countryByIso3, countryByNumeric } from "../src/shared/data/countries";
import { SAMPLE_EVENTS } from "../src/shared/data/sampleEvents";
import { feature, type Topology } from "../src/shared/geo/topojson";
import { parseHistory, parseLatest, PROFILE_INDICATORS } from "../src/shared/worldbank";

test("country registry is internally consistent", () => {
  const iso3 = new Set<string>();
  const num = new Set<string>();
  for (const c of COUNTRIES) {
    assert.match(c.iso2, /^[A-Z]{2}$/);
    assert.match(c.iso3, /^[A-Z]{3}$/);
    assert.match(c.numeric, /^\d{3}$/);
    assert.ok(!iso3.has(c.iso3), `duplicate ${c.iso3}`);
    assert.ok(!num.has(c.numeric), `duplicate ${c.numeric}`);
    iso3.add(c.iso3);
    num.add(c.numeric);
  }
  assert.equal(countryByIso3("deu")?.name, "Germany");
  assert.equal(countryByNumeric(76)?.iso3, "BRA");
  assert.equal(countryByNumeric("040")?.iso3, "AUT");
});

test("every sample event is flagged as demo and unverified", () => {
  for (const e of SAMPLE_EVENTS) {
    assert.equal(e.demo, true);
    assert.equal(e.source.verified, false);
    assert.match(e.title, /^Sample:/);
    assert.ok(Math.abs(e.lat) <= 90 && Math.abs(e.lon) <= 180);
    if (e.relatedChokepoint) assert.ok(CHOKEPOINTS.some((c) => c.id === e.relatedChokepoint));
  }
});

test("chokepoints have valid coordinates and channels", () => {
  for (const c of CHOKEPOINTS) {
    assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180);
    assert.ok(c.channels.length > 0);
  }
});

test("topojson decoder handles quantised arcs, shared arcs and reversal", () => {
  // Two unit squares sharing an edge. Arc 0 is the shared edge (x=1, from y=0 to y=1).
  const topo: Topology = {
    type: "Topology",
    transform: { scale: [1, 1], translate: [0, 0] },
    arcs: [
      [[1, 0], [0, 1]],                 // shared: (1,0)->(1,1)
      [[1, 1], [-1, 0], [0, -1], [1, 0]], // left: (1,1)->(0,1)->(0,0)->(1,0)
      [[1, 0], [1, 0], [0, 1], [-1, 0]],  // right: (1,0)->(2,0)->(2,1)->(1,1)
    ],
    objects: {
      countries: {
        type: "GeometryCollection",
        geometries: [
          { type: "Polygon", id: "001", arcs: [[0, 1]], properties: { name: "Left" } },
          { type: "MultiPolygon", id: 2, arcs: [[[2, ~0]]] },
          { type: null, id: "003" },
        ],
      },
    },
  };
  const fc = feature(topo, "countries");
  assert.equal(fc.features.length, 3);
  const left = fc.features[0]!;
  assert.equal(left.id, "001");
  assert.equal(left.properties.name, "Left");
  assert.deepEqual(left.geometry, { type: "Polygon", coordinates: [[[1, 0], [1, 1], [0, 1], [0, 0], [1, 0]]] });
  const right = fc.features[1]!;
  assert.equal(right.id, "2");
  assert.deepEqual(right.geometry, { type: "MultiPolygon", coordinates: [[[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]]] });
  assert.equal(fc.features[2]!.geometry, null);
  assert.throws(() => feature(topo, "missing"));
});

test("world bank parsers pick the latest non-null value and sort history", () => {
  const payload = [
    { page: 1, pages: 1, per_page: 50, total: 3 },
    [
      { indicator: { id: "NY.GDP.MKTP.KD.ZG" }, date: "2024", value: null },
      { indicator: { id: "NY.GDP.MKTP.KD.ZG" }, date: "2023", value: 1.5 },
      { indicator: { id: "NY.GDP.MKTP.KD.ZG" }, date: "2022", value: -0.4 },
    ],
  ];
  const def = PROFILE_INDICATORS.find((d) => d.id === "NY.GDP.MKTP.KD.ZG")!;
  const latest = parseLatest(payload, def);
  assert.equal(latest.value, 1.5);
  assert.equal(latest.year, "2023");
  assert.deepEqual(parseHistory(payload), [
    { year: 2022, value: -0.4 },
    { year: 2023, value: 1.5 },
  ]);
  assert.equal(parseLatest([{ page: 1 }, null], def).value, null);
  assert.throws(() => parseLatest([{ message: [{ id: "120", value: "Invalid value" }] }], def));
  assert.throws(() => parseLatest({ nope: true }, def));
});
