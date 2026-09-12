<p align="left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/assets/img/logo-white.png">
    <img src="public/assets/img/logo-black.png" width="120" alt="Darkstar Logo">
  </picture>
</p>

# Darkstar Vault: Sovereign Desktop & Mobile Security Enclave

<p align="left">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white" alt="Angular">
</p>

<p align="left">
  <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS">
  <img src="https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux">
  <img src="https://img.shields.io/badge/iOS-000000?style=for-the-badge&logo=ios&logoColor=white" alt="iOS">
  <img src="https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android">
</p>

---

## 🏗️ Architecture Overview

The **Darkstar Vault** (`darkstar-vault`) application is a unified, defense-grade sovereign security dashboard built using a modern decoupled architecture. It leverages a shared **Angular** frontend that is deployed to native environments via specialized desktop (**Electron**) and mobile (**Capacitor**) bridges.

Under the hood, Darkstar Vault utilizes the sovereign **D-ASP** (Darkstar Algebraic Substitution & Permutation) post-quantum cryptographic engine from the core [kryklin/darkstar](https://github.com/Kryklin/darkstar) project.

### 💻 Desktop Execution (Electron)

The desktop application uses **Electron** to provide a secure, air-gapped-ready environment. The `electron/` source manages native IPC (Inter-Process Communication), system biometrics (Windows Hello / TouchID), and hardware-bound integrity checks.

### 📱 Mobile Execution (Capacitor)

For mobile platforms, **Capacitor** bridges the Angular web views to native Android and iOS activities. Hardware-unique identity binding is maintained across all platforms through the standard D-ASP protocol.

---

## 🚀 Development Workflow

### Prerequisites

- **Node.js**: v19.0.0+
- **Angular CLI**: v21.2.0+
- **CocoaPods** (for iOS development)
- **Android Studio** (for Android development)

### Standard Execution

The app uses an interactive developer dashboard for all execution and testing tasks.

```bash
# Launch the unified dashboard
npm start
```

_Select the **Run Dev Environment** option to launch Angular and Electron concurrently._

### Mobile Synchronization

When UI changes are made, they must be synchronized to the native mobile wrappers. This can be handled directly via the CLI:

1.  Launch `npm start`.
2.  Select **Sync Mobile Assets**.
    - This will automatically build the web assets (`npm run build`) and perform the synchronization (`npx cap sync`).

### Opening Native IDEs

```bash
npx cap open android
npx cap open ios
```

---

## 📦 Build & Packaging

Darkstar uses **Electron Forge** for desktop distribution and **Capacitor CLI** for mobile.

| Target Platform | Toolchain          | Output Format           |
| :-------------- | :----------------- | :---------------------- |
| **Windows**     | Electron Forge     | `.exe` (Squirrel / MSI) |
| **macOS**       | Electron Forge     | `.dmg`, `.zip`          |
| **Linux**       | Electron Forge     | `.deb`, `.rpm`          |
| **Android**     | Capacitor + Gradle | `.apk`, `.aab`          |
| **iOS**         | Capacitor + Xcode  | `.ipa`                  |

---

## 🔒 The Sovereign Vault

The Darkstar Vault is the primary high-security storage layer for sensitive cryptographic material. Unlike standard password managers, the Vault utilizes a **Hybrid Post-Quantum Strategy** to ensure long-term data resilience.

### Encryption Architecture

- **KEM-DEM Construction**: Uses **ML-KEM-1024** (Kyber) for the KEM layer and the **ASP Cascade 16** engine for the Data Encapsulation (DEM).
- **Hardened Key Derivation**: Master passwords are expanded using **PBKDF2-HMAC-SHA256** with 100,000 iterations before being injected into the PQC keygen logic.
- **Hardware Binding**: If enabled, the Vault injects a machine-unique identifier (`machine-id`) as a salt for the **ASP Cascade 16** round diversification, ensuring the data cannot be decrypted on a different physical device even with the correct password.

### Data Model

- **Notes**: Full Markdown support for longform secrets.
- **Identities**: Secure storage for ECDSA (P-256) and PQC (ML-KEM) key pairs.
- **Signatures**: Native support for message signing and identity verification.

---

## 🛡️ Biometric Security (Windows Hello & TouchID)

Darkstar integrates native hardware authentication to streamline secure access without compromising the underlying cryptographic safety.

### WebAuthn Native Bridge

The app utilizes the **WebAuthn (FIDO2)** API to interface with the system's secure enclave (TPM for Windows, Secure Enclave for macOS).

- **Windows Hello**: Full support for Pin, Fingerprint, and Facial recognition.
- **TouchID / FaceID**: Native integration for macOS and mobile platforms.
- **Security Keys**: Supports cross-platform FIDO2/WebAuthn hardware tokens (e.g., YubiKey) via USB, NFC, and BLE.

### Session Hardening

When Biometric Unlock is enabled, Darkstar uses **Electron safeStorage** to protect the session keys. The master password is never stored in plaintext; it is encrypted using the OS-level encryption provider before being cached for biometric retrieval.

---

## 🔑 TOTP & 2nd-Factor Authentication

Darkstar provides built-in support for **Time-based One-Time Passwords (TOTP)** to protect high-value vaults with an additional layer of verification.

- **Verification Lifecycle**: If a TOTP secret is present in the vault envelope, the system enters a **"Pending TOTP"** state after initial password decryption. The vault contents remain zeroed in memory until the 6-digit token is verified.
- **Library integration**: Uses the industry-standard **otplib** for synchronous token validation across all platform bridges.

---

[**&larr; Back to Project Root**](README.md)
