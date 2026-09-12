import { Injectable, inject } from '@angular/core';
import { CryptService } from './crypt';
import { VaultAttachment } from './vault';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

@Injectable({
  providedIn: 'root',
})
export class VaultFileService {
  private crypt = inject(CryptService);

  /**
   * Reads a File, encrypts it, and saves it to the Vault storage via IPC.
   * returns the attachment metadata.
   */
  async uploadFile(file: File, password: string, pqcPublicKey?: string): Promise<VaultAttachment> {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    // Encrypt using D-ASP hardened methodology
    const encryptedData = await this.crypt.encryptBinaryDAsP(data, password, pqcPublicKey);

    // Generate unique filename
    const ref = `${crypto.randomUUID()}.enc`;

    // Save to disk
    if (Capacitor.isNativePlatform()) {
      // Capacitor Mobile: Write as base64 to app data directory
      const base64Data = this.uint8ArrayToBase64(encryptedData);
      await Filesystem.writeFile({
        path: `vault_storage/${ref}`,
        data: base64Data,
        directory: Directory.Data,
        recursive: true,
      });
    } else if (window.electronAPI) {
      // Electron Desktop: Send raw buffer via IPC
      await window.electronAPI.vaultEnsureDir();
      await window.electronAPI.vaultSaveFile(ref, encryptedData);
    } else {
      throw new Error('No compatible storage layer available.');
    }

    return {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      ref: ref,
      uploadedAt: Date.now(),
    };
  }

  /**
   * Reads an encrypted file from disk, decrypts it, and triggers a browser download.
   */
  async downloadFile(attachment: VaultAttachment, password: string): Promise<void> {
    let encryptedData: Uint8Array;

    if (Capacitor.isNativePlatform()) {
      // Read base64 from Capacitor
      const result = await Filesystem.readFile({
        path: `vault_storage/${attachment.ref}`,
        directory: Directory.Data,
      });
      // Handle Capacitor's string or Blob return type based on version
      const dataStr = typeof result.data === 'string' ? result.data : await (result.data as Blob).text();
      encryptedData = this.base64ToUint8Array(dataStr);
    } else if (window.electronAPI) {
      encryptedData = await window.electronAPI.vaultReadFile(attachment.ref);
    } else {
      throw new Error('No compatible storage layer available.');
    }

    // Decrypt (Auto-detects D-KASP vs Legacy)
    const decryptedData = await this.crypt.decryptBinaryAuto(encryptedData, password);

    // Create Blob and trigger download
    const blob = new Blob([decryptedData as unknown as BlobPart], { type: attachment.type });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Deletes the physical file from the vault storage.
   */
  async deleteFile(attachment: VaultAttachment): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Filesystem.deleteFile({
        path: `vault_storage/${attachment.ref}`,
        directory: Directory.Data,
      });
    } else if (window.electronAPI) {
      await window.electronAPI.vaultDeleteFile(attachment.ref);
    }
  }

  // Helper Utilities for Base64 <-> Uint8Array conversion (since Capacitor expects base64 strings for raw files)
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}
