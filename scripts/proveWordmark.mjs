/**
 * proveWordmark.mjs
 * Playwright script to capture frame-by-frame screenshots of the
 * stroke-by-stroke handwriting animation on https://pocketcache.app/demo/?reset=1
 *
 * Run: node scripts/proveWordmark.mjs
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = '/tmp/hw';
mkdirSync(OUT_DIR, { recursive: true });

const TARGET_URL = 'https://pocketcache.app/demo/?reset=1';
const FRAMES = [
  { delay: 150, name: 'frame_150' },
  { delay: 400, name: 'frame_400' },
  { delay: 800, name: 'frame_800' },
  { delay: 1300, name: 'frame_1300' },
  { delay: 2000, name: 'frame_2000' },
  { delay: 2800, name: 'frame_2800' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  console.log(`Navigating to ${TARGET_URL} ...`);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for the SVG wordmark to be present in DOM
  // The component renders an <svg> with paths; wait for it
  await page.waitForSelector('svg[aria-label="PocketCache"]', { timeout: 10000 })
    .catch(() => {
      console.warn('SVG wordmark selector not found; trying generic svg');
    });

  // The animation starts ~60ms after mount. We want to capture it in-progress.
  // Reload the page to reset and capture right away.
  console.log('Reloading to reset animation timing...');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });

  // Wait briefly for React to mount
  await page.waitForTimeout(80);

  // Capture frames at specified delays relative to now
  let t0 = Date.now();

  for (const { delay, name } of FRAMES) {
    const target = t0 + delay;
    const now = Date.now();
    const wait = target - now;
    if (wait > 0) await page.waitForTimeout(wait);

    const path = `${OUT_DIR}/${name}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log(`Saved ${path} (elapsed: ${Date.now() - t0}ms)`);
  }

  await browser.close();
  console.log('Done. Check /tmp/hw/ for screenshots.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
