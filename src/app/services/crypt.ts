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
    const result = await window.electronAPI.dArxEncrypt(payload, keyMaterial, 'rust', hwid);
    return {
      encryptedData: typeof result === 'string' ? result : JSON.stringify(result),
      reverseKey: '',
    };
  }

  /**
   * Decrypts an encrypted payload using the D-ARX core via Electron IPC.
   */
  async decrypt(encryptedDataRaw: string, reverseKey: string, passwordOrSk: string, hwid?: string): Promise<DecryptionResult> {
    const result = await window.electronAPI.dArxDecrypt(encryptedDataRaw, reverseKey, passwordOrSk, 'rust', hwid);

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
   * Encrypts binary data (Uint8Array) via chunked D-ARX core IPC.
   * Splits arbitrary-length data into 16 KB chunks to prevent argument
   * buffer overflow in the native process execution pipeline.
   */
  async encryptBinary(data: Uint8Array, keyMaterial: string, hwid?: string): Promise<Uint8Array> {
    const CHUNK_SIZE = 16 * 1024; // 16 KB slice ceiling
    const totalSize = data.length;
    const chunks: string[] = [];

    for (let offset = 0; offset < totalSize; offset += CHUNK_SIZE) {
      const slice = data.subarray(offset, Math.min(offset + CHUNK_SIZE, totalSize));
      const sliceBase64 = this.buf2base64(slice);
      const { encryptedData } = await this.encrypt(sliceBase64, keyMaterial, hwid);
      chunks.push(encryptedData);
    }

    const container = {
      v: 1,
      dArxChunked: true,
      totalSize,
      chunkSize: CHUNK_SIZE,
      chunks,
    };

    return new TextEncoder().encode(JSON.stringify(container));
  }

  /**
   * Decrypts binary data (Uint8Array) via the D-ARX core.
   * Seamlessly unpacks chunked container formats while supporting legacy single-blob payloads.
   */
  async decryptBinary(payload: Uint8Array, keyMaterial: string, hwid?: string): Promise<Uint8Array> {
    const payloadStr = new TextDecoder().decode(payload);

    try {
      const parsed = JSON.parse(payloadStr);
      if (parsed && parsed.dArxChunked === true && Array.isArray(parsed.chunks)) {
        const decryptedSlices: Uint8Array[] = [];
        for (const chunk of parsed.chunks) {
          const { decrypted } = await this.decrypt(chunk, '', keyMaterial, hwid);
          const binaryStr = atob(decrypted);
          const sliceBytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            sliceBytes[i] = binaryStr.charCodeAt(i);
          }
          decryptedSlices.push(sliceBytes);
        }

        const totalLength = decryptedSlices.reduce((sum, s) => sum + s.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const slice of decryptedSlices) {
          result.set(slice, offset);
          offset += slice.length;
        }
        return result;
      }
    } catch {
      // Fallback to legacy single-blob decryption if payload is not a chunked JSON envelope
    }

    const { decrypted } = await this.decrypt(payloadStr, '', keyMaterial, hwid);
    const binaryStr = atob(decrypted);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * High-level helper for binary file encryption.
   */
  async encryptBinaryDArx(data: Uint8Array, password: string, pqcPublicKey?: string): Promise<Uint8Array> {
    return this.encryptBinary(data, pqcPublicKey || password);
  }

  /**
   * High-level helper for binary file decryption.
   */
  async decryptBinaryAuto(payload: Uint8Array, password: string): Promise<Uint8Array> {
    return this.decryptBinary(payload, password);
  }

  /**
   * Encodes a binary buffer to base64 using chunked streaming buffers
   * to avoid call-stack exhaustion and quadratic memory bloat on large files.
   */
  private buf2base64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const CHUNK_SIZE = 0x8000; // 32KB chunk window
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK_SIZE))));
    }
    return btoa(chunks.join(''));
  }
}
