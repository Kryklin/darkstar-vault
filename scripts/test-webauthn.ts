import * as crypto from 'crypto';
import { verifyWebAuthnAssertion, enrollWebAuthnCredential, NativeWebAuthnRecord } from '../electron/webauthn-verifier';

/**
 * WebAuthn Hardening, State Mutation Ordering & Regression Test Suite
 */
async function runTests() {
  console.log('\n🔐 Running Comprehensive WebAuthn Hardening & Regression Tests...\n');
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

  const jwk = publicKey.export({ format: 'jwk' });
  const xCoord = Buffer.from(jwk.x!, 'base64url');
  const yCoord = Buffer.from(jwk.y!, 'base64url');

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
    'utf8',
  );
  const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();

  function buildAuthData(counterVal: number): Buffer {
    const buf = Buffer.alloc(37);
    rpIdHash.copy(buf, 0);
    buf[32] = 0x05; // UP (0x01) | UV (0x04)
    buf.writeUInt32BE(counterVal, 33);
    return buf;
  }

  // Helper to build realistic WebAuthn authData containing attested credential and COSE key
  function buildAttestationAuthData(credId: Buffer, x: Buffer, y: Buffer): Buffer {
    // COSE Map: 1:2 (kty:EC2), 3:-7 (alg:ES256), -1:1 (crv:P-256), -2:x, -3:y
    const coseKey = Buffer.concat([
      Buffer.from([0xa5]),
      Buffer.from([0x01, 0x02]),
      Buffer.from([0x03, 0x26]), // -7 in CBOR
      Buffer.from([0x20, 0x01]), // -1 in CBOR
      Buffer.from([0x21, 0x58, 0x20]),
      x,
      Buffer.from([0x22, 0x58, 0x20]),
      y,
    ]);

    const aaguid = Buffer.alloc(16, 0);
    const credIdLen = Buffer.alloc(2);
    credIdLen.writeUInt16BE(credId.length);

    return Buffer.concat([
      rpIdHash,
      Buffer.from([0x45]), // UP (0x01) | UV (0x04) | AT (0x40)
      Buffer.from([0, 0, 0, 0]),
      aaguid,
      credIdLen,
      credId,
      coseKey,
    ]);
  }

  // Helper to build realistic WebAuthn attestationObject
  function buildAttestationObject(credId: Buffer, x: Buffer, y: Buffer): Buffer {
    const authData = buildAttestationAuthData(credId, x, y);
    const b = Buffer.alloc(2);
    b.writeUInt16BE(authData.length);

    return Buffer.concat([
      Buffer.from([0xa3]),
      Buffer.from([0x63, 0x66, 0x6d, 0x74, 0x64, 0x6e, 0x6f, 0x6e, 0x65]), // fmt: "none"
      Buffer.from([0x67, 0x61, 0x74, 0x74, 0x53, 0x74, 0x6d, 0x74, 0xa0]), // attStmt: {}
      Buffer.from([0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61]), // "authData"
      Buffer.from([0x59]),
      b,
      authData,
    ]);
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

  // --- Test 2: Valid assertion + rolled-back counter -> rejected ---
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
    assert(registry[idBase64].counter === initialCounter, `Test 3: Invariant satisfied - counter remained ${initialCounter}, did NOT advance to ${hugeCounter}`);
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

  // --- Test 6: Mandatory Challenge Failure in Assertion ---
  {
    const authData = buildAuthData(50);
    const signedData = Buffer.concat([authData, clientDataHash]);
    const validSig = crypto.sign('SHA256', signedData, privateKey);
    const registry: Record<string, NativeWebAuthnRecord> = {
      [idBase64]: { idBase64, publicKeyBase64, counter: 10, createdAt: Date.now() },
    };

    // 6a: Missing expectedChallenge
    const resNoExpected = await verifyWebAuthnAssertion({
      rawId,
      clientDataJSON,
      authenticatorData: authData,
      signature: validSig,
      expectedOrigin: origin,
      expectedChallenge: Buffer.alloc(0), // empty
      registry,
    });
    assert(resNoExpected.success === false, 'Test 6a: Assertion with empty expectedChallenge is rejected');
    assert(resNoExpected.error?.includes('missing or empty expected challenge') === true, 'Test 6a: Proper error message');

    // 6b: Challenge mismatch
    const wrongChallenge = crypto.randomBytes(32);
    const resMismatch = await verifyWebAuthnAssertion({
      rawId,
      clientDataJSON,
      authenticatorData: authData,
      signature: validSig,
      expectedOrigin: origin,
      expectedChallenge: wrongChallenge,
      registry,
    });
    assert(resMismatch.success === false, 'Test 6b: Assertion with mismatching challenge is rejected');
    assert(resMismatch.error?.includes('challenge mismatch') === true, 'Test 6b: Proper mismatch error');
  }

  // --- Test 7: Credential Enrollment - Cryptographic Binding to Attestation ---
  {
    const enrollCredId = crypto.randomBytes(32);
    const enrollIdBase64 = enrollCredId.toString('base64');
    const enrollChallenge = crypto.randomBytes(32);
    const enrollChalUrlSafe = enrollChallenge.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const enrollClientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: enrollChalUrlSafe,
        origin: origin,
        crossOrigin: false,
      }),
      'utf8',
    );

    const attestationObject = buildAttestationObject(enrollCredId, xCoord, yCoord);
    const registry: Record<string, NativeWebAuthnRecord> = {};
    let enrollPersisted = false;

    // 7a: Successful Enrollment with Attestation Binding
    const enrollResult = await enrollWebAuthnCredential({
      rawId: enrollCredId,
      clientDataJSON: enrollClientDataJSON,
      attestationObject,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: enrollChallenge,
      registry,
      onPersistRegistry: async (r) => {
        enrollPersisted = true;
        assert(r[enrollIdBase64] !== undefined, 'Registry passed to persistence contains new record');
      },
    });

    assert(enrollResult.success === true, 'Test 7a: Valid enrollment with attestation binding succeeds');
    assert(enrollPersisted === true, 'Test 7a: Persistence callback was invoked');
    assert(registry[enrollIdBase64] !== undefined, 'Test 7a: Credential added to in-memory registry');
    assert(registry[enrollIdBase64].publicKeyBase64 === publicKeyBase64, 'Test 7a: Stored public key cryptographically matches attested COSE key');

    // 7b: Enrollment Rejection on Credential ID Mismatch vs Attestation
    const fakeCredId = crypto.randomBytes(32);
    const fakeResult = await enrollWebAuthnCredential({
      rawId: fakeCredId, // Does NOT match credId inside attestationObject
      clientDataJSON: enrollClientDataJSON,
      attestationObject,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: enrollChallenge,
      registry,
    });
    assert(fakeResult.success === false, 'Test 7b: Enrollment with mismatched rawId vs attestation is rejected');
    assert(fakeResult.error?.includes('credential ID does not match attestation') === true, 'Test 7b: Error indicates attestation ID mismatch');

    // 7c: Enrollment Rejection on Client Public Key Mismatch
    const fakeKey = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'der' });
    const keyMismatchResult = await enrollWebAuthnCredential({
      rawId: enrollCredId,
      publicKey: fakeKey, // Client claims different public key
      clientDataJSON: enrollClientDataJSON,
      attestationObject,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: enrollChallenge,
      registry,
    });
    assert(keyMismatchResult.success === false, 'Test 7c: Enrollment with mismatched client public key is rejected');
    assert(keyMismatchResult.error?.includes('does not match attestation key') === true, 'Test 7c: Error indicates key mismatch');

    // 7d: Enrollment Rejection on Challenge Mismatch
    const wrongEnrollChal = crypto.randomBytes(32);
    const chalMismatchRes = await enrollWebAuthnCredential({
      rawId: enrollCredId,
      clientDataJSON: enrollClientDataJSON,
      attestationObject,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: wrongEnrollChal,
      registry,
    });
    assert(chalMismatchRes.success === false, 'Test 7d: Enrollment with challenge mismatch is rejected');

    // 7e: Enrollment with matching separate authenticatorData and attestationObject succeeds
    const genuineAuthData = buildAttestationAuthData(enrollCredId, xCoord, yCoord);
    const matchResult = await enrollWebAuthnCredential({
      rawId: enrollCredId,
      clientDataJSON: enrollClientDataJSON,
      attestationObject,
      authenticatorData: genuineAuthData,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: enrollChallenge,
      registry: {},
    });
    assert(matchResult.success === true, 'Test 7e: Enrollment with matching authenticatorData and attestationObject succeeds');

    // 7f: Enrollment with tampered separate authenticatorData is rejected
    const tamperedAuthData = Buffer.from(genuineAuthData);
    tamperedAuthData[32] ^= 0xff; // tamper flags byte
    const mismatchResult = await enrollWebAuthnCredential({
      rawId: enrollCredId,
      clientDataJSON: enrollClientDataJSON,
      attestationObject,
      authenticatorData: tamperedAuthData,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: enrollChallenge,
      registry: {},
    });
    assert(mismatchResult.success === false, 'Test 7f: Enrollment with mismatched authenticatorData vs attestationObject is rejected');
    assert(
      mismatchResult.error?.includes('authenticatorData does not match authData in attestationObject') === true,
      'Test 7f: Error indicates authenticatorData and attestationObject authData mismatch',
    );
  }

  // --- Test 8: Atomic Persistence Failure Handling ---
  {
    // 8a: Assertion persistence failure -> in-memory counter MUST NOT be updated
    const initialCounter = 50;
    const newCounter = 80;
    const registry: Record<string, NativeWebAuthnRecord> = {
      [idBase64]: { idBase64, publicKeyBase64, counter: initialCounter, createdAt: Date.now() },
    };

    const authData = buildAuthData(newCounter);
    const signedData = Buffer.concat([authData, clientDataHash]);
    const validSig = crypto.sign('SHA256', signedData, privateKey);

    const failResult = await verifyWebAuthnAssertion({
      rawId,
      clientDataJSON,
      authenticatorData: authData,
      signature: validSig,
      expectedOrigin: origin,
      expectedRpId: rpId,
      expectedChallenge: challengeBytes,
      registry,
      onPersistRegistry: async () => {
        throw new Error('Disk safeStorage write failure');
      },
    });

    assert(failResult.success === false, 'Test 8a: Assertion reports failure when persistence throws');
    assert(failResult.error?.includes('registry persistence error') === true, 'Test 8a: Error mentions persistence error');
    assert(registry[idBase64].counter === initialCounter, `Test 8a: Invariant satisfied - in-memory counter remains ${initialCounter} when persistence fails`);

    // 8b: Enrollment persistence failure -> in-memory registry MUST NOT contain record
    const emptyRegistry: Record<string, NativeWebAuthnRecord> = {};
    const newCredId = crypto.randomBytes(32);
    const newChal = crypto.randomBytes(32);
    const newChalStr = newChal.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const newClientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: newChalStr, origin }), 'utf8');
    const newAttObj = buildAttestationObject(newCredId, xCoord, yCoord);

    const enrollFailResult = await enrollWebAuthnCredential({
      rawId: newCredId,
      clientDataJSON: newClientData,
      attestationObject: newAttObj,
      expectedOrigin: origin,
      expectedChallenge: newChal,
      registry: emptyRegistry,
      onPersistRegistry: async () => {
        throw new Error('Enclave storage locked');
      },
    });

    assert(enrollFailResult.success === false, 'Test 8b: Enrollment reports failure when persistence throws');
    assert(Object.keys(emptyRegistry).length === 0, 'Test 8b: Invariant satisfied - in-memory registry remains empty when enrollment persistence fails');
  }

  console.log(`\n🎉 All ${passed}/${total} WebAuthn Hardening & Regression Tests PASSED!\n`);
}

runTests().catch((err) => {
  console.error('\n❌ WebAuthn Regression Tests Failed:', err);
  process.exit(1);
});
