<p align="left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/assets/img/logo-white.png">
    <img src="public/assets/img/logo-black.png" width="120" alt="Darkstar Logo">
  </picture>
</p>

<h1 align="center">Contributing to Darkstar</h1>

Thank you for investing your time in contributing to our project!

The following guidelines will help you contribute to Darkstar effectively. These are guidelines, not hard rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## How Can I Contribute?

### Reporting Bugs

Help us understand your report, reproduce the behavior, and find related reports by following these guidelines.

- **Use a clear and descriptive title** for the issue to identify the problem.
- **Describe the exact steps to reproduce the problem** in as many details as possible.
- **Include screenshots and animated GIFs** which show you following the described steps and demonstrate the problem.
- **Explain which behavior you expected to see instead and why.**

### Suggesting Enhancements

We welcome suggestions for new features and improvements to existing functionality.

- **Use a clear and descriptive title** for the issue to identify the suggestion.
- **Provide a step-by-step description of the suggested enhancement** in as many details as possible.
- **Provide specific examples to demonstrate the steps.**

### Pull Requests

1.  Fork the repo and create your branch from `main`.
2.  If you've added code that should be tested, add tests.
3.  If you've changed APIs, update the documentation.
4.  Ensure the test suite passes.
5.  Make sure your code lints.
6.  Issue that pull request!

## Development Setup

1.  **Install dependencies**:

    ```bash
    npm install
    ```

2.  **Launch the Interactive CLI (Strongly Recommended)**:

    Darkstar utilizes a terminal-based dashboard for all developer operations. This tool automates engine synchronization, environment setup, and testing.

    ```bash
    npm start
    ```

    See the [**Darkstar CLI Guide**](DARKSTAR_CLI_GUIDE.md) for a full breakdown of options (Dev Env, Lint, Interop, Release).

3.  **Formatting**:

    ```bash
    npx prettier --write .
    ```

4.  **Native Crypto Engine (D-ASP)**:
    - The Vault UI utilizes the native D-ASP engine from [kryklin/darkstar](https://github.com/Kryklin/darkstar).
    - To test against the native engine locally, run `npx tsx scripts/fetch-engines.ts` or place compiled binaries into `./bin/`.

## Styleguides

### Git Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

### Coding Standards

- We use **Prettier** for formatting.
- We use **ESLint** for linting.
- Please ensure `npm run lint` passes before submitting.

---

[**&larr; Back to Project Root**](README.md) | [**D-ASP Mathematical Specification**](https://github.com/Kryklin/darkstar/blob/main/d-asp/DASP_CRYPTO_MATH.md)
