import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY, verifyEd25519Signature } from './trust-anchor';

export interface EngineManifestEntry {
  platform: string; // 'win32' | 'linux' | 'darwin'
  arch: string; // 'x64' | 'arm64'
  filename: string;
  sha256: string;
  size: number;
}

export interface EngineManifestPayload {
  version: string;
  release: string;
  engines: EngineManifestEntry[];
}

export interface EngineManifest extends EngineManifestPayload {
  signature: string; // Ed25519 signature over canonical JSON
}

export interface EngineVerificationResult {
  valid: boolean;
  entry?: EngineManifestEntry;
  error?: string;
}

/**
 * Deterministically serializes engine manifest payload for cryptographic signing & verification.
 */
export function canonicalizeEngineManifest(payload: EngineManifestPayload): string {
  const sortedEngines = [...payload.engines].sort((a, b) => {
    const keyA = `${a.platform}:${a.arch}:${a.filename}`;
    const keyB = `${b.platform}:${b.arch}:${b.filename}`;
    return keyA.localeCompare(keyB);
  });

  return JSON.stringify({
    engines: sortedEngines.map((e) => ({
      arch: e.arch,
      filename: e.filename,
      platform: e.platform,
      sha256: e.sha256.toLowerCase(),
      size: e.size,
    })),
    release: payload.release,
    version: payload.version,
  });
}

/**
 * Cryptographically verifies an Engine Manifest against the embedded Ed25519 Trust Anchor.
 */
export function verifyEngineManifestSignature(manifest: EngineManifest, trustAnchorPublicKeyPem: string = DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY): boolean {
  if (!manifest || !manifest.signature || !Array.isArray(manifest.engines)) {
    return false;
  }
  const canonicalStr = canonicalizeEngineManifest({
    version: manifest.version,
    release: manifest.release,
    engines: manifest.engines,
  });
  return verifyEd25519Signature(canonicalStr, manifest.signature, trustAnchorPublicKeyPem);
}

/**
 * Resolves and loads the signed engine manifest from the app environment.
 * Validates the digital signature against the trust anchor immediately.
 */
export function loadAuthenticatedEngineManifest(customManifestPath?: string): EngineManifest {
  const candidatePaths: string[] = [];

  if (customManifestPath) {
    candidatePaths.push(customManifestPath);
  }

  // 1. Current directory (dist/electron or electron)
  candidatePaths.push(path.join(__dirname, 'engine-manifest.json'));

  // 2. Packaged resources path
  if (typeof process !== 'undefined' && (process as unknown as { resourcesPath?: string }).resourcesPath) {
    candidatePaths.push(path.join((process as unknown as { resourcesPath: string }).resourcesPath, 'engine-manifest.json'));
  }

  // 3. Source tree fallback for development
  candidatePaths.push(path.resolve(__dirname, '..', '..', 'electron', 'engine-manifest.json'));
  candidatePaths.push(path.resolve(__dirname, '..', 'electron', 'engine-manifest.json'));

  let foundPath: string | null = null;
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    } catch {
      /* continue */
    }
  }

  if (!foundPath) {
    throw new Error('Mandatory engine trust error: engine-manifest.json not found in application search paths.');
  }

  const fileContent = fs.readFileSync(foundPath, 'utf8');
  let parsed: EngineManifest;
  try {
    parsed = JSON.parse(fileContent);
  } catch (parseErr) {
    throw new Error(`Mandatory engine trust error: malformed engine-manifest.json at ${foundPath}: ${(parseErr as Error).message}`);
  }

  const isVerified = verifyEngineManifestSignature(parsed);
  if (!isVerified) {
    throw new Error(`Mandatory engine trust error: engine-manifest.json signature is invalid against Darkstar Trust Anchor!`);
  }

  return parsed;
}

/**
 * Verifies a candidate native engine executable against the authenticated manifest.
 *
 * Invariants:
 * 1. A file's location or existence NEVER establishes trust.
 * 2. Manifest signature MUST be verified against the embedded trust anchor.
 * 3. Executable SHA-256 and byte size MUST exactly match the authenticated manifest entry.
 * 4. Platform and architecture MUST match expected target.
 * 5. Production rejects arbitrary unsigned binaries fail-closed.
 */
export async function verifyEngineBinary(
  executablePath: string,
  manifest: EngineManifest,
  options: {
    expectedPlatform?: string;
    expectedArch?: string;
    trustAnchorPem?: string;
  } = {},
): Promise<EngineVerificationResult> {
  const targetPlatform = options.expectedPlatform || process.platform;
  const targetArch = options.expectedArch || process.arch;
  const trustAnchor = options.trustAnchorPem || DARKSTAR_TRUST_ANCHOR_PUBLIC_KEY;

  // 1. Verify manifest signature
  if (!verifyEngineManifestSignature(manifest, trustAnchor)) {
    return {
      valid: false,
      error: 'Engine verification failed: manifest signature invalid against Darkstar Trust Anchor.',
    };
  }

  // 2. Check candidate file existence
  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(executablePath);
  } catch (statErr) {
    return {
      valid: false,
      error: `Engine verification failed: cannot access binary at ${executablePath}: ${(statErr as Error).message}`,
    };
  }

  if (!stats.isFile()) {
    return {
      valid: false,
      error: `Engine verification failed: path is not a file: ${executablePath}`,
    };
  }

  // 3. Find matching manifest entry for target platform and architecture
  const entry = manifest.engines.find((e) => e.platform === targetPlatform && e.arch === targetArch);
  if (!entry) {
    return {
      valid: false,
      error: `Engine verification failed: no manifest entry for platform '${targetPlatform}' and architecture '${targetArch}'.`,
    };
  }

  // 4. Verify file size
  if (stats.size !== entry.size) {
    return {
      valid: false,
      error: `Engine verification failed: file size mismatch for ${path.basename(executablePath)} (expected ${entry.size} bytes, found ${stats.size} bytes).`,
    };
  }

  // 5. Compute and verify SHA-256 hash
  try {
    const fileBuf = await fs.promises.readFile(executablePath);
    const computedSha256 = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();
    const expectedSha256 = entry.sha256.toLowerCase();

    if (!crypto.timingSafeEqual(Buffer.from(computedSha256), Buffer.from(expectedSha256))) {
      return {
        valid: false,
        error: `Engine verification failed: SHA-256 hash mismatch for ${path.basename(executablePath)}!\nExpected: ${expectedSha256}\nComputed: ${computedSha256}`,
      };
    }

    return {
      valid: true,
      entry,
    };
  } catch (hashErr) {
    return {
      valid: false,
      error: `Engine verification failed: hashing error: ${(hashErr as Error).message}`,
    };
  }
}
