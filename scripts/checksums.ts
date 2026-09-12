import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAKE_DIR = path.join(__dirname, '../out/make');
const OUT_FILE = path.join(__dirname, '../checksums.txt');

console.log('🔒 Generating SHA-256 checksums for release artifacts...');

if (!fs.existsSync(MAKE_DIR)) {
  console.log('✖ Directory out/make does not exist. No artifacts to hash.');
  process.exit(0);
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
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
