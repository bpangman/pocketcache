import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Two copies of the same QR: the app's (served at /demo/app-qr.svg) and the
// marketing site's (landing/nonprofits uses /assets/app-qr.svg). Writing both
// here keeps them from drifting apart.
const outPaths = [
  path.join(__dirname, '..', 'public', 'app-qr.svg'),
  path.join(__dirname, '..', 'landing', 'assets', 'app-qr.svg'),
];

for (const outPath of outPaths) {
  await QRCode.toFile(outPath, 'https://pocketcache.app/app/', {
    type: 'svg',
    errorCorrectionLevel: 'H',
    width: 200,
    margin: 4,
    color: {
      dark: '#0B2A4A',
      light: '#ffffff',
    },
  });
  console.log('Generated', path.relative(path.join(__dirname, '..'), outPath));
}
