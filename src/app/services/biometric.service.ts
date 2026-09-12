import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class BiometricService {
  isAvailable = signal(false);

  constructor() {
    this.checkAvailability();
  }

  async checkAvailability() {
    if (!window.PublicKeyCredential) {
      this.isAvailable.set(false);
      return;
    }

    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      this.isAvailable.set(available);
    } catch (e) {
      console.error('Biometric availability check failed:', e);
      this.isAvailable.set(false);
    }
  }

  getDeviceAuthName(): string {
    if (!window.electronAPI) return 'Biometric Unlock';
    const platform = window.electronAPI.getPlatform();
    if (platform === 'win32') return 'Windows Hello';
    if (platform === 'darwin') return 'Touch ID / Face ID';
    return 'Biometric Unlock';
  }

  /**
   * Prompts the user for biometric authentication (Windows Hello / TouchID).
   * Uses WebAuthn "Conditional UI" or standard assertion if possible.
   * Note: For standard unlock, we mostly care about "User Verification".
   */
  async authenticate(challengeStr = 'darkstar-auth'): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      // Challenge must be a buffer
      const challenge = Uint8Array.from(challengeStr, (c) => c.charCodeAt(0));

      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge,
        timeout: 60000,
        rpId: 'localhost', // Explicit RP ID for custom protocol support
        userVerification: 'required', // This forces Windows Hello / TouchID
        // We allow any credential since we are just checking for presence/verification
        // proof of the current platform user, not necessarily a specific registered key
        // (unless we implement full registration flow).
        // For simple local app unlock, often just proving UV (User Verified) is treated as success
        // if the OS enforces it.
      };

      // NOTE: In a real "Hardware Key" flow we would match against registered IDs.
      // For "Windows Hello" local unlock without backend, we typically need to register a credential first
      // to reuse it. However, to keep it simple for v1, we attempting a generic check.
      // BUT: WebAuthn require allowCredentials to be empty only for discoverable credentials.

      // Let's rely on a simplified 'verifyUser' approach if we can, or we implement full registration.
      // For now, let's assume we need to Register first.
      // So we will add a register method.

      // To strictly answer "Unlock", we usually need a stored credential ID.
      // Let's try to find one.
      // To strictly answer "Unlock", we usually need a stored credential ID.
      // Let's try to find one.
      const biometricId = localStorage.getItem('biometric_credential_id');
      const hardwareId = localStorage.getItem('hardware_key_credential_id');

      const allowScientificCredentials: PublicKeyCredentialDescriptor[] = [];

      if (biometricId) {
        allowScientificCredentials.push({
          id: this.base64ToUint8Array(biometricId) as BufferSource,
          type: 'public-key',
          transports: ['internal'],
        });
      }
      if (hardwareId) {
        allowScientificCredentials.push({
          id: this.base64ToUint8Array(hardwareId) as BufferSource,
          type: 'public-key',
          transports: ['usb', 'nfc', 'ble'],
        });
      }

      if (allowScientificCredentials.length > 0) {
        publicKey.allowCredentials = allowScientificCredentials;
      } else {
        return false;
      }

      // NATIVE PROXY: Use Electron's native handshake proxy if available to bypass scheme restrictions
      if (window.electronAPI && window.electronAPI.biometricHandshake) {
        const response = await window.electronAPI.biometricHandshake({ action: 'get', publicKey });
        if (response.success && response.data) {
          return true; // Simplified: assertion exists
        }
        return false;
      }

      const assertion = await navigator.credentials.get({ publicKey });
      return !!assertion;
    } catch (e) {
      console.warn('Biometric authentication failed or cancelled:', e);
      return false;
    }
  }

  async register(attachment: 'platform' | 'cross-platform' = 'platform'): Promise<boolean> {
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(userId);

      const publicKey: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: 'Darkstar Secure App',
          id: 'localhost', // Explicit RP ID
        },
        user: {
          id: userId,
          name: 'owner',
          displayName: 'Darkstar Owner',
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }], // ES256
        authenticatorSelection: {
          authenticatorAttachment: attachment,
          userVerification: 'required',
        },
        timeout: 60000,
      };

      // NATIVE PROXY: Use Electron's native handshake proxy for registration
      if (window.electronAPI && window.electronAPI.biometricHandshake) {
        const response = await window.electronAPI.biometricHandshake({ action: 'create', publicKey });
        if (response.success && response.data) {
          const base64Id = this.Uint8ArrayToBase64(new Uint8Array(response.data.rawId));
          const storageKey = attachment === 'platform' ? 'biometric_credential_id' : 'hardware_key_credential_id';
          localStorage.setItem(storageKey, base64Id);
          return true;
        }
        return false;
      }

      const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;

      if (credential) {
        const rawId = credential.rawId;
        const base64Id = this.arrayBufferToBase64(rawId);

        const storageKey = attachment === 'platform' ? 'biometric_credential_id' : 'hardware_key_credential_id';
        localStorage.setItem(storageKey, base64Id);

        return true;
      }
      return false;
    } catch (e) {
      console.error('Biometric/Hardware registration failed:', e);
      return false;
    }
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    return this.Uint8ArrayToBase64(new Uint8Array(buffer));
  }

  private Uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
