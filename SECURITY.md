<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-anim-dark.svg">
    <img src="assets/logo-anim-light.svg" width="120" alt="Darkstar Logo">
  </picture>
</p>

<div align="center">

[<img src="assets/icons/home.svg" width="13" height="13" align="absmiddle" alt="Main" /> Main](README.md) | [<img src="assets/icons/shield.svg" width="13" height="13" align="absmiddle" alt="Security" /> Security](SECURITY.md) | [<img src="assets/icons/handshake.svg" width="13" height="13" align="absmiddle" alt="Contributing" /> Contributing](CONTRIBUTING.md) | [<img src="assets/icons/standards.svg" width="13" height="13" align="absmiddle" alt="Code of Conduct" /> Code of Conduct](CODE_OF_CONDUCT.md) | [<img src="assets/icons/math.svg" width="13" height="13" align="absmiddle" alt="Engine Spec" /> D-ARX Core Spec](https://github.com/Kryklin/darkstar)

</div>

<h1 align="center">Security Policy</h1>

Darkstar Vault is a defense-grade sovereign security enclave. We prioritize the absolute isolation, mathematical integrity, and memory zeroization of our cryptographic pipelines and the privacy of our users.

---

## <img src="assets/icons/shield.svg" width="20" height="20" align="absmiddle" alt="Shield" /> Sovereign Post-Quantum Enclave Model

Darkstar Vault interfaces directly with the native sovereign **D-ARX-512** cryptographic core from [kryklin/darkstar](https://github.com/Kryklin/darkstar). Our security architecture enforces:

- **Zero-Knowledge Memory Architecture**: Master keys, passphrases, and decrypted payloads exist solely in volatile, scrubbed execution memory and are never serialized to unencrypted disk caches.
- **Platform Biometric Integration**: High-assurance user authentication interfaces with platform authenticators (Windows Hello, Touch ID / Face ID, and Android BiometricPrompt) via standard FIDO2 / WebAuthn protocols with User Presence and User Verification enforcement, cryptographic attestation binding on enrollment, and mandatory challenges.
- **OS-Backed Secure Storage**: Native WebAuthn registries and cached session credentials utilize platform-provided credential protection via Electron `safeStorage` (Windows DPAPI, macOS Keychain, Linux secret-service). Storage strictly fails closed if OS-backed encryption is unavailable or fails decryption.
- **Pure Native Delegation**: 100% of stream cipher permutation, key schedule expansion, and CTR keystream operations are executed by pre-compiled native `d-arx` binaries authenticated against an Ed25519-signed manifest with SHA-256 integrity checks.
- **Air-Gapped Operational Model**: Supports end-to-end air-gapped data transfers via animated QR-code streams and steganographic data carriers.

---

## <img src="assets/icons/target.svg" width="20" height="20" align="absmiddle" alt="Versions" /> Supported Versions

| Version | Supported | Security Standard | Enclave Isolation |
| :--- | :--- | :--- | :--- |
| **3.0.x** | <img src="assets/icons/check.svg" width="13" height="13" align="absmiddle" alt="Active" /> Active | D-ARX-512 Core Stream Cipher / FIDO2 WebAuthn | Platform-Enforced User Verification |
| **< 3.0** | <img src="assets/icons/cross.svg" width="13" height="13" align="absmiddle" alt="End of Life" /> End of Life | Legacy Pre-release Implementations | Deprecated |

---

## <img src="assets/icons/lock.svg" width="20" height="20" align="absmiddle" alt="Vulnerability" /> Reporting a Vulnerability

> [!IMPORTANT]
> **Please do not report security vulnerabilities through public GitHub issues.**

If you discover an architectural weakness, memory leakage vector, or cryptographic implementation flaw, please submit an encrypted security report to:

**<kalemslight@gmail.com>**  
*(Alternative security point of contact: `<mortalpain1@gmail.com>`)*

### What to include in your advisory

1. **Vulnerability Overview**: Clear description of the exploit vector and severity assessment.
2. **Reproduction Steps**: Step-by-step instructions or minimal Proof of Concept (PoC).
3. **Affected Environment**: Platform (Windows, macOS, Linux, Android, iOS), client version, and hardware configuration.
4. **Impact Assessment**: Evaluation of potential impact on memory safety or enclave boundary traversal.

### Disclosure Timeline & SLA

- **Initial Acknowledgement**: Within **48 hours**.
- **Triage & Reproduction**: Within **7 business days**.
- **Patch Deployment**: Coordinated release schedule with private advisory until public deployment.

---

## <img src="assets/icons/check.svg" width="20" height="20" align="absmiddle" alt="Guarantees" /> Security Guarantees & Auditability

- **No Backdoors**: Darkstar Vault contains no administrative backdoors, master bypass keys, or escrow mechanisms.
- **Zero Telemetry**: We collect zero telemetry, analytical beacons, network tracking, or usage metrics.
- **Fail-Closed Runtime Integrity**: Packaged application releases enforce an embedded Ed25519 Trust Anchor over all runtime bundles (Electron main/preload and Angular renderer JS chunks). Unsigned manifests or checksum discrepancies halt execution immediately without fallback.
- **Native Engine Authenticity**: Native `d-arx` engine executables from all sources (bundled, downloaded, user-specified, or auto-updated) are authenticated prior to execution against a signed engine manifest (`engine-manifest.json`) verified using an embedded Ed25519 Trust Anchor. Binary SHA-256 and size are strictly verified on execution, preventing binary substitution or tampering. Downloads are staged in an isolated temporary directory and verified prior to installation.
- **OS-Backed Secure Storage**: Native WebAuthn credentials and session tokens are protected using platform-provided credential protection via Electron `safeStorage` (Windows DPAPI, macOS Keychain, Linux secret-service). The system fails closed: if OS encryption is unavailable or fails decryption, access is immediately halted and never falls open to plaintext.
- **WebAuthn Cryptographic Binding & Atomic Ordering**: WebAuthn credential enrollment cryptographically binds public keys and credential IDs to the authenticator's CBOR attestation object and RP-ID hash. Assertions enforce strict ephemeral origin matching, RP-ID verification, User Presence (`UP`) and User Verification (`UV`) flag validation, cryptographic challenge matching, and ECDSA P-256 signature verification. Sign counter and credential persistence are strictly atomic: in-memory state is only mutated after persistent storage succeeds.
- **Strict Content Security Policy & Isolation**: Inline scripts (`'unsafe-inline'`) are prohibited in `script-src`. All IPC invocations enforce strict sender origin verification (`app:` in production, localhost:4200 in development), canonical path containment preventing path traversal and null-byte injection, and atomic file operations with restricted permissions (`0o600`).
- **Authenticated Streaming Pipeline (v2 DARX-STRM)**: Large files and streamed binaries strictly enforce the v2 authenticated container format, cryptographically binding the stream identity, chunk index, chunk length, total chunk count, and total byte size to each chunk payload. Strict field validation and resource bounds are enforced (max 10 GB file size, 1,000,000 chunks, 64 MB frame). Backward compatibility for unauthenticated legacy v1 (`dArxChunked`) containers and unchunked blobs has been completely dropped; attempts to decrypt legacy containers fail closed with an explicit instruction to re-encrypt using v2 DARX-STRM.
- **Build & Release Signing Lifecycle**: Manifest signing keys are strictly isolated. The private signing key never exists in the repository; only the signed manifests and the embedded public trust anchor ship with the application. Local release packaging loads keys from developer-isolated, gitignored `.env` files, while production CI workflows inject signing secrets via repository secrets.

---

<div align="center">

[<img src="assets/icons/home.svg" width="13" height="13" align="absmiddle" alt="Main" /> Main](README.md) | [<img src="assets/icons/shield.svg" width="13" height="13" align="absmiddle" alt="Security" /> Security](SECURITY.md) | [<img src="assets/icons/handshake.svg" width="13" height="13" align="absmiddle" alt="Contributing" /> Contributing](CONTRIBUTING.md) | [<img src="assets/icons/standards.svg" width="13" height="13" align="absmiddle" alt="Code of Conduct" /> Code of Conduct](CODE_OF_CONDUCT.md) | [<img src="assets/icons/math.svg" width="13" height="13" align="absmiddle" alt="Engine Spec" /> D-ARX Core Spec](https://github.com/Kryklin/darkstar)

</div>
