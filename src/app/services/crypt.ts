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
   * Encrypts binary data (Uint8Array) using an authenticated streaming container.
   * Splits data into 16 KB chunks and binds each chunk cryptographically to a unique
   * streamId, sequential chunk index, and total chunk count to prevent chunk reordering,
   * truncation, or splicing attacks.
   */
  async encryptBinary(data: Uint8Array, keyMaterial: string, hwid?: string): Promise<Uint8Array> {
    const CHUNK_SIZE = 16 * 1024; // 16 KB slice ceiling
    const totalSize = data.length;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE) || 1;
    const streamId = Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    const chunks: string[] = [];

    for (let index = 0; index < totalChunks; index++) {
      const offset = index * CHUNK_SIZE;
      const slice = data.subarray(offset, Math.min(offset + CHUNK_SIZE, totalSize));
      const sliceBase64 = this.buf2base64(slice);

      // Authenticated frame: cryptographically binds streamId, chunk index, total chunks, total size, and chunkSize
      const framePayload = JSON.stringify({
        s: streamId,
        i: index,
        n: totalChunks,
        t: totalSize,
        c: CHUNK_SIZE,
        l: slice.length,
        d: sliceBase64,
      });

      const { encryptedData } = await this.encrypt(framePayload, keyMaterial, hwid);
      chunks.push(encryptedData);
    }

    const container = {
      magic: 'DARX-STRM',
      v: 2,
      streamId,
      totalSize,
      totalChunks,
      chunkSize: CHUNK_SIZE,
      chunks,
    };

    return new TextEncoder().encode(JSON.stringify(container));
  }

  /**
   * Decrypts binary data (Uint8Array) via the D-ARX core.
   * Authenticates streaming frames, validating streamId, chunk sequence, bounds, and total size.
   * Seamlessly unpacks legacy chunked (v1) and unchunked blobs for backward compatibility.
   */
  async decryptBinary(payload: Uint8Array, keyMaterial: string, hwid?: string): Promise<Uint8Array> {
    const payloadStr = new TextDecoder().decode(payload);

    try {
      const parsed = JSON.parse(payloadStr);

      // Version 2: Authenticated Streaming Container
      if (parsed && parsed.magic === 'DARX-STRM' && parsed.v === 2 && Array.isArray(parsed.chunks)) {
        if (parsed.chunks.length !== parsed.totalChunks) {
          throw new Error(`Streaming integrity violation: expected ${parsed.totalChunks} chunks, found ${parsed.chunks.length}.`);
        }

        const decryptedSlices: Uint8Array[] = [];
        for (let idx = 0; idx < parsed.chunks.length; idx++) {
          const chunkCiphertext = parsed.chunks[idx];
          const { decrypted } = await this.decrypt(chunkCiphertext, '', keyMaterial, hwid);
          const frame = JSON.parse(decrypted);

          // Authenticate frame metadata: streamId, chunk index, chunk count, totalSize, chunkSize
          if (
            !frame ||
            frame.s !== parsed.streamId ||
            frame.i !== idx ||
            frame.n !== parsed.totalChunks ||
            (typeof frame.t === 'number' && frame.t !== parsed.totalSize) ||
            (typeof frame.c === 'number' && frame.c !== parsed.chunkSize)
          ) {
            throw new Error(`Streaming integrity violation: chunk ${idx} failed authentication (metadata tampering detected).`);
          }

          const binaryStr = atob(frame.d);
          if (typeof frame.l === 'number' && binaryStr.length !== frame.l) {
            throw new Error(`Streaming integrity violation: chunk ${idx} length mismatch.`);
          }

          const sliceBytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            sliceBytes[i] = binaryStr.charCodeAt(i);
          }
          decryptedSlices.push(sliceBytes);
        }

        const totalLength = decryptedSlices.reduce((sum, s) => sum + s.length, 0);
        if (typeof parsed.totalSize === 'number' && totalLength !== parsed.totalSize) {
          throw new Error(`Streaming integrity violation: assembled stream size (${totalLength}) does not match authenticated container totalSize (${parsed.totalSize}).`);
        }

        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const slice of decryptedSlices) {
          result.set(slice, offset);
          offset += slice.length;
        }
        return result;
      }

      // Version 1 Legacy chunked container fallback
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
    } catch (parseOrIntegrityErr) {
      if ((parseOrIntegrityErr as Error).message?.includes('Streaming integrity violation')) {
        throw parseOrIntegrityErr;
      }
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
