import * as crypto from 'crypto';

/**
 * Darkstar Sovereign Enclave Embedded Trust Anchor.
 * Used for cryptographic provenance verification of:
 * 1. Application runtime bundles (signed integrity.json).
 * 2. Native D-ARX engine release manifests downloaded from GitHub releases.
 */
export const DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAprFeV34ODSQb4VtTHlbX4EYuz8gJfJLNzlnTHZCIKZo=
-----END PUBLIC KEY-----`;

/**
 * Verifies an Ed25519 digital signature against a data payload.
 * Accepts hex or base64 encoded signature strings.
 */
export function verifyEd25519Signature(data: Buffer | string, signatureHexOrBase64: string, publicKeyPem: string = DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY): boolean {
  try {
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const trimmedSig = signatureHexOrBase64.trim();
    const isHex = /^[0-9a-fA-F]+$/.test(trimmedSig) && trimmedSig.length % 2 === 0;
    const sigBuf = Buffer.from(trimmedSig, isHex ? 'hex' : 'base64');
    return crypto.verify(null, dataBuf, publicKeyPem, sigBuf);
  } catch (err) {
    console.error('[Trust Anchor] Signature verification error:', err);
    return false;
  }
}
