import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targets = ['node_modules', 'dist', 'out', '.angular/cache', 'coverage'];

console.log('🧹 Purging workspace artifacts...');

targets.forEach((target) => {
  const fullPath = path.join(__dirname, '..', target);
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`✔ Deleted: ${target}`);
    } catch (err) {
      console.error(`✖ Failed to delete: ${target}`);
      console.error(err);
    }
  } else {
    console.log(`- Skipped: ${target} (Not found)`);
  }
});

console.log('✨ Workspace clean complete!');
