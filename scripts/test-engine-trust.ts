import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadAuthenticatedEngineManifest, verifyEngineBinary, verifyEngineManifestSignature, canonicalizeEngineManifest, EngineManifest } from '../electron/engine-trust';
import { DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY } from '../electron/trust-anchor';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function runTests() {
  console.log('\n🛡️  Running Native D-ARX Engine Trust & Authenticated Manifest Regression Tests...\n');
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

  // 1. Load authenticated manifest and verify trust anchor signature
  const manifest = loadAuthenticatedEngineManifest();
  assert(manifest !== null && typeof manifest === 'object', 'Test 1: Manifest loads successfully');
  assert(verifyEngineManifestSignature(manifest) === true, 'Test 1: Manifest signature is valid against Darkstar Trust Anchor');
  assert(manifest.engines.length > 0, 'Test 1: Manifest contains engine definitions');

  // 2. Test valid engine binary (if d-arx-512.exe exists)
  const validBinPath = path.join(rootDir, 'bin', 'd-arx-512.exe');
  if (fs.existsSync(validBinPath)) {
    const res = await verifyEngineBinary(validBinPath, manifest, {
      expectedPlatform: 'win32',
      expectedArch: 'x64',
    });
    assert(res.valid === true, 'Test 2: Genuine engine binary matches authenticated manifest');
    assert(res.entry?.filename === 'd-arx-512.exe', 'Test 2: Returned matching manifest entry');
  }

  // 3. Test modified binary (tampered content -> hash mismatch)
  const tempDir = path.join(rootDir, 'dist', 'scratch_engine_test');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const tamperedHashBin = path.join(tempDir, 'tampered_hash.exe');
  // Create file with matching size but different content
  const dummyBuf = Buffer.alloc(388096, 0x42);
  fs.writeFileSync(tamperedHashBin, dummyBuf);

  const tamperedHashRes = await verifyEngineBinary(tamperedHashBin, manifest, {
    expectedPlatform: 'win32',
    expectedArch: 'x64',
  });
  assert(tamperedHashRes.valid === false, 'Test 3: Tampered binary content is rejected');
  assert(tamperedHashRes.error?.includes('hash mismatch') === true, 'Test 3: Error indicates SHA-256 hash mismatch');

  // 4. Test modified binary size (size mismatch)
  const tamperedSizeBin = path.join(tempDir, 'tampered_size.exe');
  fs.writeFileSync(tamperedSizeBin, Buffer.from('malicious payload'));

  const tamperedSizeRes = await verifyEngineBinary(tamperedSizeBin, manifest, {
    expectedPlatform: 'win32',
    expectedArch: 'x64',
  });
  assert(tamperedSizeRes.valid === false, 'Test 4: Tampered binary size is rejected');
  assert(tamperedSizeRes.error?.includes('size mismatch') === true, 'Test 4: Error indicates size mismatch');

  // 5. Test wrong platform / architecture rejection
  if (fs.existsSync(validBinPath)) {
    const wrongPlatformRes = await verifyEngineBinary(validBinPath, manifest, {
      expectedPlatform: 'linux',
      expectedArch: 'x64',
    });
    assert(wrongPlatformRes.valid === false, 'Test 5: Binary rejected when platform does not match manifest entry');
    assert(wrongPlatformRes.error?.includes('no manifest entry for platform') === true, 'Test 5: Proper platform error');

    const wrongArchRes = await verifyEngineBinary(validBinPath, manifest, {
      expectedPlatform: 'win32',
      expectedArch: 'arm64',
    });
    assert(wrongArchRes.valid === false, 'Test 5: Binary rejected when architecture does not match manifest entry');
  }

  // 6. Test invalid manifest signature (tampered manifest payload)
  const tamperedManifest: EngineManifest = {
    ...manifest,
    version: '999.0.0', // Tampered!
  };
  assert(verifyEngineManifestSignature(tamperedManifest) === false, 'Test 6: Tampered manifest payload fails trust anchor signature verification');

  if (fs.existsSync(validBinPath)) {
    const invalidManifestRes = await verifyEngineBinary(validBinPath, tamperedManifest, {
      expectedPlatform: 'win32',
      expectedArch: 'x64',
    });
    assert(invalidManifestRes.valid === false, 'Test 6: Binary rejected under invalid manifest signature');
  }

  // 7. Test invalid manifest with fake signature
  const fakeSigManifest: EngineManifest = {
    ...manifest,
    signature: crypto.randomBytes(64).toString('hex'),
  };
  assert(verifyEngineManifestSignature(fakeSigManifest) === false, 'Test 7: Fake manifest signature is rejected');

  // 8. Clean up scratch directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  console.log(`\n🎉 All ${passed}/${total} Native Engine Trust Regression Tests PASSED!\n`);
}

runTests().catch((err) => {
  console.error('\n❌ Native Engine Trust Tests Failed:', err);
  process.exit(1);
});
