import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outputDir = path.join(repoRoot, 'public', 'logos');

const cards = [
  { html: 'r2-01-coin-o-roundup.html',      out: 'r2-01-coin-o-roundup.png'      },
  { html: 'r2-02-coin-o-heart.html',         out: 'r2-02-coin-o-heart.png'         },
  { html: 'r2-03-heart-coin-emblem.html',    out: 'r2-03-heart-coin-emblem.png'    },
  { html: 'r2-04-roundup-coin-emblem.html',  out: 'r2-04-roundup-coin-emblem.png'  },
  { html: 'r2-05-stacked-coins.html',        out: 'r2-05-stacked-coins.png'        },
  { html: 'r2-06-trailing-coin.html',        out: 'r2-06-trailing-coin.png'        },
  { html: 'r2-07-pocket-underline.html',     out: 'r2-07-pocket-underline.png'     },
  { html: 'r2-08-coin-a.html',               out: 'r2-08-coin-a.png'               },
  { html: 'r2-09-cradle-curve.html',         out: 'r2-09-cradle-curve.png'         },
  { html: 'r2-10-drop-coin.html',            out: 'r2-10-drop-coin.png'            },
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
console.log('All 10 round-2 logos rendered successfully.');
