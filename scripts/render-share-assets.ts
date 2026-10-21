/**
 * Renders the social sharing assets from the real interface (`/share/card`) into `public/media/`.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   CHROMIUM_PATH=/path/to/chrome node scripts/render-share-assets.ts [http://localhost:4173] [--images-only]
 *
 * PNG images: one per entry in SHARE_IMAGES. Story video: 300 frames (10 s at 30 fps) of a full globe turn, so the loop is
 * seamless, encoded with the system ffmpeg to H.264 MP4 and VP8 WebM. Re-run whenever the cards or brand change.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { SHARE_IMAGES, STORY_VIDEO } from '../shared/share.ts';

const imagesOnly = process.argv.includes('--images-only');
const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const out = join(import.meta.dirname, '..', 'public', 'media');
const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FPS = 30;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath });

async function open(id: string, width: number, height: number) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${base}/share/card?id=${id}`);
  await page.waitForSelector(`[data-share-card="${id}"]`);
  await page.evaluate('document.fonts.ready');
  await page.waitForTimeout(400);
  return page;
}

for (const img of SHARE_IMAGES) {
  const page = await open(img.id, img.width, img.height);
  const file = join(out, img.file);
  await page.screenshot({ path: file, type: 'png' });
  await page.close();
  console.log(`${img.file}  ${img.width}x${img.height}  ${(statSync(file).size / 1024).toFixed(0)} kB`);
}

if (imagesOnly) {
  await browser.close();
  process.exit(0);
}

const frames = mkdtempSync(join(tmpdir(), 'av-story-'));
const page = await open('story', STORY_VIDEO.width, STORY_VIDEO.height);
const total = STORY_VIDEO.seconds * FPS;
for (let i = 0; i < total; i++) {
  await page.evaluate(`window.dispatchEvent(new CustomEvent('av-share-frame', { detail: ${i / total} }))`);
  await page.screenshot({ path: join(frames, `f${String(i).padStart(4, '0')}.png`), type: 'png' });
}
await page.close();
await browser.close();

const input = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, 'f%04d.png')];
execFileSync('ffmpeg', [...input, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(out, STORY_VIDEO.mp4)]);
execFileSync('ffmpeg', [...input, '-c:v', 'libvpx', '-b:v', '1200k', '-crf', '12', '-pix_fmt', 'yuv420p', '-an', join(out, STORY_VIDEO.webm)]);
rmSync(frames, { recursive: true, force: true });
for (const f of [STORY_VIDEO.mp4, STORY_VIDEO.webm]) console.log(`${f}  ${(statSync(join(out, f)).size / 1024).toFixed(0)} kB`);
