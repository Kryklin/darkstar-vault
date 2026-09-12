<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-anim-dark.svg">
    <img src="assets/logo-anim-light.svg" width="240" alt="Darkstar Logo">
  </picture>
</p>
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/header-anim-dark.svg">
    <img src="assets/header-anim-light.svg" width="800" alt="Darkstar Vault Sovereign Security Enclave">
  </picture>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-3.0.4-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/Core_Engine-D--ARX--512-00E5FF?style=for-the-badge" alt="Core Engine">
  <img src="https://img.shields.io/badge/License-CC_BY_4.0-orange?style=for-the-badge" alt="License">
</p>
<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Angular_21-DD0031?style=for-the-badge&logo=angular&logoColor=white" alt="Angular">
  <img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Capacitor-119EFF?style=for-the-badge&logo=capacitor&logoColor=white" alt="Capacitor">
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS">
  <img src="https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux">
  <img src="https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android">
  <img src="https://img.shields.io/badge/iOS-000000?style=for-the-badge&logo=ios&logoColor=white" alt="iOS">
</p>

## <img src="assets/icons/book.svg" width="20" height="20" align="absmiddle" alt="Documentation" /> Documentation Hub

Explore the architecture, specifications, and governance of the Darkstar Vault suite:

| Specification / Guide | Description |
| :--- | :--- |
| [**Core Cryptographic Engine (D-ARX-512)**](https://github.com/Kryklin/darkstar) | Mathematical specification, ARX permutation stream cipher, and key schedule. |
| [**Security Policy**](SECURITY.md) | Vulnerability disclosure, enclave isolation, and security guarantees. |
| [**Contributing Guidelines**](CONTRIBUTING.md) | Code quality standards, test runner workflows, and PR submission rules. |
| [**Code of Conduct**](CODE_OF_CONDUCT.md) | Community integrity, ethics, and contributor standards. |

The **Darkstar Vault** (`darkstar-vault`) is a sovereign, defense-grade desktop and mobile security enclave engineered for high-assurance cryptographic asset protection. Built with an air-gapped-first architecture, the application pairs an **Angular** reactive frontend with native execution bridges (**Electron** for desktop and **Capacitor** for mobile), with all cryptographic operations powered by pre-compiled native **D-ARX-512** engines downloaded directly from verified Darkstar releases.

> [!IMPORTANT]
> **Cryptographic Architecture Notice**:
>
> - **Primary Cryptographic Core**: [Darkstar D-ARX-512](https://github.com/Kryklin/darkstar) (`d-arx.exe` / `d-arx`)
> - **Interoperability**: Bit-perfect cross-platform stream cipher execution across desktop and mobile.
> - **Zero In-App Custom Crypto**: The vault application delegates 100% of core encryption, key schedule expansion, and permutation cascades to the sovereign D-ARX binary. No legacy or ad-hoc cryptographic modules reside in the client application.

---

## <img src="assets/icons/flows.svg" width="20" height="20" align="absmiddle" alt="Architecture" /> System Architecture & Execution Bridges

Darkstar Vault employs a decoupled multi-layer enclave model:

### <img src="assets/icons/terminal.svg" width="18" height="18" align="absmiddle" alt="Desktop" /> Desktop Enclave (Electron)

The desktop application provides an air-gapped security runtime. The `electron/` main process executes in an isolated context with hardened IPC (`contextBridge`), coordinating:

- Native IPC communication with the `d-arx` binary core via secure stdio pipes.
- Hardware-backed biometric authentication (Windows Hello / macOS Touch ID).
- Runtime binary signature & SHA-512 integrity verification against tamper threats.
- OS-level secure storage delegation via Electron `safeStorage`.

### <img src="assets/icons/tools.svg" width="18" height="18" align="absmiddle" alt="Mobile" /> Mobile Enclave (Capacitor)

On mobile platforms (Android & iOS), **Capacitor** bridges the Angular web views into sandboxed native activities:

- Biometric authentication via Secure Enclave / Android BiometricPrompt.
- Air-gapped visual communication via animated QR-code streams.
- Full offline-first local storage isolation.

---

## <img src="assets/icons/shield.svg" width="20" height="20" align="absmiddle" alt="Shield" /> Security Hardening & Enclave Mitigations

Darkstar Vault is engineered with defense-in-depth hardware and operational countermeasures:

- **Biometric Security Bridge (FIDO2 / WebAuthn)**: Native integration for Windows Hello, Touch ID, Face ID, and hardware security keys (YubiKey via USB/NFC/BLE) with strict User Verification (UV) assertion enforcement.
- **Zero Server-Side Vault Infrastructure**: The enclave operates with no remote backend or cloud database dependencies. Network interaction is strictly isolated to opt-in release engine acquisition and locked update channels.
- **Cryptographic Datapath Integrity**: No dedicated persistent memory or RAM subsystem in the cryptographic datapath; pure ALU stream permutation operations enforce strict non-linear diffusion and confusion without secret-indexed memory lookups.
- **Session Hardening & Zero-Plaintext Memory**: Session master keys are never stored in plaintext on disk; protected via OS-level hardware key stores (`safeStorage` / Keychain / KeyStore).
- **TOTP Dual-Factor Quarantine**: Vault entries with TOTP protection remain in zeroed memory until secondary synchronous verification via `otplib` passes.
- **Air-Gapped Data Exfiltration Protection**: Supports animated high-density visual QR transmission and steganographic data concealment (text and audio carriers).

---

## <img src="assets/icons/target.svg" width="20" height="20" align="absmiddle" alt="Packaging" /> Target Distribution Matrix

| Platform | Runtime / Wrapper | Distribution Formats | Security Enclave Integration |
| :--- | :--- | :--- | :--- |
| **Windows** | Electron Forge | `.exe` (Squirrel / MSI) | Windows Hello, TPM, DPAPI |
| **macOS** | Electron Forge | `.dmg`, `.zip` | Touch ID, Secure Enclave, Keychain |
| **Linux** | Electron Forge | `.deb`, `.rpm` | Libsecret, Secret Service API |
| **Android** | Capacitor + Gradle | `.apk`, `.aab` | Android BiometricPrompt, Keystore |
| **iOS** | Capacitor + Xcode | `.ipa` | Face ID / Touch ID, Keychain |

---

## <img src="assets/icons/rocket.svg" width="20" height="20" align="absmiddle" alt="Development" /> Development Workflow

### Prerequisites

- **Node.js**: v19.0.0+
- **Angular CLI**: v21.2.0+
- **Android Studio** (for Android mobile build targets)
- **Xcode & CocoaPods** (for macOS / iOS targets)

### Interactive Unified Dashboard

Darkstar Vault includes an interactive CLI dashboard for development, packaging, and auditing:

```bash
# Launch interactive developer dashboard
npm start
```

### Core CLI Commands

| Command | Action |
| :--- | :--- |
| `npm run dev` | Launch Angular dev server and Electron in concurrent live-reload mode |
| `npm run build` | Full production bundle compilation, asset hashing, and code obfuscation |
| `npm test` | Execute Karma test suite in headless Chrome |
| `npm run lint:ts` | Run ESLint across Angular and Electron TypeScript sources |
| `npm run format` | Standardize code formatting across TS, HTML, and SCSS via Prettier |
| `npm run rename:arx` | Scan and enforce D-ARX / Darx cryptographic naming standards |
| `npm run fetch:engines` | Synchronize native D-ARX binaries from official Darkstar releases |
| `npm run package` | Package desktop installers via Electron Forge |

### Mobile Synchronization (Capacitor)

When web interface or service updates are made, synchronize native containers:

```bash
# Compile web assets and sync to native mobile platforms
npm run build
npx cap sync

# Launch in native IDEs
npx cap open android
npx cap open ios
```

---

## <img src="assets/icons/scale.svg" width="20" height="20" align="absmiddle" alt="License" /> License & Attribution

Darkstar Vault is licensed under the [Creative Commons Attribution 4.0 International (CC BY 4.0)](LICENSE).  
Core cryptographic permutation algorithms provided by [Darkstar-ARX-512](https://github.com/Kryklin/darkstar).
