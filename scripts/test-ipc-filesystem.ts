import path from 'path';
import type { BrowserWindow } from 'electron';
import { isPathContained, sanitizeVaultFilename, assertValidIpcSender } from '../electron/security-utils';

async function runTests() {
  console.log('\n🔒 Running Filesystem Containment & IPC Security Regression Tests...\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, message: string) {
    total++;
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    passed++;
    console.log(`  ✓ ${message}`);
  }

  const baseDir = path.resolve('/test/enclave/vault');

  // 1. isPathContained tests
  assert(isPathContained(baseDir, path.join(baseDir, 'file.txt')), 'Test 1: Normal contained child path is accepted');
  assert(isPathContained(baseDir, path.join(baseDir, 'nested', 'subdir', 'file.txt')), 'Test 2: Nested child path is accepted');
  assert(isPathContained(baseDir, path.join(baseDir, 'sub', '..', 'file.txt')), 'Test 3: Internal traversal that stays within root is accepted');
  assert(!isPathContained(baseDir, path.join(baseDir, '..', 'secret.txt')), 'Test 4: Traversal escaping root directory is rejected');
  assert(!isPathContained(baseDir, path.resolve('/etc/passwd')), 'Test 5: Absolute external path is rejected');
  assert(!isPathContained(baseDir, `${baseDir}/file.txt\0evil`), 'Test 6: Path containing null byte is rejected');
  assert(!isPathContained(baseDir, '\\\\malicious-server\\share\\data'), 'Test 7: Windows UNC path is rejected');
  assert(!isPathContained(baseDir, '//malicious-server/share/data'), 'Test 8: Unix-syntax UNC path is rejected');

  // 2. sanitizeVaultFilename tests
  assert(sanitizeVaultFilename('vault-entry.json') === 'vault-entry.json', 'Test 9: Valid standard filename accepted');
  assert(sanitizeVaultFilename('backup_2026-09-12.enc') === 'backup_2026-09-12.enc', 'Test 10: Valid complex filename accepted');

  // Traversal & separators
  let threw = false;
  try {
    sanitizeVaultFilename('../passwords.txt');
  } catch {
    threw = true;
  }
  assert(threw, 'Test 11: Traversal filename is rejected');

  threw = false;
  try {
    sanitizeVaultFilename('sub/passwords.txt');
  } catch {
    threw = true;
  }
  assert(threw, 'Test 12: Slash separator is rejected');

  threw = false;
  try {
    sanitizeVaultFilename('sub\\passwords.txt');
  } catch {
    threw = true;
  }
  assert(threw, 'Test 13: Backslash separator is rejected');

  // Null bytes
  threw = false;
  try {
    sanitizeVaultFilename('valid.txt\0.exe');
  } catch {
    threw = true;
  }
  assert(threw, 'Test 14: Null byte injection is rejected');

  // Windows reserved device names
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1', 'con.txt', 'AUX.dat'];
  for (const resName of reservedNames) {
    threw = false;
    try {
      sanitizeVaultFilename(resName);
    } catch {
      threw = true;
    }
    assert(threw, `Test 15: Reserved device name '${resName}' is rejected`);
  }

  // Illegal characters
  const illegalNames = ['file*name', 'file?name', 'file:name', 'file<name', 'file>name', 'file|name', 'file name with spaces', ''];
  for (const illName of illegalNames) {
    threw = false;
    try {
      sanitizeVaultFilename(illName);
    } catch {
      threw = true;
    }
    assert(threw, `Test 16: Illegal character filename '${illName}' is rejected`);
  }

  // Filename too long (> 255 chars)
  threw = false;
  try {
    sanitizeVaultFilename('a'.repeat(256));
  } catch {
    threw = true;
  }
  assert(threw, 'Test 17: Filename exceeding 255 characters is rejected');

  // 3. assertValidIpcSender tests
  const mockWindow = {} as BrowserWindow;
  const mockLookup = (contents: unknown) => (contents ? mockWindow : null);

  // Production mode: app: protocol
  const validProdEvent = {
    sender: { getURL: () => 'app://index.html' },
    senderFrame: { url: 'app://index.html' },
  };
  let ipcThrew = false;
  try {
    assertValidIpcSender(validProdEvent as never, mockLookup, true);
  } catch {
    ipcThrew = true;
  }
  assert(!ipcThrew, 'Test 18: app: origin accepted in production');

  // Dev mode: localhost:4200 allowed
  const validDevEvent = {
    sender: { getURL: () => 'http://localhost:4200/' },
    senderFrame: { url: 'http://localhost:4200/' },
  };
  ipcThrew = false;
  try {
    assertValidIpcSender(validDevEvent as never, mockLookup, false);
  } catch {
    ipcThrew = true;
  }
  assert(!ipcThrew, 'Test 19: localhost:4200 accepted in dev mode');

  // Production mode: localhost:4200 REJECTED
  ipcThrew = false;
  try {
    assertValidIpcSender(validDevEvent as never, mockLookup, true);
  } catch {
    ipcThrew = true;
  }
  assert(ipcThrew, 'Test 20: localhost:4200 rejected in production mode');

  // External / untrusted web origin: REJECTED in all modes
  const evilEvent = {
    sender: { getURL: () => 'https://attacker.example.com/' },
    senderFrame: { url: 'https://attacker.example.com/' },
  };
  ipcThrew = false;
  try {
    assertValidIpcSender(evilEvent as never, mockLookup, false);
  } catch {
    ipcThrew = true;
  }
  assert(ipcThrew, 'Test 21: External web origin is rejected in dev mode');

  ipcThrew = false;
  try {
    assertValidIpcSender(evilEvent as never, mockLookup, true);
  } catch {
    ipcThrew = true;
  }
  assert(ipcThrew, 'Test 22: External web origin is rejected in production mode');

  // Missing sender window: REJECTED
  const orphanEvent = {
    sender: { getURL: () => 'app://index.html' },
  };
  ipcThrew = false;
  try {
    assertValidIpcSender(orphanEvent as never, () => null, true);
  } catch {
    ipcThrew = true;
  }
  assert(ipcThrew, 'Test 23: Orphan sender without recognized window is rejected');

  console.log(`\n🎉 All ${passed}/${total} Filesystem & IPC Security Regression Tests PASSED!\n`);
}

runTests().catch((err) => {
  console.error('\n❌ Filesystem & IPC Security Tests Failed:', err);
  process.exit(1);
});
