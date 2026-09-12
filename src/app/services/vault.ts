import { Injectable, signal, inject, computed } from '@angular/core';
import { CryptService } from './crypt';
import { ml_kem1024 } from '@noble/post-quantum/ml-kem';
import { base64 } from '@scure/base';
import { VaultFileService } from './vault-file.service';
import { DuressService } from './duress.service';
import { BiometricService } from './biometric.service';
import { TimeLockMetadata } from './timelock.service';

export interface VaultAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  ref: string;
  uploadedAt: number;
}

// VaultFolder removed as per user request for flat structure

export interface VaultIdentity {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
  pqcPublicKey?: string;
  pqcPrivateKey?: string;
}

export interface VaultNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  attachments: VaultAttachment[];
  timeLock?: TimeLockMetadata;
  updatedAt: number;
}
interface VaultStorage {
  data: string;
  s?: boolean;
}

interface VaultContent {
  notes: VaultNote[];
  standaloneFiles?: VaultAttachment[];
  identity?: VaultIdentity;
  totpSecret?: string;
  updatedAt: number;
}

@Injectable({
  providedIn: 'root',
})
/**
 * Core vault management service.
 * Handles persistence, identity lifecycle, and D-ARX protocol integration.
 */
export class VaultService {
  private crypt = inject(CryptService);
  private fileService = inject(VaultFileService);
  private duressService = inject(DuressService);
  private biometricService = inject(BiometricService);
  private storageKey = 'darkstar_vault';

  private masterKey = signal<string | null>(null);
  public isUnlocked = computed(() => !!this.masterKey());
  public notes = signal<VaultNote[]>([]);
  public standaloneFiles = signal<VaultAttachment[]>([]);
  public identity = signal<VaultIdentity | null>(null);
  public totpSecret = signal<string | null>(null);
  public hardwareId = signal<string | null>(null);
  public isBiometricForced = signal<boolean>(localStorage.getItem('darkstar_force_biometrics') === 'true');
  public error = signal<string | null>(null);
  public exists = signal<boolean>(false);

  private totpPendingState: {
    notes: VaultNote[];
    identity: VaultIdentity | null;
    totpSecret: string;
    password: string;
  } | null = null;

  constructor() {
    window.addEventListener('beforeunload', () => this.lock());
    this.exists.set(this.hasVault());
    this.initHardwareId();
  }

  private async initHardwareId() {
    if (window.electronAPI) {
      const id = await window.electronAPI.getMachineId();
      this.hardwareId.set(id);
    }
  }

  hasVault(): boolean {
    return !!localStorage.getItem(this.storageKey);
  }

  async createVault(password: string): Promise<void> {
    try {
      this.masterKey.set(password);
      this.notes.set([]);
      const newIdentity = await this.generateIdentity();
      this.identity.set(newIdentity);
      await this.save();
      this.exists.set(true);
      this.error.set(null);
    } catch (e) {
      console.error('Vault Initialization Error:', e);
      this.error.set('Failed to initialize local vault storage.');
      throw e;
    }
  }

  async unlockWithBiometrics(): Promise<{ success: boolean; requiresTotp: boolean }> {
    if (!this.biometricService.isAvailable()) return { success: false, requiresTotp: false };
    const authenticated = await this.biometricService.authenticate();
    if (!authenticated) return { success: false, requiresTotp: false };

    try {
      const encryptedPass = localStorage.getItem('biometric_enc_pass');
      if (encryptedPass && window.electronAPI) {
        const password = await window.electronAPI.safeStorageDecrypt(encryptedPass);
        return await this.unlock(password);
      }
    } catch (e) {
      console.error('Biometric Unlock Failed:', e);
    }
    return { success: false, requiresTotp: false };
  }

  async unlockWithHardwareKey(): Promise<{ success: boolean; requiresTotp: boolean }> {
    if (!this.biometricService.isAvailable()) return { success: false, requiresTotp: false };
    const authenticated = await this.biometricService.authenticate();
    if (!authenticated) return { success: false, requiresTotp: false };

    try {
      const encryptedPass = localStorage.getItem('biometric_enc_pass');
      if (encryptedPass && window.electronAPI) {
        const password = await window.electronAPI.safeStorageDecrypt(encryptedPass);
        return await this.unlock(password);
      }
    } catch (e) {
      console.error('Hardware Key Unlock Failed:', e);
    }
    return { success: false, requiresTotp: false };
  }

  async unlock(password: string): Promise<{ success: boolean; requiresTotp: boolean }> {
    if (this.duressService.checkDuress(password)) {
      this.duressService.triggerDuress();
      return { success: false, requiresTotp: false };
    }

    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) throw new Error('No vault detected.');

      const envelope: VaultStorage = JSON.parse(raw);
      let encryptedData = envelope.data;

      if (envelope.s && window.electronAPI) {
        encryptedData = await window.electronAPI.safeStorageDecrypt(encryptedData);
      }

      const { skHex } = await this.derivePqcKeys(password);
      const res = await this.crypt.decrypt(encryptedData, '', skHex, this.hardwareId() || undefined);

      const jsonStr = res.decrypted;
      if (!jsonStr) throw new Error('Authentication failed.');

      let parsed: VaultContent;
      if (typeof jsonStr === 'object') {
        parsed = jsonStr as unknown as VaultContent;
      } else {
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          throw new Error('Vault Data Corruption: Unable to parse decrypted content.');
        }
      }
      const migratedNotes = (parsed.notes || []).map((n) => ({
        ...n,
        tags: n.tags || [],
        attachments: n.attachments || [],
        updatedAt: n.updatedAt || Date.now(),
      }));
      const migratedFiles = (parsed.standaloneFiles || []).map((f) => ({
        ...f,
        uploadedAt: f.uploadedAt || Date.now(),
      }));

      let identity = parsed.identity || null;
      if (!identity) {
        identity = await this.generateIdentity();
      } else if (!identity.pqcPublicKey) {
        const pqc = ml_kem1024.keygen();
        identity.pqcPublicKey = base64.encode(pqc.publicKey);
        identity.pqcPrivateKey = base64.encode(pqc.secretKey);
      }

      if (parsed.totpSecret) {
        this.totpPendingState = {
          notes: migratedNotes,
          identity: identity,
          totpSecret: parsed.totpSecret,
          password: password,
        };
        return { success: true, requiresTotp: true };
      }

      this.notes.set(migratedNotes);
      this.standaloneFiles.set(migratedFiles);
      this.identity.set(identity);
      this.totpSecret.set(parsed.totpSecret || null);
      this.masterKey.set(password);
      this.error.set(null);

      return { success: true, requiresTotp: false };
    } catch (e) {
      console.error('Vault Access Error:', e);
      this.lock();
      this.error.set('Authentication failed.');
      return { success: false, requiresTotp: false };
    }
  }

  async validateBackupPayload(backupData: string, passwordOverride?: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const envelope: VaultStorage = JSON.parse(backupData);
      if (!envelope || typeof envelope.data !== 'string' || envelope.data.trim().length === 0) {
        return { valid: false, error: 'Malformed backup envelope: missing encrypted data payload.' };
      }

      const keyToUse = passwordOverride || this.masterKey();
      if (!keyToUse) {
        return { valid: true };
      }

      let encryptedData = envelope.data;
      if (envelope.s && window.electronAPI) {
        encryptedData = await window.electronAPI.safeStorageDecrypt(encryptedData);
      }

      const { skHex } = await this.derivePqcKeys(keyToUse);
      const res = await this.crypt.decrypt(encryptedData, '', skHex, this.hardwareId() || undefined);
      const jsonStr = res.decrypted;
      if (!jsonStr) {
        return { valid: false, error: 'Cryptographic authentication failed: master key does not match backup ciphertext.' };
      }

      let parsed: VaultContent;
      if (typeof jsonStr === 'object') {
        parsed = jsonStr as unknown as VaultContent;
      } else {
        parsed = JSON.parse(jsonStr);
      }

      if (!parsed || (parsed.notes && !Array.isArray(parsed.notes))) {
        return { valid: false, error: 'Corrupt backup content: invalid notes structure in decrypted payload.' };
      }

      return { valid: true };
    } catch (e: unknown) {
      return { valid: false, error: `Cryptographic validation failed: ${(e as Error).message}` };
    }
  }

  // Biometric and Hardware Key Integration

  async registerBiometricsForSession(password: string): Promise<boolean> {
    return this.registerCredential(password, 'platform');
  }

  async registerHardwareKey(password: string): Promise<boolean> {
    return this.registerCredential(password, 'cross-platform');
  }

  private async registerCredential(password: string, type: 'platform' | 'cross-platform'): Promise<boolean> {
    const success = await this.biometricService.register(type);
    if (!success) return false;

    if (window.electronAPI) {
      const encPass = await window.electronAPI.safeStorageEncrypt(password);
      localStorage.setItem('biometric_enc_pass', encPass);
      return true;
    }
    return false;
  }

  async verifyTotp(token: string): Promise<boolean> {
    if (!this.totpPendingState) return false;
    const isValid = window.electronAPI ? await window.electronAPI.vaultVerifyTotp(token, this.totpPendingState.totpSecret) : false;
    if (!isValid) {
      this.error.set('Invalid 2FA token.');
      return false;
    }
    this.notes.set(this.totpPendingState.notes);
    this.identity.set(this.totpPendingState.identity);
    this.totpSecret.set(this.totpPendingState.totpSecret);
    this.masterKey.set(this.totpPendingState.password);
    this.totpPendingState = null;
    this.error.set(null);
    return true;
  }

  enableTotp(secret: string) {
    if (!this.masterKey()) throw new Error('Vault must be unlocked to modify 2FA settings.');
    this.totpSecret.set(secret);
    this.save();
  }

  disableTotp() {
    if (!this.masterKey()) throw new Error('Vault must be unlocked to modify 2FA settings.');
    this.totpSecret.set(null);
    this.save();
  }

  async save(): Promise<void> {
    const key = this.masterKey();
    if (!key) throw new Error('Vault locked');

    const content: VaultContent = {
      notes: this.notes(),
      standaloneFiles: this.standaloneFiles(),
      identity: this.identity()!,
      totpSecret: this.totpSecret() || undefined,
      updatedAt: Date.now(),
    };

    const { pkHex } = await this.derivePqcKeys(key);
    const { encryptedData } = await this.crypt.encrypt(JSON.stringify(content), pkHex, this.hardwareId() || undefined);

    const envelope: VaultStorage = {
      data: encryptedData,
      s: false,
    };

    localStorage.setItem(this.storageKey, JSON.stringify(envelope));
  }

  // --- Note Management ---

  addNote(title = '', content = ''): VaultNote {
    const newNote: VaultNote = {
      id: crypto.randomUUID(),
      title,
      content,
      tags: [],
      attachments: [],
      updatedAt: Date.now(),
    };
    this.notes.update((n) => [newNote, ...n]);
    this.save();
    return newNote;
  }

  updateNote(id: string, title: string, content: string, tags: string[], timeLock?: TimeLockMetadata) {
    this.notes.update((n) => n.map((note) => (note.id === id ? { ...note, title, content, tags, timeLock, updatedAt: Date.now() } : note)));
    this.save();
  }

  // --- Standalone File Management ---

  addStandaloneFile(attachment: VaultAttachment) {
    this.standaloneFiles.update((f) => [attachment, ...f]);
    this.save();
  }

  async deleteStandaloneFile(id: string) {
    const file = this.standaloneFiles().find((f) => f.id === id);
    if (file) {
      await this.fileService.deleteFile(file);
      this.standaloneFiles.update((f) => f.filter((item) => item.id !== id));
      this.save();
    }
  }

  addAttachment(noteId: string, attachment: VaultAttachment) {
    this.notes.update((n) => n.map((note) => (note.id === noteId ? { ...note, attachments: [...note.attachments, attachment], updatedAt: Date.now() } : note)));
    this.save();
  }

  removeAttachment(noteId: string, attachmentId: string) {
    this.notes.update((n) => n.map((note) => (note.id === noteId ? { ...note, attachments: note.attachments.filter((a) => a.id !== attachmentId), updatedAt: Date.now() } : note)));
    this.save();
  }

  async deleteNote(id: string) {
    const note = this.notes().find((n) => n.id === id);
    if (note && note.attachments) {
      for (const att of note.attachments) {
        try {
          await this.fileService.deleteFile(att);
        } catch (e) {
          console.error('Failed to delete attachment:', att.name, e);
        }
      }
    }
    this.notes.update((n) => n.filter((note) => note.id !== id));
    this.save();
  }

  deleteVault() {
    localStorage.removeItem(this.storageKey);
    this.setBiometricForce(false);
    localStorage.removeItem('biometric_credential_id');
    localStorage.removeItem('biometric_enc_pass');
    this.exists.set(false);
    this.lock();
  }

  async performMigration() {
    if (!this.masterKey()) return;
    await this.save();
  }

  private async derivePqcKeys(password: string): Promise<{ pkHex: string; skHex: string }> {
    const enc = new TextEncoder();
    const pBytes = enc.encode(password);
    const salt = enc.encode('darkstar-pqc-seed');

    const keyMaterial = await window.crypto.subtle.importKey('raw', pBytes, { name: 'PBKDF2' }, false, ['deriveBits']);

    const seed = await window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 512);

    const { publicKey, secretKey } = ml_kem1024.keygen(new Uint8Array(seed));

    return {
      pkHex: Array.from(publicKey)
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join(''),
      skHex: Array.from(secretKey)
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join(''),
    };
  }

  lock() {
    this.masterKey.set(null);
    this.notes.set([]);
    this.identity.set(null);
    this.totpSecret.set(null);
    this.totpPendingState = null;
  }

  // --- Helpers ---
  private async generateIdentity(): Promise<VaultIdentity> {
    const keyPair = await window.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const publicKey = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privateKey = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const pqc = ml_kem1024.keygen();
    return { publicKey, privateKey, pqcPublicKey: base64.encode(pqc.publicKey), pqcPrivateKey: base64.encode(pqc.secretKey) };
  }

  // --- Identity & Signatures ---

  public async getPublicKey(): Promise<JsonWebKey> {
    const id = this.identity();
    if (!id) throw new Error('Vault locked');
    return id.publicKey;
  }

  public exportIdentity(): string {
    const id = this.identity();
    if (!id) throw new Error('Vault locked');
    return JSON.stringify(id);
  }

  public async importIdentity(identityJson: string): Promise<boolean> {
    try {
      const parsed: VaultIdentity = JSON.parse(identityJson);
      if (parsed && parsed.publicKey && parsed.privateKey) {
        this.identity.set(parsed);
        await this.save();
        return true;
      }
    } catch (e) {
      console.error('Failed to parse identity JSON', e);
    }
    return false;
  }

  public async signMessage(message: string): Promise<string> {
    const id = this.identity();
    if (!id) throw new Error('Vault locked');

    const privateKey = await window.crypto.subtle.importKey('jwk', id.privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

    const enc = new TextEncoder();
    const signature = await window.crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      privateKey,
      enc.encode(message),
    );

    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  public async verifyResult(message: string, signatureHex: string, publicKey: JsonWebKey): Promise<boolean> {
    try {
      const key = await window.crypto.subtle.importKey('jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);

      const enc = new TextEncoder();
      const sigBytes = new Uint8Array(signatureHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

      return await window.crypto.subtle.verify(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' },
        },
        key,
        sigBytes,
        enc.encode(message),
      );
    } catch (e) {
      console.error('Signature Verification Failed:', e);
      return false;
    }
  }

  setBiometricForce(enabled: boolean) {
    this.isBiometricForced.set(enabled);
    localStorage.setItem('darkstar_force_biometrics', enabled.toString());
  }

  getMasterKey(): string {
    const key = this.masterKey();
    if (!key) throw new Error('Vault is locked');
    return key;
  }

  async getHardwareId(): Promise<string | null> {
    const cached = this.hardwareId();
    if (cached) return cached;
    if (window.electronAPI?.getMachineId) {
      const id = await window.electronAPI.getMachineId();
      if (id) {
        this.hardwareId.set(id);
        return id;
      }
    }
    return null;
  }
}
