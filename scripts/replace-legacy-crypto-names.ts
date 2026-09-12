import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

interface ReplacementRule {
  pattern: RegExp;
  replacement: string;
  description: string;
}

const RULES: ReplacementRule[] = [
  // IPC & API Method Names
  { pattern: /\bdAsPEncrypt\b/g, replacement: 'dArxEncrypt', description: 'dAsPEncrypt -> dArxEncrypt' },
  { pattern: /\bdAsPDecrypt\b/g, replacement: 'dArxDecrypt', description: 'dAsPDecrypt -> dArxDecrypt' },
  { pattern: /\bdAsPCheckEngine\b/g, replacement: 'dArxCheckEngine', description: 'dAsPCheckEngine -> dArxCheckEngine' },
  { pattern: /\bdAsPFetchEngine\b/g, replacement: 'dArxFetchEngine', description: 'dAsPFetchEngine -> dArxFetchEngine' },
  { pattern: /\bencryptBinaryDAsP\b/g, replacement: 'encryptBinaryDArx', description: 'encryptBinaryDAsP -> encryptBinaryDArx' },
  { pattern: /\brunDAsPCommand\b/g, replacement: 'runDArxCommand', description: 'runDAsPCommand -> runDArxCommand' },

  // IPC Channel Names
  { pattern: /'dasp-encrypt'/g, replacement: "'darx-encrypt'", description: "'dasp-encrypt' -> 'darx-encrypt'" },
  { pattern: /'dasp-decrypt'/g, replacement: "'darx-decrypt'", description: "'dasp-decrypt' -> 'darx-decrypt'" },
  { pattern: /'dasp-check-engine'/g, replacement: "'darx-check-engine'", description: "'dasp-check-engine' -> 'darx-check-engine'" },
  { pattern: /'dasp-fetch-engine'/g, replacement: "'darx-fetch-engine'", description: "'dasp-fetch-engine' -> 'darx-fetch-engine'" },

  // Variables & Binary Names
  { pattern: /\baspAlias\b/g, replacement: 'arxAlias', description: 'aspAlias -> arxAlias' },
  { pattern: /`dasp\$\{ext\}`/g, replacement: '`darx${ext}`', description: '`dasp${ext}` -> `darx${ext}`' },
  { pattern: /`bin\/dasp\$\{ext\}`/g, replacement: '`bin/d-arx${ext}`', description: '`bin/dasp${ext}` -> `bin/d-arx${ext}`' },

  // Protocol & Brand Terms
  { pattern: /\bThe D-ASP Protocol\b/g, replacement: 'The D-ARX Protocol', description: 'The D-ASP Protocol -> The D-ARX Protocol' },
  { pattern: /D-ASP \(Darkstar Algebraic Substitution & Permutation\)/g, replacement: 'D-ARX (Darkstar Autoregressive Permutation & Exchange)', description: 'D-ASP expanded name -> D-ARX' },
  { pattern: /D-ASP V9 ELITE INTEROP VALIDATION/g, replacement: 'D-ARX-512 CORE INTEROP VALIDATION', description: 'D-ASP V9 badge -> D-ARX-512 CORE' },
  { pattern: /D-ASP SIGNAL/g, replacement: 'D-ARX SIGNAL', description: 'D-ASP SIGNAL -> D-ARX SIGNAL' },
  { pattern: /\bD-ASP\b/g, replacement: 'D-ARX', description: 'D-ASP -> D-ARX' },
  { pattern: /\bD-Asp\b/g, replacement: 'D-ARX', description: 'D-Asp -> D-ARX' },
  { pattern: /\bd-asp\b/g, replacement: 'd-arx', description: 'd-asp -> d-arx' },
  { pattern: /\bDASP\b/g, replacement: 'DARX', description: 'DASP -> DARX' },

  // Legacy SPNA / DSPN / SPN variants
  { pattern: /\bd-spna\b/gi, replacement: 'd-arx', description: 'd-spna -> d-arx' },
  { pattern: /\bdspna\b/gi, replacement: 'darx', description: 'dspna -> darx' },
  { pattern: /\bdspn\b/gi, replacement: 'darx', description: 'dspn -> darx' },
  { pattern: /\bspna\b/gi, replacement: 'd-arx', description: 'spna -> d-arx' },
];

const SCAN_DIRECTORIES = ['src', 'electron', 'scripts'];
const SCAN_FILES = ['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'forge.config.js', '.env.example'];

const IGNORE_PATTERNS = [/node_modules/, /\/dist\//, /\\dist\\/, /\.git/, /package-lock\.json/];

function getAllFiles(dirPath: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dirPath)) return results;
  const list = fs.readdirSync(dirPath);

  for (const file of list) {
    const fullPath = path.join(dirPath, file);
    if (IGNORE_PATTERNS.some((p) => p.test(fullPath))) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath));
    } else {
      const ext = path.extname(file).toLowerCase();
      if (['.ts', '.js', '.html', '.scss', '.json', '.md'].includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

(async () => {
  const isDryRun = process.argv.includes('--check');

  console.log(`\n🔍 Scanning codebase for legacy crypto references (D-ASP, D-SPNA, SPNA, etc.)...\n`);

  let targetFiles: string[] = [];
  for (const dir of SCAN_DIRECTORIES) {
    targetFiles = targetFiles.concat(getAllFiles(path.join(rootDir, dir)));
  }
  for (const file of SCAN_FILES) {
    const fullPath = path.join(rootDir, file);
    if (fs.existsSync(fullPath)) {
      targetFiles.push(fullPath);
    }
  }

  // Remove self from scanning
  targetFiles = targetFiles.filter((f) => path.resolve(f) !== path.resolve(__filename));

  let totalChanges = 0;
  const modifiedFiles: { file: string; changes: number; details: string[] }[] = [];

  for (const filePath of targetFiles) {
    let content = fs.readFileSync(filePath, 'utf8');
    let fileModified = false;
    let fileChangeCount = 0;
    const details: string[] = [];

    for (const rule of RULES) {
      const matches = content.match(rule.pattern);
      if (matches) {
        const count = matches.length;
        content = content.replace(rule.pattern, rule.replacement);
        fileModified = true;
        fileChangeCount += count;
        details.push(`${rule.description} (${count}x)`);
      }
    }

    if (fileModified) {
      totalChanges += fileChangeCount;
      const relPath = path.relative(rootDir, filePath);
      modifiedFiles.push({ file: relPath, changes: fileChangeCount, details });

      if (!isDryRun) {
        fs.writeFileSync(filePath, content, 'utf8');
      }
    }
  }

  if (modifiedFiles.length === 0) {
    console.log(`✨ No legacy references found! Codebase is 100% compliant with D-ARX naming.\n`);
    process.exit(0);
  }

  console.log(`Found legacy references across ${modifiedFiles.length} file(s):\n`);
  for (const item of modifiedFiles) {
    console.log(`  📄 ${item.file} [${item.changes} change(s)]`);
    for (const d of item.details) {
      console.log(`     ↳ ${d}`);
    }
  }

  if (isDryRun) {
    console.log(`\n⚠️  Dry run mode (--check). ${totalChanges} replacements detected but not written.`);
  } else {
    console.log(`\n✔ Successfully replaced ${totalChanges} legacy references with D-ARX / Darx across ${modifiedFiles.length} file(s)!\n`);
  }
})();
