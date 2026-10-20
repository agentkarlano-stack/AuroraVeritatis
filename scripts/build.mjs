#!/usr/bin/env node
/**
 * Production build for the client SPA → dist/client (served by Workers Static Assets).
 * The Worker itself is bundled by Wrangler at deploy time from src/worker/index.ts.
 *
 *   node scripts/build.mjs                 build once
 *   node scripts/build.mjs --watch         rebuild on change (development)
 *   node scripts/build.mjs --require-basemap  fail if world-atlas geometry is missing (CI)
 */
import * as esbuild from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist/client");
const args = new Set(process.argv.slice(2));
const watch = args.has("--watch");
const dev = watch || args.has("--dev");

async function copyStatic() {
  await cp(path.join(root, "public"), out, { recursive: true });
  const require = createRequire(import.meta.url);
  let basemap = null;
  try {
    basemap = require.resolve("world-atlas/countries-110m.json", { paths: [root] });
  } catch {
    /* not installed */
  }
  if (basemap && existsSync(basemap)) {
    await mkdir(path.join(out, "geo"), { recursive: true });
    await cp(basemap, path.join(out, "geo/countries-110m.json"));
  } else if (args.has("--require-basemap")) {
    throw new Error("world-atlas is not installed: the map basemap cannot be built. Run `npm install`.");
  } else {
    console.warn("! world-atlas not found — the map will render without country shapes. Run `npm install`.");
  }
}

async function writeHtml(metafile) {
  const outputs = Object.entries(metafile.outputs);
  const js = outputs.find(([, o]) => o.entryPoint?.endsWith("main.tsx"));
  if (!js) throw new Error("JS entry output missing");
  const css = js[1].cssBundle;
  const toUrl = (p) => "/" + path.relative(out, path.join(root, p)).split(path.sep).join("/");
  const template = await readFile(path.join(root, "src/client/index.html"), "utf8");
  const html = template.replace("%JS%", toUrl(js[0])).replace("%CSS%", css ? toUrl(css) : "");
  await writeFile(path.join(out, "index.html"), html);
}

const options = {
  entryPoints: [path.join(root, "src/client/main.tsx")],
  bundle: true,
  outdir: path.join(out, "assets"),
  entryNames: dev ? "[name]" : "[name]-[hash]",
  format: "esm",
  target: ["es2020", "chrome100", "firefox100", "safari15"],
  jsx: "automatic",
  minify: !dev,
  sourcemap: dev ? "inline" : "linked",
  metafile: true,
  legalComments: "linked",
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
  logLevel: "info",
};

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await copyStatic();

if (watch) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{
      name: "html",
      setup(build) {
        build.onEnd(async (r) => {
          if (r.metafile) await writeHtml(r.metafile);
        });
      },
    }],
  });
  await ctx.watch();
  console.log("Watching for changes…");
} else {
  const result = await esbuild.build(options);
  await writeHtml(result.metafile);
  const size = Object.values(result.metafile.outputs).reduce((a, o) => a + o.bytes, 0);
  console.log(`Built dist/client (${(size / 1024).toFixed(0)} KiB of assets)`);
}
