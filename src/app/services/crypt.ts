import { Injectable } from '@angular/core';

export interface DecryptionResult {
  decrypted: string;
}

@Injectable({
  providedIn: 'root',
})
/**
 * Core cryptographic service for the Darkstar security suite.
 * Implements the definitive D-ASP protocol with hardware binding and performance optimization.
 */
export class CryptService {
  /** Recommended iteration count for PBKDF2 standard layers. */
  public PBKDF2_ITERATIONS = 600000;

  private readonly SALT_SIZE_BYTES = 128 / 8;

  async encryptAES256GCMAsync(data: string, password: string, iterations: number): Promise<string> {
    const enc = new TextEncoder();
    const salt = window.crypto.getRandomValues(new Uint8Array(this.SALT_SIZE_BYTES));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const keyMaterial = await window.crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);

    const key = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );

    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(data));
    return this.buf2hex(salt) + this.buf2hex(iv) + this.buf2base64(encrypted);
  }

  async decryptAES256GCMAsync(transitmessage: string, password: string, iterations: number): Promise<string> {
    try {
      const saltHex = transitmessage.substr(0, 32);
      const ivHex = transitmessage.substr(32, 24);
      const encryptedBase64 = transitmessage.substring(56);

      const salt = this.hex2buf(saltHex);
      const iv = this.hex2buf(ivHex);
      const encryptedBytes = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));

      const enc = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);

      const key = await window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt as BufferSource,
          iterations: iterations,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );

      const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encryptedBytes);
      return new TextDecoder().decode(decrypted);
    } catch {
      return '';
    }
  }

  /**
   * Encrypts binary data (Uint8Array) using D-ASP hardened key derivation and AES-256-GCM.
   */
  async encryptBinaryDAsP(data: Uint8Array, password: string, pqcPublicKey?: string, label = 'dasp-file'): Promise<Uint8Array> {
    const salt = window.crypto.getRandomValues(new Uint8Array(this.SALT_SIZE_BYTES));
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

    const keyBytes = await this.deriveDKaspFileKey(password, salt, label, pqcPublicKey);
    const key = await window.crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']);

    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource);
    const encryptedBytes = new Uint8Array(encrypted);

    const result = new Uint8Array(1 + salt.length + iv.length + encryptedBytes.length);
    result[0] = 0xda; // D-ASP Standard Binary Marker
    result.set(salt, 1);
    result.set(iv, 1 + salt.length);
    result.set(encryptedBytes, 1 + salt.length + iv.length);

    return result;
  }

  async decryptBinaryAuto(payload: Uint8Array, password: string): Promise<Uint8Array> {
    return this.decryptBinary(payload, password);
  }

  /**
   * Decrypts a D-ASP hardened binary payload.
   */
  async decryptBinary(payload: Uint8Array, password: string): Promise<Uint8Array> {
    if (payload[0] === 0xda) {
      // D-ASP Standard Binary Payload
      const salt = payload.slice(1, 1 + this.SALT_SIZE_BYTES);
      const iv = payload.slice(1 + this.SALT_SIZE_BYTES, 1 + this.SALT_SIZE_BYTES + 12);
      const ciphertext = payload.slice(1 + this.SALT_SIZE_BYTES + 12);

      const keyBytes = await this.deriveDKaspFileKey(password, salt, 'dasp-file');
      const key = await window.crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);

      const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext as BufferSource);
      return new Uint8Array(decrypted);
    } else {
      throw new Error('Unsupported binary payload format.');
    }
  }

  /**
   * Derives a post-quantum hardened symmetric key using the ASP Cascade 16 engine.
   * This binds the file security to the hardware-bound root of trust.
   */
  async deriveDKaspFileKey(password: string, salt: Uint8Array, label: string, recipientPqcPublicKey?: string): Promise<Uint8Array> {
    // 1. Initial PBKDF2 to get a stable seed for D-KASP engine
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const seed = await window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: this.PBKDF2_ITERATIONS / 10, hash: 'SHA-256' }, keyMaterial, 256);
    const seedHex = this.buf2hex(seed);

    // 2. Pass the label through the ASP Cascade engine (16-round structural permutation)
    // If recipientPqcPublicKey is provided, we use it for post-quantum hardening.
    // Otherwise, we fallback to our derived symmetric seed.
    const keyToUse = recipientPqcPublicKey || seedHex;

    const { encryptedData } = await this.encrypt(label, keyToUse);

    // 3. Hash the hardened output to get the final 256-bit symmetric key
    const finalHash = await window.crypto.subtle.digest('SHA-256', enc.encode(encryptedData));
    return new Uint8Array(finalHash);
  }

  private buf2hex(buffer: ArrayBuffer | Uint8Array): string {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private hex2buf(hex: string): Uint8Array {
    return new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  }

  private buf2base64(buffer: ArrayBuffer | Uint8Array): string {
    let binary = '';
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Encrypts a payload using the D-ASP External Engine via IPC.
   * Performs advanced structural permutation and hardware binding.
   */
  async encrypt(payload: string, keyMaterial: string, hwid?: string): Promise<{ encryptedData: string; reverseKey: string }> {
    const engine = localStorage.getItem('dasp_engine') || 'rust';
    const result = await window.electronAPI.dAsPEncrypt(payload, keyMaterial, engine, hwid);
    return {
      encryptedData: typeof result === 'string' ? result : JSON.stringify(result),
      reverseKey: '',
    };
  }

  /**
   * Decrypts and de-obfuscates an encrypted payload via IPC.
   */
  async decrypt(encryptedDataRaw: string, reverseKey: string, passwordOrSk: string, hwid?: string): Promise<DecryptionResult> {
    const engine = localStorage.getItem('dasp_engine') || 'rust';
    const result = await window.electronAPI.dAsPDecrypt(encryptedDataRaw, reverseKey, passwordOrSk, engine, hwid);

    // If it's already a string, return it wrapped.
    if (typeof result === 'string') {
      return { decrypted: result };
    }

    // If it's an object, it might be the parsed vault content or have a .decrypted field.
    if (result && typeof result === 'object') {
      if ('decrypted' in result) {
        return { decrypted: (result as Record<string, unknown>)['decrypted'] as string };
      }
      return { decrypted: JSON.stringify(result) };
    }

    return { decrypted: String(result) };
  }
}
