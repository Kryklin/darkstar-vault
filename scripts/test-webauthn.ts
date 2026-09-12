import * as crypto from 'crypto';
import {
  verifyWebAuthnAssertion,
  NativeWebAuthnRecord,
} from '../electron/webauthn-verifier';

/**
 * WebAuthn Sign-Counter State Mutation Ordering & Regression Test Suite
 *
 * Verifies the critical invariant:
 * State mutation (sign counter advancement and disk persistence) must ONLY occur
 * after cryptographic ECDSA P-256 signature verification succeeds.
 */
async function runTests() {
  console.log('\n🔐 Running WebAuthn Sign-Counter Ordering Regression Tests...\n');
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

  // Generate authentic P-256 Keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const rawPublicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const publicKeyBase64 = rawPublicKeyDer.toString('base64');

  const rawId = crypto.randomBytes(32);
  const idBase64 = rawId.toString('base64');
  const origin = 'http://localhost:54321';
  const rpId = 'localhost';
  const rpIdHash = crypto.createHash('sha256').update(rpId).digest();

  const challengeBytes = crypto.randomBytes(32);
  const challengeUrlSafe = challengeBytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: 'webauthn.get',
      challenge: challengeUrlSafe,
      origin: origin,
      crossOrigin: false,
    }),
    'utf8'
  );
  const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();

  function buildAuthData(counterVal: number): Buffer {
    const buf = Buffer.alloc(37);
    rpIdHash.copy(buf, 0);
    buf[32] = 0x05; // UP (0x01) | UV (0x04)
    buf.writeUInt32BE(counterVal, 33);
    return buf;
  }

  // --- Test 1: Valid assertion + increasing counter -> succeeds and persists new counter ---
  {
    const initialCounter = 10;
    const newCounter = 25;
    const registry: Record<string, NativeWebAuthnRecord> = {
      [idBase64]: {
        idBase64,
        publicKeyBase64,
        counter: initialCounter,
        createdAt: Date.now(),
      },
    };

    let persisted = false;
    const authData = buildAuthData(newCounter);
    const signedData = Buffer.concat([authData, clientDataHash]);
    const validSig = crypto.sign('SHA256', signedData, privateKey);

    const result = await verifyWebAuthnAssertion({
      rawId,
      clientDataJSON,
      authenticatorData: authData,
      signature: validSig,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: challengeBytes,
      registry,
      onPersistRegistry: async (r) => {
        persisted = true;
        assert(r[idBase64].counter === newCounter, 'Persisted registry contains new counter value');
      },
    });

    assert(result.success === true, 'Test 1: Valid assertion + increasing counter succeeds');
    assert(persisted === true, 'Test 1: Persistence callback was invoked');
    assert(registry[idBase64].counter === newCounter, 'Test 1: Registry counter was updated to new value');
  }

  // --- Test 2: Valid assertion + unchanged/rolled-back counter -> rejected ---
  {
    const initialCounter = 30;
    const rolledBackCounter = 20;
    const registry: Record<string, NativeWebAuthnRecord> = {
      [idBase64]: {
        idBase64,
        publicKeyBase64,
        counter: initialCounter,
        createdAt: Date.now(),
      },
    };

    let persisted = false;
    const authData = buildAuthData(rolledBackCounter);
    const signedData = Buffer.concat([authData, clientDataHash]);
    const validSig = crypto.sign('SHA256', signedData, privateKey);

    const result = await verifyWebAuthnAssertion({
      rawId,
      clientDataJSON,
      authenticatorData: authData,
      signature: validSig,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: challengeBytes,
      registry,
      onPersistRegistry: async () => {
        persisted = true;
      },
    });

    assert(result.success === false, 'Test 2: Rolled-back counter is rejected');
    assert(result.error?.includes('roll-back') === true, 'Test 2: Error indicates counter roll-back');
    assert(persisted === false, 'Test 2: Registry is NOT persisted on roll-back');
    assert(registry[idBase64].counter === initialCounter, 'Test 2: Registry counter remains unmutated');
  }

  // --- Test 3: Invalid signature + higher counter -> rejected AND counter remains unchanged ---
  {
    const initialCounter = 40;
    const hugeCounter = 999999;
    const registry: Record<string, NativeWebAuthnRecord> = {
      [idBase64]: {
        idBase64,
        publicKeyBase64,
        counter: initialCounter,
        createdAt: Date.now(),
      },
    };

    let persisted = false;
    const authData = buildAuthData(hugeCounter);
    // Invalid signature (does not match private key)
    const invalidSig = crypto.randomBytes(64);

    const result = await verifyWebAuthnAssertion({
      rawId,
      clientDataJSON,
      authenticatorData: authData,
      signature: invalidSig,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: challengeBytes,
      registry,
      onPersistRegistry: async () => {
        persisted = true;
      },
    });

    assert(result.success === false, 'Test 3: Invalid signature is rejected');
    assert(result.error?.includes('signature mismatch') === true, 'Test 3: Error indicates signature mismatch');
    assert(persisted === false, 'Test 3: Invariant satisfied - registry was NOT persisted on invalid signature');
    assert(
      registry[idBase64].counter === initialCounter,
      `Test 3: Invariant satisfied - counter remained ${initialCounter}, did NOT advance to ${hugeCounter}`
    );
  }

  // --- Test 4: Invalid signature + lower counter -> rejected AND counter remains unchanged ---
  {
    const initialCounter = 50;
    const lowerCounter = 10;
    const registry: Record<string, NativeWebAuthnRecord> = {
      [idBase64]: {
        idBase64,
        publicKeyBase64,
        counter: initialCounter,
        createdAt: Date.now(),
      },
    };

    let persisted = false;
    const authData = buildAuthData(lowerCounter);
    const invalidSig = crypto.randomBytes(64);

    const result = await verifyWebAuthnAssertion({
      rawId,
      clientDataJSON,
      authenticatorData: authData,
      signature: invalidSig,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: challengeBytes,
      registry,
      onPersistRegistry: async () => {
        persisted = true;
      },
    });

    assert(result.success === false, 'Test 4: Invalid signature with lower counter is rejected');
    assert(result.error?.includes('signature mismatch') === true, 'Test 4: Error indicates signature mismatch');
    assert(persisted === false, 'Test 4: Invariant satisfied - registry was NOT persisted');
    assert(registry[idBase64].counter === initialCounter, 'Test 4: Invariant satisfied - counter remained unchanged');
  }

  // --- Test 5: Unknown credential ID -> rejected without registry mutation ---
  {
    const initialCounter = 60;
    const registry: Record<string, NativeWebAuthnRecord> = {
      [idBase64]: {
        idBase64,
        publicKeyBase64,
        counter: initialCounter,
        createdAt: Date.now(),
      },
    };

    let persisted = false;
    const unknownRawId = crypto.randomBytes(32);
    const authData = buildAuthData(70);
    const signedData = Buffer.concat([authData, clientDataHash]);
    const validSig = crypto.sign('SHA256', signedData, privateKey);

    const result = await verifyWebAuthnAssertion({
      rawId: unknownRawId,
      clientDataJSON,
      authenticatorData: authData,
      signature: validSig,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: challengeBytes,
      registry,
      onPersistRegistry: async () => {
        persisted = true;
      },
    });

    assert(result.success === false, 'Test 5: Unknown credential ID is rejected');
    assert(result.error?.includes('not enrolled') === true, 'Test 5: Error indicates credential ID not enrolled');
    assert(persisted === false, 'Test 5: Registry was NOT persisted');
    assert(registry[idBase64].counter === initialCounter, 'Test 5: Registry remained byte-for-byte unchanged');
    assert(Object.keys(registry).length === 1, 'Test 5: No new records added to registry');
  }

  console.log(`\n🎉 All ${passed}/${total} WebAuthn State Mutation Regression Tests PASSED!\n`);
}

runTests().catch((err) => {
  console.error('\n❌ WebAuthn Regression Tests Failed:', err);
  process.exit(1);
});
