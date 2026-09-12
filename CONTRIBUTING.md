<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-anim-dark.svg">
    <img src="assets/logo-anim-light.svg" width="120" alt="Darkstar Logo">
  </picture>
</p>

<div align="center">

[<img src="assets/icons/home.svg" width="13" height="13" align="absmiddle" alt="Main" /> Main](README.md) | [<img src="assets/icons/shield.svg" width="13" height="13" align="absmiddle" alt="Security" /> Security](SECURITY.md) | [<img src="assets/icons/handshake.svg" width="13" height="13" align="absmiddle" alt="Contributing" /> Contributing](CONTRIBUTING.md) | [<img src="assets/icons/standards.svg" width="13" height="13" align="absmiddle" alt="Code of Conduct" /> Code of Conduct](CODE_OF_CONDUCT.md) | [<img src="assets/icons/math.svg" width="13" height="13" align="absmiddle" alt="Engine Spec" /> D-ARX Core Spec](https://github.com/Kryklin/darkstar)

</div>

<h1 align="center">Contributing to Darkstar Vault</h1>

Thank you for your commitment to improving Darkstar Vault! As a defense-grade security application, we maintain rigorous standards for cryptographic integrity, type safety, test coverage, and enclave hygiene.

The following guidelines outline how to build, test, and contribute to the Darkstar Vault repository effectively.

---

## <img src="assets/icons/rocket.svg" width="20" height="20" align="absmiddle" alt="Getting Started" /> Getting Started & Development Setup

### 1. Prerequisites

- **Node.js**: `v19.0.0+`
- **Angular CLI**: `v21.2.0+`
- **Native Android / iOS SDKs** (Optional, required only for native mobile targets)

### 2. Environment Initialization

```bash
# Clone the repository
git clone https://github.com/Kryklin/darkstar-vault.git
cd darkstar-vault

# Install dependencies
npm install

# Synchronize verified D-ARX native engine binaries
npm run fetch:engines
```

### 3. Interactive Developer Dashboard

Darkstar Vault includes an interactive terminal dashboard managing all developer pipelines:

```bash
npm start
```

From this menu, you can launch the concurrent Angular + Electron environment, run test suites, check code quality, format files, and synchronize mobile assets.

---

## <img src="assets/icons/terminal.svg" width="20" height="20" align="absmiddle" alt="CLI Suite" /> Command Reference

| Command | Action |
| :--- | :--- |
| `npm start` | Launch interactive terminal development dashboard |
| `npm run dev` | Concurrently start Angular dev server (`localhost:4200`) and Electron runtime |
| `npm test` | Execute full Karma unit test suite using headless Chrome |
| `npm run lint:ts` | Perform static code analysis using ESLint across Angular and Electron |
| `npm run format` | Standardize code formatting across TypeScript, HTML, and SCSS via Prettier |
| `npm run rename:arx` | Validate and enforce D-ARX / Darx cryptographic naming standards |
| `npm run fetch:engines` | Fetch pre-compiled native D-ARX binaries from official Darkstar releases |
| `npm run build` | Compile production Angular web bundle and package Electron runtime |
| `npm run package` | Package platform distributables using Electron Forge |

---

## <img src="assets/icons/tools.svg" width="20" height="20" align="absmiddle" alt="Mobile Workflow" /> Mobile Platform Workflow (Capacitor)

When modifying shared Angular components, services, or assets, synchronize mobile containers:

```bash
# 1. Compile web bundle & synchronize to Capacitor bridges
npm run build
npx cap sync

# 2. Open platform in native developer environments
npx cap open android
npx cap open ios
```

---

## <img src="assets/icons/shield.svg" width="20" height="20" align="absmiddle" alt="Cryptographic Rules" /> Cryptographic & Architectural Guidelines

> [!IMPORTANT]
> **No In-App Custom Cryptography**:
> Darkstar Vault does not implement or maintain ad-hoc cryptographic algorithms, stream ciphers, or custom hash functions within client-side TypeScript. All cryptographic permutations, key schedules, and stream encryption are delegated to the native [D-ARX-512](https://github.com/Kryklin/darkstar) core.

1. **Type Safety**:
   - Strictly type all parameters, return types, and IPC communication payloads.
   - Do not create mock `.d.ts` declaration files that shadow npm packages; install official `@types/*` packages instead.
2. **Memory Safety**:
   - Zero out memory buffers containing sensitive passphrases or keys immediately after use.
   - Avoid logging sensitive credentials or unencrypted data to `console.log` or file logs.
3. **IPC Security**:
   - Keep Electron IPC channels locked down through `contextBridge` and explicit handler channels in `electron/preload.ts`.

---

## <img src="assets/icons/flows.svg" width="20" height="20" align="absmiddle" alt="PR Process" /> Pull Request Lifecycle

1. **Branching**: Branch from `main` with a descriptive name (e.g., `feat/biometric-prompt` or `fix/ipc-buffer-leak`).
2. **Pre-commit Checklist**:
   - Run `npm run lint:ts` and ensure zero linter errors.
   - Run `npm test` and ensure all unit tests pass.
   - Run `npx tsx scripts/replace-legacy-crypto-names.ts --check` to enforce D-ARX naming compliance.
   - Run `npm run format` to ensure Prettier formatting.
3. **Commit Messages**: Use [Conventional Commits](https://www.conventionalcommits.org/) format:
   - `feat(vault): add animated qr burst mode`
   - `fix(electron): prevent zombie engine process on exit`
   - `docs(readme): align visual design with darkstar core`
4. **Submitting**: Open a Pull Request referencing related issues and describing verification steps.

---

<div align="center">

[<img src="assets/icons/home.svg" width="13" height="13" align="absmiddle" alt="Main" /> Main](README.md) | [<img src="assets/icons/shield.svg" width="13" height="13" align="absmiddle" alt="Security" /> Security](SECURITY.md) | [<img src="assets/icons/handshake.svg" width="13" height="13" align="absmiddle" alt="Contributing" /> Contributing](CONTRIBUTING.md) | [<img src="assets/icons/standards.svg" width="13" height="13" align="absmiddle" alt="Code of Conduct" /> Code of Conduct](CODE_OF_CONDUCT.md) | [<img src="assets/icons/math.svg" width="13" height="13" align="absmiddle" alt="Engine Spec" /> D-ARX Core Spec](https://github.com/Kryklin/darkstar)

</div>
