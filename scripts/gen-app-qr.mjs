import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'public', 'app-qr.svg');

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

console.log('Generated public/app-qr.svg');
