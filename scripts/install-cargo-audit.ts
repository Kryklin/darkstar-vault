import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const url = 'https://github.com/rustsec/rustsec/releases/download/cargo-audit/v0.20.1/cargo-audit-x86_64-pc-windows-msvc.zip';
const tempZip = path.join(process.env.TEMP, 'cargo-audit.zip');
const destDir = path.join(process.env.USERPROFILE, '.cargo', 'bin');

console.log('Downloading cargo-audit...');
const file = fs.createWriteStream(tempZip);
https
  .get(url, (response) => {
    if (response.statusCode === 301 || response.statusCode === 302) {
      https.get(response.headers.location, (res) => {
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            console.log('Download complete. Extracting...');
            try {
              execSync(`powershell -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${process.env.TEMP}\\cargo-audit-ext' -Force"`);
              const exePath = path.join(process.env.TEMP, 'cargo-audit-ext', 'cargo-audit-x86_64-pc-windows-msvc', 'cargo-audit.exe');
              if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
              fs.copyFileSync(exePath, path.join(destDir, 'cargo-audit.exe'));
              console.log('cargo-audit installed successfully to .cargo/bin!');
            } catch (e) {
              console.error('Failed to extract:', e.message);
            }
          });
        });
      });
    }
  })
  .on('error', (err) => {
    fs.unlink(tempZip, () => {});
    console.error('Error downloading:', err.message);
  });
