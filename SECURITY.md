<p align="left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/assets/img/logo-white.png">
    <img src="public/assets/img/logo-black.png" width="120" alt="Darkstar Logo">
  </picture>
</p>

# Security Policy

Darkstar is a defense-grade security suite. We prioritize the security and integrity of our cryptographic implementations and the privacy of our users.

## Post-Quantum Security Model

The Darkstar ecosystem leverages the **D-ASP** (ASP Cascade 16) protocol with **ML-KEM-1024** (Kyber) at its core. Our security model assumes:

- **Zero-Knowledge**: No sensitive data (passwords, recovery phrases) is ever stored in plaintext or transmitted outside the local security enclave.
- **Physical Binding**: Payloads are cryptographically bound to the host hardware, limiting the impact of physical data theft.
- **Algorithm Agnosticism**: D-ASP provides a structural permutation layer that remains secure even if underlying symmetric primitives are weakened.

## Supported Versions

| Version   | Supported      | Security Standard                    |
| :-------- | :------------- | :----------------------------------- |
| **3.0.x** | ✅ Active      | D-ASP (ASP Cascade 16) / ML-KEM-1024 |
| **2.1.x** | ✅ Maintenance | D-KASP V5 / Kyber-1024               |
| **< 2.1** | ❌ End of Life | Legacy RSA/AES                       |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you identify a security vulnerability in Darkstar, please report it via encrypted email to:
**mortalpain1@gmail.com**

What to include in your report:

- A clear description of the vulnerability.
- Steps to reproduce (PoC).
- Impact analysis.

### Response Timeline

You should receive a response within **48 hours**. If no response is received, please follow up to ensure your message was not caught by spam filters.

---

### Security Guarantees

Darkstar does not contain backdoors, and we do not collect telemetry or usage data. The source remains open and verifiable for independent security audits.

---

[**&larr; Back to Project Root**](README.md) | [**D-ASP Mathematical Specification**](https://github.com/Kryklin/darkstar/blob/main/d-asp/DASP_CRYPTO_MATH.md)
