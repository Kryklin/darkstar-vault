import { TestBed } from '@angular/core/testing';
import { CryptService } from './crypt';

describe('CryptService - Authenticated Streaming Container', () => {
  let service: CryptService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CryptService],
    });
    service = TestBed.inject(CryptService);

    // Mock window.electronAPI D-ARX delegation
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      dArxEncrypt: jasmine.createSpy('dArxEncrypt').and.callFake(async (payload: string) => {
        // Return simulated D-ARX ciphertext wrapper
        return JSON.stringify({ v: 2, cipher: btoa(payload) });
      }),
      dArxDecrypt: jasmine.createSpy('dArxDecrypt').and.callFake(async (encryptedDataRaw: string) => {
        const parsed = JSON.parse(encryptedDataRaw);
        return { decrypted: atob(parsed.cipher) };
      }),
    };
  });

  it('should encrypt and decrypt binary data correctly', async () => {
    const originalData = new Uint8Array([1, 2, 3, 4, 5, 42, 100, 255]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');
    expect(encrypted).toBeDefined();

    const decrypted = await service.decryptBinary(encrypted, 'test-key');
    expect(decrypted).toEqual(originalData);
  });

  it('should reject outer totalSize tampering', async () => {
    const originalData = new Uint8Array([10, 20, 30, 40, 50]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');

    // Parse container and tamper with totalSize
    const containerStr = new TextDecoder().decode(encrypted);
    const container = JSON.parse(containerStr);
    container.totalSize = 999; // Tampered!

    const tamperedPayload = new TextEncoder().encode(JSON.stringify(container));

    await expectAsync(service.decryptBinary(tamperedPayload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation.*tampering detected/);
  });

  it('should reject totalChunks tampering', async () => {
    const originalData = new Uint8Array([1, 2, 3]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');

    const containerStr = new TextDecoder().decode(encrypted);
    const container = JSON.parse(containerStr);
    container.totalChunks = 5; // Tampered!

    const tamperedPayload = new TextEncoder().encode(JSON.stringify(container));

    await expectAsync(service.decryptBinary(tamperedPayload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation.*expected 5 chunks/);
  });

  it('should reject chunk reordering/splicing tampering', async () => {
    // Generate data spanning multiple 16KB chunks
    const multiChunkData = new Uint8Array(35 * 1024);
    multiChunkData.fill(7);

    const encrypted = await service.encryptBinary(multiChunkData, 'test-key');
    const containerStr = new TextDecoder().decode(encrypted);
    const container = JSON.parse(containerStr);

    // Swap chunk 0 and chunk 1
    const tmp = container.chunks[0];
    container.chunks[0] = container.chunks[1];
    container.chunks[1] = tmp;

    const tamperedPayload = new TextEncoder().encode(JSON.stringify(container));

    await expectAsync(service.decryptBinary(tamperedPayload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation.*metadata tampering detected/);
  });
});
