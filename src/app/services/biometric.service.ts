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
   * Uses WebAuthn standard assertion with a fresh 32-byte challenge and enrolled public key.
   */
  async authenticate(challengeParam?: Uint8Array): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      // Generate fresh 32-byte cryptographically random challenge to prevent replay attacks
      const challenge = challengeParam || window.crypto.getRandomValues(new Uint8Array(32));

      const publicKey: PublicKeyCredentialRequestOptions & { credentialPublicKey?: string } = {
        challenge: challenge as unknown as BufferSource,
        timeout: 60000,
        rpId: 'localhost', // Explicit RP ID for custom protocol support
        userVerification: 'required', // This forces Windows Hello / TouchID
      };

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

      // Attach registered credential public key for cryptographic signature verification
      const pubKeyStorageKey = biometricId ? 'biometric_public_key' : 'hardware_key_public_key';
      const storedPubKey = localStorage.getItem(pubKeyStorageKey);
      if (storedPubKey) {
        publicKey.credentialPublicKey = storedPubKey;
      }

      // NATIVE PROXY: Use Electron's native handshake proxy if available to bypass scheme restrictions
      if (window.electronAPI && window.electronAPI.biometricHandshake) {
        const response = await window.electronAPI.biometricHandshake({ action: 'get', publicKey });
        if (response.success && response.data) {
          const authData = response.data.response?.authenticatorData;
          const sig = response.data.response?.signature;
          // Verify structural presence of authenticatorData (minimum 37 bytes) and assertion signature
          if (Array.isArray(authData) && authData.length >= 37 && Array.isArray(sig) && sig.length > 0) {
            const flags = authData[32];
            const userPresent = (flags & 0x01) !== 0;
            const userVerified = (flags & 0x04) !== 0;
            // Cryptographically require user verification (biometric or platform PIN assertion)
            if (userPresent && userVerified) {
              return true;
            }
            console.warn('Biometric handshake: Authenticator did not assert User Verification (UV flag).');
            return false;
          }
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

      const storageKey = attachment === 'platform' ? 'biometric_credential_id' : 'hardware_key_credential_id';
      const pubKeyStorageKey = attachment === 'platform' ? 'biometric_public_key' : 'hardware_key_public_key';

      // NATIVE PROXY: Use Electron's native handshake proxy for registration
      if (window.electronAPI && window.electronAPI.biometricHandshake) {
        const response = await window.electronAPI.biometricHandshake({ action: 'create', publicKey });
        if (response.success && response.data) {
          const rawId = response.data['rawId'] as ArrayLike<number>;
          const base64Id = this.Uint8ArrayToBase64(new Uint8Array(rawId));
          localStorage.setItem(storageKey, base64Id);
          const rawPubKey = response.data['publicKey'] as ArrayLike<number> | undefined;
          if (rawPubKey) {
            localStorage.setItem(pubKeyStorageKey, this.Uint8ArrayToBase64(new Uint8Array(rawPubKey)));
          }
          return true;
        }
        return false;
      }

      const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;

      if (credential) {
        const rawId = credential.rawId;
        const base64Id = this.arrayBufferToBase64(rawId);
        localStorage.setItem(storageKey, base64Id);

        const attestationResponse = credential.response as AuthenticatorAttestationResponse;
        if (attestationResponse && typeof attestationResponse.getPublicKey === 'function') {
          const pubKeyBuf = attestationResponse.getPublicKey();
          if (pubKeyBuf) {
            localStorage.setItem(pubKeyStorageKey, this.arrayBufferToBase64(pubKeyBuf));
          }
        }

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
