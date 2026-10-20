#!/usr/bin/env node
/**
 * Lightweight local preview: serves dist/client with SPA fallback and routes
 * /api/* to the real Worker handler (bundled on the fly with esbuild).
 * Use `npm run dev:worker` (wrangler dev) for a full Workers runtime.
 *
 *   PORT=8787 node scripts/serve.mjs
 */
import * as esbuild from "esbuild";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist/client");
const port = Number(process.env.PORT ?? 8787);

const workerOut = path.join(os.tmpdir(), `av-worker-${process.pid}.mjs`);
await esbuild.build({ entryPoints: [path.join(root, "src/worker/index.ts")], bundle: true, format: "esm", platform: "neutral", outfile: workerOut, logLevel: "warning" });
const worker = (await import(pathToFileURL(workerOut).href)).default;

const env = {
  APP_ENV: "local",
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
};

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json", ".txt": "text/plain" };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (url.pathname.startsWith("/api/")) {
      const r = await worker.fetch(new Request(url, { method: req.method }), env);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let file = path.join(dist, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
    const isFile = await stat(file).then((s) => s.isFile()).catch(() => false);
    if (!isFile) file = path.join(dist, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(e));
  }
}).listen(port, () => console.log(`Aurora Veritatis preview on http://localhost:${port}`));
