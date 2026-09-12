import { Injectable, inject } from '@angular/core';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { CryptService } from './crypt';

export interface TimeLockMetadata {
  seedHex: string;
  iterations: number;
  isLocked: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class TimeLockService {
  private crypt = inject(CryptService);
  private HASHES_PER_SECOND = 1500000;

  public async computeDelay(seedHex: string, iterations: number, progressCallback?: (p: number) => void): Promise<string> {
    let currentHash: Uint8Array = hexToBytes(seedHex);
    const chunkSize = 20000;

    for (let i = 0; i < iterations; i += chunkSize) {
      const end = Math.min(i + chunkSize, iterations);
      for (let j = i; j < end; j++) {
        currentHash = sha256(currentHash);
      }

      if (progressCallback) {
        progressCallback(Math.floor((end / iterations) * 100));
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return bytesToHex(currentHash);
  }

  public async lockNoteContent(content: string, seconds: number, progressCallback?: (p: number) => void): Promise<{ encryptedData: string; metadata: TimeLockMetadata }> {
    const iterations = Math.max(1, seconds * this.HASHES_PER_SECOND);
    const seedBytes = new Uint8Array(32);
    window.crypto.getRandomValues(seedBytes);
    const seed = bytesToHex(seedBytes);

    const keyHex = await this.computeDelay(seed, iterations, progressCallback);
    const { encryptedData } = await this.crypt.encrypt(content, keyHex);

    return {
      encryptedData,
      metadata: {
        seedHex: seed,
        iterations,
        isLocked: true,
      },
    };
  }

  public async unlockNoteContent(encryptedData: string, metadata: TimeLockMetadata, progressCallback?: (p: number) => void): Promise<string> {
    const keyHex = await this.computeDelay(metadata.seedHex, metadata.iterations, progressCallback);
    const { decrypted } = await this.crypt.decrypt(encryptedData, '', keyHex);
    if (!decrypted) {
      throw new Error('Failed to unlock time-locked note.');
    }
    return decrypted;
  }
}
