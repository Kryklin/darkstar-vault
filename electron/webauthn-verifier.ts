import * as crypto from 'crypto';

export interface NativeWebAuthnRecord {
  idBase64: string;
  publicKeyBase64: string; // DER SPKI
  counter: number;
  createdAt: number;
}

export interface WebAuthnAssertionParams {
  rawId?: number[] | Uint8Array;
  clientDataJSON?: number[] | Uint8Array;
  authenticatorData?: number[] | Uint8Array;
  signature?: number[] | Uint8Array;
  expectedOrigin: string;
  expectedRpId?: string;
  expectedChallenge?: number[] | Uint8Array;
  registry: Record<string, NativeWebAuthnRecord>;
  onPersistRegistry?: (registry: Record<string, NativeWebAuthnRecord>) => Promise<void>;
}

export interface WebAuthnAssertionResult {
  success: boolean;
  error?: string;
}

export interface WebAuthnEnrollmentParams {
  rawId?: number[] | Uint8Array;
  publicKey?: number[] | Uint8Array;
  clientDataJSON?: number[] | Uint8Array;
  expectedOrigin: string;
  registry: Record<string, NativeWebAuthnRecord>;
  onPersistRegistry?: (registry: Record<string, NativeWebAuthnRecord>) => Promise<void>;
}

/**
 * Enrolls a newly created WebAuthn credential in the native registry.
 * Validates attestation type, exact ephemeral origin, and stores DER SPKI public key.
 */
export async function enrollWebAuthnCredential(params: WebAuthnEnrollmentParams): Promise<{ success: boolean; error?: string }> {
  const { rawId, publicKey, clientDataJSON, expectedOrigin, registry, onPersistRegistry } = params;

  if (!clientDataJSON || !rawId || !publicKey) {
    return { success: false, error: 'Native enrollment failed: malformed WebAuthn attestation structure.' };
  }

  let clientDataJson: Record<string, unknown>;
  try {
    clientDataJson = JSON.parse(Buffer.from(clientDataJSON).toString('utf8'));
  } catch {
    return { success: false, error: 'Native enrollment failed: invalid clientDataJSON.' };
  }

  if (clientDataJson['type'] !== 'webauthn.create') {
    return { success: false, error: 'Native enrollment failed: attestation type mismatch.' };
  }

  if (clientDataJson['origin'] !== expectedOrigin) {
    return {
      success: false,
      error: `Native enrollment failed: origin mismatch ('${clientDataJson['origin']}' does not match '${expectedOrigin}').`,
    };
  }

  const idBase64 = Buffer.from(rawId).toString('base64');
  const pubKeyBase64 = Buffer.from(publicKey).toString('base64');

  registry[idBase64] = {
    idBase64,
    publicKeyBase64: pubKeyBase64,
    counter: 0,
    createdAt: Date.now(),
  };

  if (onPersistRegistry) {
    await onPersistRegistry(registry);
  }

  return { success: true };
}

/**
 * Cryptographically verifies a WebAuthn get assertion and manages sign counter state.
 *
 * Strict execution order:
 * 1. Parse assertion
 * 2. Validate clientDataJSON
 * 3. Validate exact origin
 * 4. Validate RP ID hash
 * 5. Validate UP / UV flags
 * 6. Validate challenge
 * 7. Load native credential registry
 * 8. Obtain trusted native public key
 * 9. Verify ECDSA signature
 * 10. Validate sign counter
 * 11. Persist updated sign counter ONLY after successful verification
 * 12. Authentication success
 *
 * CRITICAL INVARIANT:
 * If cryptographic signature verification fails, the credential registry MUST NOT be mutated.
 */
export async function verifyWebAuthnAssertion(params: WebAuthnAssertionParams): Promise<WebAuthnAssertionResult> {
  const {
    rawId,
    clientDataJSON,
    authenticatorData,
    signature,
    expectedOrigin,
    expectedRpId = 'localhost',
    expectedChallenge,
    registry,
    onPersistRegistry,
  } = params;

  // 1. Structure validation
  if (!clientDataJSON || !authenticatorData || !signature) {
    return { success: false, error: 'Native verification failed: malformed WebAuthn assertion structure.' };
  }

  const authDataArr = Buffer.from(authenticatorData);
  const sigArr = Buffer.from(signature);
  const clientDataArr = Buffer.from(clientDataJSON);

  if (authDataArr.length < 37 || sigArr.length === 0) {
    return { success: false, error: 'Native verification failed: malformed authenticatorData or signature.' };
  }

  // 2. Validate clientDataJSON
  let clientDataJson: Record<string, unknown>;
  try {
    clientDataJson = JSON.parse(clientDataArr.toString('utf8'));
  } catch {
    return { success: false, error: 'Native verification failed: invalid clientDataJSON.' };
  }

  if (clientDataJson['type'] !== 'webauthn.get') {
    return { success: false, error: 'Native verification failed: assertion type mismatch.' };
  }

  // 3. Validate exact ephemeral localhost origin
  if (clientDataJson['origin'] !== expectedOrigin) {
    return {
      success: false,
      error: `Native verification failed: origin mismatch ('${clientDataJson['origin']}' does not match '${expectedOrigin}').`,
    };
  }

  // 4. Validate RP ID hash
  const expectedRpIdHash = crypto.createHash('sha256').update(expectedRpId).digest();
  const actualRpIdHash = authDataArr.subarray(0, 32);
  if (!crypto.timingSafeEqual(actualRpIdHash, expectedRpIdHash)) {
    return {
      success: false,
      error: `Native verification failed: RP ID hash mismatch (expected '${expectedRpId}').`,
    };
  }

  // 5. Check flags at byte 32: bit 0 (UP), bit 2 (UV)
  const flags = authDataArr[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  if (!userPresent || !userVerified) {
    return {
      success: false,
      error: 'Native verification failed: authenticator did not assert User Verification (UV flag).',
    };
  }

  // 6. Challenge matching
  if (expectedChallenge && clientDataJson['challenge']) {
    const rawChal = Buffer.from(expectedChallenge);
    const chalUrlSafe = rawChal.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (clientDataJson['challenge'] !== chalUrlSafe) {
      return {
        success: false,
        error: 'Native verification failed: challenge mismatch (replay defense).',
      };
    }
  }

  // 7. Native Credential Registry lookup
  if (!rawId) {
    return { success: false, error: 'Native verification failed: missing credential ID.' };
  }
  const credentialIdBase64 = Buffer.from(rawId).toString('base64');
  const nativeRecord = registry[credentialIdBase64];

  if (!nativeRecord) {
    return {
      success: false,
      error: 'Native verification failed: credential ID is not enrolled in the native enclave registry.',
    };
  }

  // 8. Cryptographic ECDSA P-256 signature verification against native stored public key
  // MUST PRECEDE ANY STATE MUTATION
  try {
    const pubKeyBuf = Buffer.from(nativeRecord.publicKeyBase64, 'base64');
    const clientDataHash = crypto.createHash('sha256').update(clientDataArr).digest();
    const signedData = Buffer.concat([authDataArr, clientDataHash]);

    const keyObject = crypto.createPublicKey({
      key: pubKeyBuf,
      format: 'der',
      type: 'spki',
    });

    const isSigVerified = crypto.verify('SHA256', signedData, keyObject, sigArr);
    if (!isSigVerified) {
      // INVARIANT: Registry is NOT mutated on signature failure
      return {
        success: false,
        error: 'Native verification failed: authenticator signature mismatch against registered public key.',
      };
    }
    console.log('[WebAuthn] Cryptographic assertion signature verified against native enclave registry.');
  } catch (verErr) {
    return {
      success: false,
      error: `Native verification failed: assertion signature check failed: ${(verErr as Error).message}`,
    };
  }

  // 9. Validate sign counter (Cloned authenticator replay defense)
  const signCounter = authDataArr.readUInt32BE(33);
  if (signCounter > 0 && nativeRecord.counter > 0 && signCounter <= nativeRecord.counter) {
    // INVARIANT: Registry is NOT mutated on counter rollback
    return {
      success: false,
      error: `Native verification failed: authenticator sign counter roll-back detected (${signCounter} <= ${nativeRecord.counter}). Potential cloned authenticator.`,
    };
  }

  // 10. Persist updated sign counter ONLY AFTER signature and counter validation pass
  if (signCounter > nativeRecord.counter) {
    nativeRecord.counter = signCounter;
    if (onPersistRegistry) {
      await onPersistRegistry(registry);
    }
  }

  // 11. Authentication success
  return { success: true };
}
