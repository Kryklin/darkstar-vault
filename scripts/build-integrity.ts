import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const electronDistPath = path.join(__dirname, '..', 'dist', 'electron');
const filesToHash = ['main.js', 'preload.js'];
const integrity = {};

filesToHash.forEach((file) => {
  const filePath = path.join(electronDistPath, file);
  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const hex = hashSum.digest('hex');
    integrity[file] = hex;
  } else {
    console.warn(`File not found for integrity hashing: ${file}`);
  }
});

fs.writeFileSync(path.join(electronDistPath, 'integrity.json'), JSON.stringify(integrity, null, 2));
console.log('Integrity signatures generated successfully.');
