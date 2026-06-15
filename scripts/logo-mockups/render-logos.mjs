import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outputDir = path.join(repoRoot, 'public', 'logos');

const cards = [
  { html: '01-round-up-coin.html',       out: '01-round-up-coin.png'       },
  { html: '02-change-with-heart.html',   out: '02-change-with-heart.png'   },
  { html: '03-pocket-drop.html',         out: '03-pocket-drop.png'         },
  { html: '04-monogram-p.html',          out: '04-monogram-p.png'          },
  { html: '05-small-change-grows.html',  out: '05-small-change-grows.png'  },
];

fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

// Use a context with deviceScaleFactor: 2 for retina-quality @2x renders
const context = await browser.newContext({
  viewport: { width: 1200, height: 760 },
  deviceScaleFactor: 2,
});

for (const card of cards) {
  const htmlPath = path.join(__dirname, card.html);
  const outPath  = path.join(outputDir, card.out);
  const fileUrl  = `file://${htmlPath}`;

  const page = await context.newPage();

  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  // Wait for Google Fonts to fully load
  await page.evaluate(() => document.fonts.ready);

  // Extra settle time for font rendering
  await page.waitForTimeout(600);

  await page.screenshot({
    path: outPath,
    type: 'png',
    clip: { x: 0, y: 0, width: 1200, height: 760 },
  });

  await page.close();
  console.log(`Rendered: ${card.out} -> ${outPath}`);
}

await context.close();
await browser.close();
console.log('All 5 logos rendered successfully.');
