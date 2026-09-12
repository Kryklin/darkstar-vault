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
  expectedChallenge: number[] | Uint8Array;
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
  attestationObject?: number[] | Uint8Array;
  authenticatorData?: number[] | Uint8Array;
  expectedOrigin: string;
  expectedRpId?: string;
  expectedChallenge: number[] | Uint8Array;
  registry: Record<string, NativeWebAuthnRecord>;
  onPersistRegistry?: (registry: Record<string, NativeWebAuthnRecord>) => Promise<void>;
}

export interface WebAuthnEnrollmentResult {
  success: boolean;
  error?: string;
}

/**
 * Minimal RFC 8949 CBOR Decoder for WebAuthn Attestation & COSE Keys.
 */
export function decodeCbor(buf: Buffer, offset = 0): { val: unknown; offset: number } {
  if (offset >= buf.length) {
    throw new Error('Unexpected end of CBOR buffer.');
  }
  const initial = buf[offset++];
  const major = initial >> 5;
  let val = initial & 0x1f;

  if (val === 24) {
    if (offset >= buf.length) throw new Error('Unexpected end of CBOR buffer.');
    val = buf[offset++];
  } else if (val === 25) {
    if (offset + 2 > buf.length) throw new Error('Unexpected end of CBOR buffer.');
    val = buf.readUInt16BE(offset);
    offset += 2;
  } else if (val === 26) {
    if (offset + 4 > buf.length) throw new Error('Unexpected end of CBOR buffer.');
    val = buf.readUInt32BE(offset);
    offset += 4;
  } else if (val > 26) {
    throw new Error(`Unsupported CBOR additional information: ${val}`);
  }

  if (major === 0) {
    return { val, offset };
  }
  if (major === 1) {
    return { val: -1 - val, offset };
  }
  if (major === 2) {
    if (offset + val > buf.length) throw new Error('CBOR byte string out of bounds.');
    const bytes = buf.subarray(offset, offset + val);
    return { val: bytes, offset: offset + val };
  }
  if (major === 3) {
    if (offset + val > buf.length) throw new Error('CBOR text string out of bounds.');
    const str = buf.subarray(offset, offset + val).toString('utf8');
    return { val: str, offset: offset + val };
  }
  if (major === 5) {
    const map = new Map<unknown, unknown>();
    for (let i = 0; i < val; i++) {
      const k = decodeCbor(buf, offset);
      offset = k.offset;
      const v = decodeCbor(buf, offset);
      offset = v.offset;
      map.set(k.val, v.val);
    }
    return { val: map, offset };
  }
  throw new Error(`Unsupported CBOR major type: ${major}`);
}

/**
 * Enrolls a newly created WebAuthn credential in the native registry.
 * Validates attestation type, exact ephemeral origin, mandatory challenge,
 * and cryptographically verifies the credential ID and public key against the authenticator attestation data.
 *
 * CRITICAL INVARIANT:
 * Memory mutation of the credential registry is ATOMIC: in-memory state is modified
 * ONLY after persistent storage succeeds.
 */
export async function enrollWebAuthnCredential(params: WebAuthnEnrollmentParams): Promise<WebAuthnEnrollmentResult> {
  const { rawId, publicKey, clientDataJSON, attestationObject, authenticatorData, expectedOrigin, expectedRpId = 'localhost', expectedChallenge, registry, onPersistRegistry } = params;

  if (!clientDataJSON || !rawId) {
    return { success: false, error: 'Native enrollment failed: malformed WebAuthn attestation structure.' };
  }

  // 1. Mandatory challenge check
  if (!expectedChallenge || Buffer.from(expectedChallenge).length === 0) {
    return { success: false, error: 'Native enrollment failed: missing or empty expected challenge.' };
  }

  const clientDataArr = Buffer.from(clientDataJSON);
  let clientDataJson: Record<string, unknown>;
  try {
    clientDataJson = JSON.parse(clientDataArr.toString('utf8'));
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

  if (!clientDataJson['challenge'] || typeof clientDataJson['challenge'] !== 'string') {
    return { success: false, error: 'Native enrollment failed: missing or invalid challenge in clientDataJSON.' };
  }

  const rawChal = Buffer.from(expectedChallenge);
  const chalUrlSafe = rawChal.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (clientDataJson['challenge'] !== chalUrlSafe) {
    return { success: false, error: 'Native enrollment failed: challenge mismatch (replay defense).' };
  }

  // 2. Extract and authenticate authData
  let authDataFromAtt: Buffer | null = null;
  if (attestationObject) {
    try {
      const attObjBuf = Buffer.from(attestationObject);
      const decodedAtt = decodeCbor(attObjBuf).val as Map<unknown, unknown>;
      const extracted = decodedAtt.get('authData');
      if (Buffer.isBuffer(extracted) || extracted instanceof Uint8Array) {
        authDataFromAtt = Buffer.from(extracted);
      } else {
        return { success: false, error: 'Native enrollment failed: attestationObject missing authData field.' };
      }
    } catch (cborErr) {
      return { success: false, error: `Native enrollment failed: invalid attestationObject CBOR: ${(cborErr as Error).message}` };
    }
  }

  let authData: Buffer | null = authDataFromAtt;

  if (authenticatorData) {
    const directAuthData = Buffer.from(authenticatorData);
    if (authDataFromAtt) {
      // Both supplied: require byte-for-byte timing-safe equality
      if (directAuthData.length !== authDataFromAtt.length || !crypto.timingSafeEqual(directAuthData, authDataFromAtt)) {
        return {
          success: false,
          error: 'Native enrollment failed: authenticatorData does not match authData in attestationObject.',
        };
      }
    } else {
      authData = directAuthData;
    }
  }

  if (!authData || authData.length < 55) {
    return { success: false, error: 'Native enrollment failed: missing or truncated authenticator attestation data.' };
  }

  // 3. Verify RP ID hash
  const expectedRpIdHash = crypto.createHash('sha256').update(expectedRpId).digest();
  const actualRpIdHash = authData.subarray(0, 32);
  if (!crypto.timingSafeEqual(actualRpIdHash, expectedRpIdHash)) {
    return { success: false, error: `Native enrollment failed: RP ID hash mismatch (expected '${expectedRpId}').` };
  }

  // 4. Verify flags: UP (bit 0) and AT (bit 6) must be asserted
  const flags = authData[32];
  const userPresent = (flags & 0x01) !== 0;
  const hasAttestedCredData = (flags & 0x40) !== 0;
  if (!userPresent) {
    return { success: false, error: 'Native enrollment failed: authenticator did not assert User Presence (UP flag).' };
  }
  if (!hasAttestedCredData) {
    return { success: false, error: 'Native enrollment failed: authenticator data missing Attested Credential Data (AT flag).' };
  }

  // 5. Verify credential ID matches rawId
  const credIdLen = authData.readUInt16BE(53);
  if (authData.length < 55 + credIdLen) {
    return { success: false, error: 'Native enrollment failed: truncated attested credential ID.' };
  }
  const attCredId = authData.subarray(55, 55 + credIdLen);
  const rawIdBuf = Buffer.from(rawId);
  if (!crypto.timingSafeEqual(attCredId, rawIdBuf)) {
    return { success: false, error: 'Native enrollment failed: credential ID does not match attestation statement.' };
  }

  // 6. Cryptographically derive / authenticate public key from attested COSE key
  let derivedSpkiBase64: string;
  try {
    const coseOffset = 55 + credIdLen;
    const coseDecoded = decodeCbor(authData, coseOffset).val as Map<unknown, unknown>;
    const xCoord = coseDecoded.get(-2) as Buffer | Uint8Array;
    const yCoord = coseDecoded.get(-3) as Buffer | Uint8Array;

    if (!xCoord || !yCoord || xCoord.length !== 32 || yCoord.length !== 32) {
      return { success: false, error: 'Native enrollment failed: invalid or unsupported COSE public key format.' };
    }

    // SPKI DER header for ECDSA prime256v1 (secp256r1)
    const spkiHeader = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d03010703420004', 'hex');
    const derivedSpki = Buffer.concat([spkiHeader, Buffer.from(xCoord), Buffer.from(yCoord)]);

    // If client supplied publicKey DER, verify byte-for-byte equivalence
    if (publicKey) {
      const clientPubBuf = Buffer.from(publicKey);
      if (!crypto.timingSafeEqual(clientPubBuf, derivedSpki)) {
        return { success: false, error: 'Native enrollment failed: client-provided public key does not match attestation key.' };
      }
    }

    derivedSpkiBase64 = derivedSpki.toString('base64');
  } catch (keyErr) {
    return { success: false, error: `Native enrollment failed: failed to extract authenticated public key: ${(keyErr as Error).message}` };
  }

  const idBase64 = rawIdBuf.toString('base64');
  const newRecord: NativeWebAuthnRecord = {
    idBase64,
    publicKeyBase64: derivedSpkiBase64,
    counter: 0,
    createdAt: Date.now(),
  };

  // 7. ATOMIC PERSISTENCE: Mutate in-memory registry ONLY AFTER persistence succeeds
  if (onPersistRegistry) {
    const updatedRegistry = {
      ...registry,
      [idBase64]: newRecord,
    };
    try {
      await onPersistRegistry(updatedRegistry);
    } catch (persistErr) {
      return {
        success: false,
        error: `Native enrollment failed: registry persistence error: ${(persistErr as Error).message}`,
      };
    }
  }

  // Persistence succeeded: commit to in-memory registry
  registry[idBase64] = newRecord;
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
 * 6. Validate mandatory challenge
 * 7. Load native credential registry
 * 8. Obtain trusted native public key
 * 9. Verify ECDSA signature
 * 10. Validate sign counter
 * 11. Persist updated sign counter ONLY after successful verification (ATOMIC)
 * 12. Authentication success
 *
 * CRITICAL INVARIANT:
 * If cryptographic signature verification fails, the credential registry MUST NOT be mutated.
 * In-memory state mutation is committed ONLY after persistent storage succeeds.
 */
export async function verifyWebAuthnAssertion(params: WebAuthnAssertionParams): Promise<WebAuthnAssertionResult> {
  const { rawId, clientDataJSON, authenticatorData, signature, expectedOrigin, expectedRpId = 'localhost', expectedChallenge, registry, onPersistRegistry } = params;

  // 1. Structure validation
  if (!clientDataJSON || !authenticatorData || !signature) {
    return { success: false, error: 'Native verification failed: malformed WebAuthn assertion structure.' };
  }

  // Mandatory challenge check
  if (!expectedChallenge || Buffer.from(expectedChallenge).length === 0) {
    return { success: false, error: 'Native verification failed: missing or empty expected challenge.' };
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

  // 6. Mandatory challenge matching
  if (!clientDataJson['challenge'] || typeof clientDataJson['challenge'] !== 'string') {
    return { success: false, error: 'Native verification failed: missing or invalid challenge in clientDataJSON.' };
  }

  const rawChal = Buffer.from(expectedChallenge);
  const chalUrlSafe = rawChal.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (clientDataJson['challenge'] !== chalUrlSafe) {
    return {
      success: false,
      error: 'Native verification failed: challenge mismatch (replay defense).',
    };
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

  // 10. Persist updated sign counter ATOMICALLY: only mutate in-memory state after persistence succeeds
  if (signCounter > nativeRecord.counter) {
    const updatedRecord = {
      ...nativeRecord,
      counter: signCounter,
    };
    const updatedRegistry = {
      ...registry,
      [credentialIdBase64]: updatedRecord,
    };
    if (onPersistRegistry) {
      try {
        await onPersistRegistry(updatedRegistry);
      } catch (persistErr) {
        return {
          success: false,
          error: `Native verification failed: registry persistence error: ${(persistErr as Error).message}`,
        };
      }
    }
    // Only mutate in-memory state AFTER persistence resolves successfully
    nativeRecord.counter = signCounter;
  }

  // 11. Authentication success
  return { success: true };
}
