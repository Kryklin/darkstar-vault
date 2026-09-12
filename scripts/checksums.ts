import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAKE_DIR = path.join(__dirname, '../out/make');
const OUT_FILE = path.join(__dirname, '../checksums.txt');

console.log('🔒 Generating SHA-256 checksums for release artifacts...');

if (!fs.existsSync(MAKE_DIR)) {
  console.log('✖ Directory out/make does not exist. No artifacts to hash.');
  process.exit(0);
}

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function (file) {
    if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
      arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, file));
    }
  });

  return arrayOfFiles;
}

const allFiles = getAllFiles(MAKE_DIR);
const artifactFiles = allFiles.filter((f) => {
  const ext = path.extname(f).toLowerCase();
  return ['.exe', '.zip', '.appimage', '.dmg', '.rpm', '.deb'].includes(ext);
});

if (artifactFiles.length === 0) {
  console.log('✖ No release artifacts found in out/make.');
  process.exit(0);
}

let checksumsOutput = '';

artifactFiles.forEach((file) => {
  const fileBuffer = fs.readFileSync(file);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hex = hashSum.digest('hex');
  const relativeName = path.basename(file);
  console.log(`✔ Hashed: ${relativeName}`);
  checksumsOutput += `${hex} *${relativeName}\n`;
});

fs.writeFileSync(OUT_FILE, checksumsOutput, 'utf8');
console.log(`\n✨ Checksums successfully written to ${OUT_FILE}`);
