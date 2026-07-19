const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1024, height: 1024 });
  await page.setContent(`<!DOCTYPE html>
<html>
<head>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1024px; height: 1024px; background: #0B2A4A; display: flex; align-items: center; justify-content: center; }
</style>
</head>
<body>
<svg width="900" height="900" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="50" fill="#E5A800" />
  <circle cx="50" cy="50" r="44" fill="#FBBF24" />
  <polygon
    points="50,17 24,43 37,43 37,77 63,77 63,43 76,43"
    fill="#5EEAD4"
    stroke="#ffffff"
    stroke-width="4"
    stroke-linejoin="round"
  />
</svg>
</body>
</html>`);
  await page.waitForTimeout(200);
  const outPath = path.join(__dirname, '..', 'public', 'icon-1024-master.png');
  await page.screenshot({ path: outPath, fullPage: false, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  await browser.close();
  console.log('Generated:', outPath);
})();
