import { Injectable } from '@angular/core';

export interface DecryptionResult {
  decrypted: string;
}

@Injectable({
  providedIn: 'root',
})
/**
 * Core cryptographic service for the Darkstar security suite.
 * Delegates all encryption and decryption operations to the native D-ARX-512 core.
 */
export class CryptService {
  /**
   * Encrypts a payload using the D-ARX core via Electron IPC.
   * Leverages ML-KEM-1024 post-quantum key encapsulation and ARX-512 symmetric permutation.
   */
  async encrypt(payload: string, keyMaterial: string, hwid?: string): Promise<{ encryptedData: string; reverseKey: string }> {
    const result = await window.electronAPI.dAsPEncrypt(payload, keyMaterial, 'rust', hwid);
    return {
      encryptedData: typeof result === 'string' ? result : JSON.stringify(result),
      reverseKey: '',
    };
  }

  /**
   * Decrypts an encrypted payload using the D-ARX core via Electron IPC.
   */
  async decrypt(encryptedDataRaw: string, reverseKey: string, passwordOrSk: string, hwid?: string): Promise<DecryptionResult> {
    const result = await window.electronAPI.dAsPDecrypt(encryptedDataRaw, reverseKey, passwordOrSk, 'rust', hwid);

    if (typeof result === 'string') {
      return { decrypted: result };
    }

    if (result && typeof result === 'object') {
      if ('decrypted' in result) {
        return { decrypted: (result as Record<string, unknown>)['decrypted'] as string };
      }
      return { decrypted: JSON.stringify(result) };
    }

    return { decrypted: String(result) };
  }

  /**
   * Encrypts binary data (Uint8Array) via the D-ARX core.
   */
  async encryptBinary(data: Uint8Array, keyMaterial: string, hwid?: string): Promise<Uint8Array> {
    const base64Data = this.buf2base64(data);
    const { encryptedData } = await this.encrypt(base64Data, keyMaterial, hwid);
    return new TextEncoder().encode(encryptedData);
  }

  /**
   * Decrypts binary data (Uint8Array) via the D-ARX core.
   */
  async decryptBinary(payload: Uint8Array, keyMaterial: string, hwid?: string): Promise<Uint8Array> {
    const payloadStr = new TextDecoder().decode(payload);
    const { decrypted } = await this.decrypt(payloadStr, '', keyMaterial, hwid);
    const binaryStr = atob(decrypted);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * High-level helper for binary file encryption.
   */
  async encryptBinaryDAsP(data: Uint8Array, password: string, pqcPublicKey?: string): Promise<Uint8Array> {
    return this.encryptBinary(data, pqcPublicKey || password);
  }

  /**
   * High-level helper for binary file decryption.
   */
  async decryptBinaryAuto(payload: Uint8Array, password: string): Promise<Uint8Array> {
    return this.decryptBinary(payload, password);
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
}
