# Darkstar Vault: Copilot & Agent Instructions

This document provides definitive technical guidance and architectural constraints for AI agents and developers contributing to the `darkstar-vault` codebase.

---

## 1. Architectural Architecture & Enclave Model

Darkstar Vault is a defense-grade sovereign security enclave utilizing a decoupled frontend and native runtime architecture:

- **Frontend Core**: Angular 21 with Angular Material, Signals, and Standalone Components. Root entry at `src/main.ts`, root component at `src/app/app.ts`.
- **Desktop Runtime (Electron)**: Located in `electron/`. Hardened with `contextBridge`, zero-node-integration in renderer, strict IPC channel validation, and biometric enclave attestation.
- **Mobile Wrappers (Capacitor)**: Located in `android/` and `ios/`. Synchronized from the compiled Angular browser bundle via `npx cap sync`.
- **Cryptographic Engine (D-ARX-512)**: The client application **MUST NOT** implement or embed custom cryptography or stream ciphers in TypeScript. All cryptographic primitives, key schedule expansion, and permutation cascades are delegated directly to the native pre-compiled `d-arx` binary core downloaded from verified [kryklin/darkstar](https://github.com/Kryklin/darkstar) releases.

---

## 2. Developer Pipelines & Workflows

### Execution Commands

| Command | Purpose |
| :--- | :--- |
| `npm start` | **Interactive CLI Dashboard**: Unified terminal launcher for dev, test, and packaging pipelines. |
| `npm run dev` | **Development Mode**: Starts Angular dev server (`localhost:4200`) and Electron concurrently with live reload. |
| `npm test` | **Karma Tests**: Executes full test suite in headless Chrome (`--watch=false --browsers=ChromeHeadless`). |
| `npm run lint:ts` | **TypeScript Linting**: Runs ESLint across Angular and Electron sources. |
| `npm run format` | **Code Formatting**: Formats TypeScript, HTML, SCSS, and JSON via Prettier. |
| `npm run rename:arx` | **D-ARX Verification**: Audits and enforces strict D-ARX / Darx naming compliance. |
| `npm run fetch:engines` | **Binary Sync**: Downloads verified native D-ARX core binaries from official Darkstar releases. |
| `npm run build` | **Production Bundle**: Compiles Angular production bundle and Electron main/preload. |
| `npm run package` | **Distribution**: Builds installer executables via Electron Forge. |

### Mobile Synchronization (Capacitor)

```bash
npm run build
npx cap sync
npx cap open android # or npx cap open ios
```

---

## 3. Strict Coding Standards & Constraints

1. **Cryptographic Core Integrity**:
   - Always reference the cryptographic engine as `D-ARX` or `Darx` / `darx`. Never reintroduce legacy names (`D-ASP`, `spna`, `aes`, etc.).
   - All encryption/decryption requests must flow through `window.electronAPI.dArxEncrypt` and `window.electronAPI.dArxDecrypt`.
2. **TypeScript & Declaration Discipline**:
   - Do **NOT** create mock `.d.ts` files (e.g. `declare module '...'`) when official types exist on npm.
   - Install official `@types/*` packages (e.g. `@types/qrcode`, `@types/electron-squirrel-startup`).
   - Run `npx tsc --p tsconfig.electron.json --noEmit` and `npm run lint:ts` to guarantee 0 errors.
3. **Memory & Sensitive Data Sanitization**:
   - Zero out buffers and string references containing secret keys or plaintext passwords immediately after usage.
   - Master session credentials stored on disk must use Electron `safeStorage` (hardware TPM/DPAPI/Keychain).
4. **Formatting**:
   - Always run `npm run format` after making edits to preserve Prettier formatting consistency.
