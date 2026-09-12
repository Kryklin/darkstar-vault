import { TestBed } from '@angular/core/testing';
import { CryptService } from './crypt';

describe('CryptService - Authenticated Streaming & Legacy Container Security', () => {
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

  it('should encrypt and decrypt binary data correctly using v2 container', async () => {
    const originalData = new Uint8Array([1, 2, 3, 4, 5, 42, 100, 255]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');
    expect(encrypted).toBeDefined();

    const decrypted = await service.decryptBinary(encrypted, 'test-key');
    expect(decrypted).toEqual(originalData);
  });

  it('should reject outer totalSize tampering in v2 container', async () => {
    const originalData = new Uint8Array([10, 20, 30, 40, 50]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');

    const containerStr = new TextDecoder().decode(encrypted);
    const container = JSON.parse(containerStr);
    container.totalSize = 999; // Tampered totalSize!

    const tamperedPayload = new TextEncoder().encode(JSON.stringify(container));

    await expectAsync(service.decryptBinary(tamperedPayload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation.*tampering detected/);
  });

  it('should reject outer chunkSize tampering in v2 container', async () => {
    const originalData = new Uint8Array([10, 20, 30, 40, 50]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');

    const containerStr = new TextDecoder().decode(encrypted);
    const container = JSON.parse(containerStr);
    container.chunkSize = 8192; // Tampered chunkSize!

    const tamperedPayload = new TextEncoder().encode(JSON.stringify(container));

    await expectAsync(service.decryptBinary(tamperedPayload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation.*tampering detected/);
  });

  it('should reject totalChunks tampering in v2 container', async () => {
    const originalData = new Uint8Array([1, 2, 3]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');

    const containerStr = new TextDecoder().decode(encrypted);
    const container = JSON.parse(containerStr);
    container.totalChunks = 5; // Tampered totalChunks!

    const tamperedPayload = new TextEncoder().encode(JSON.stringify(container));

    await expectAsync(service.decryptBinary(tamperedPayload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation.*(expected 5 chunks|does not match totalChunks \(5\))/);
  });

  it('should reject streamId tampering in v2 container', async () => {
    const originalData = new Uint8Array([1, 2, 3, 4, 5]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');

    const containerStr = new TextDecoder().decode(encrypted);
    const container = JSON.parse(containerStr);
    container.streamId = '0123456789abcdef0123456789abcdef'; // Tampered streamId with valid 32-hex format

    const tamperedPayload = new TextEncoder().encode(JSON.stringify(container));

    await expectAsync(service.decryptBinary(tamperedPayload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation.*metadata tampering detected/);
  });

  it('should reject chunk reordering tampering in v2 container', async () => {
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

  it('should reject chunk deletion tampering in v2 container', async () => {
    const multiChunkData = new Uint8Array(35 * 1024);
    multiChunkData.fill(9);

    const encrypted = await service.encryptBinary(multiChunkData, 'test-key');
    const containerStr = new TextDecoder().decode(encrypted);
    const container = JSON.parse(containerStr);

    // Delete chunk 1
    container.chunks.splice(1, 1);

    const tamperedPayload = new TextEncoder().encode(JSON.stringify(container));

    // When totalChunks in outer container is not updated, chunks.length mismatch is caught
    await expectAsync(service.decryptBinary(tamperedPayload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation.*(expected \d+ chunks, found \d+|does not match totalChunks)/);

    // Even if attacker updates outer totalChunks to match, inner chunk count authentication catches it
    container.totalChunks = container.chunks.length;
    const tamperedPayload2 = new TextEncoder().encode(JSON.stringify(container));
    await expectAsync(service.decryptBinary(tamperedPayload2, 'test-key')).toBeRejectedWithError(/Streaming integrity violation.*metadata tampering detected/);
  });

  it('should reject chunk duplication tampering in v2 container', async () => {
    const multiChunkData = new Uint8Array(35 * 1024);
    multiChunkData.fill(3);

    const encrypted = await service.encryptBinary(multiChunkData, 'test-key');
    const containerStr = new TextDecoder().decode(encrypted);
    const container = JSON.parse(containerStr);

    // Duplicate chunk 0 at chunk 1 position
    container.chunks[1] = container.chunks[0];

    const tamperedPayload = new TextEncoder().encode(JSON.stringify(container));

    await expectAsync(service.decryptBinary(tamperedPayload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation.*metadata tampering detected/);
  });

  it('should reject legacy v1 containers (backward compatibility dropped)', async () => {
    const slice1 = 'Legacy v1 test ';
    const slice2 = 'payload spanning chunks';
    const enc1 = await service.encrypt(btoa(slice1), 'test-key');
    const enc2 = await service.encrypt(btoa(slice2), 'test-key');

    const v1Container = {
      dArxChunked: true,
      chunks: [enc1.encryptedData, enc2.encryptedData],
    };

    const v1Payload = new TextEncoder().encode(JSON.stringify(v1Container));
    await expectAsync(service.decryptBinary(v1Payload, 'test-key')).toBeRejectedWithError(
      /Streaming integrity violation: legacy unauthenticated v1 streaming format \(dArxChunked\) is deprecated and unsupported/,
    );
  });

  it('should reject non-container raw data without falling through to single-blob decryption', async () => {
    const rawData = new Uint8Array([10, 20, 30, 40, 50]);
    await expectAsync(service.decryptBinary(rawData, 'test-key')).toBeRejectedWithError(/Streaming integrity violation: payload is not a valid container JSON/);
  });

  it('should reject invalid or unrecognized container formats', async () => {
    const unrecognizedContainer = {
      magic: 'UNKNOWN-CONTAINER',
      version: 1,
      payload: 'xyz',
    };
    const payload = new TextEncoder().encode(JSON.stringify(unrecognizedContainer));
    await expectAsync(service.decryptBinary(payload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation: invalid or unauthenticated container/);
  });

  it('should reject malformed or non-hex streamId', async () => {
    const originalData = new Uint8Array([1, 2, 3]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');
    const container = JSON.parse(new TextDecoder().decode(encrypted));

    container.streamId = 'not-valid-hex-length-too-short';
    const payload = new TextEncoder().encode(JSON.stringify(container));
    await expectAsync(service.decryptBinary(payload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation: invalid streamId format/);
  });

  it('should reject non-integer, negative, or overflowing totalChunks (adversarial)', async () => {
    const originalData = new Uint8Array([1, 2, 3]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');
    const container = JSON.parse(new TextDecoder().decode(encrypted));

    // Non-integer totalChunks
    container.totalChunks = 1.5;
    let payload = new TextEncoder().encode(JSON.stringify(container));
    await expectAsync(service.decryptBinary(payload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation: invalid or out-of-bounds totalChunks/);

    // Negative totalChunks
    container.totalChunks = -1;
    payload = new TextEncoder().encode(JSON.stringify(container));
    await expectAsync(service.decryptBinary(payload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation: invalid or out-of-bounds totalChunks/);

    // Overflowing totalChunks
    container.totalChunks = 2_000_000;
    payload = new TextEncoder().encode(JSON.stringify(container));
    await expectAsync(service.decryptBinary(payload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation: invalid or out-of-bounds totalChunks/);
  });

  it('should reject non-integer, negative, or overflowing totalSize (adversarial)', async () => {
    const originalData = new Uint8Array([1, 2, 3]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');
    const container = JSON.parse(new TextDecoder().decode(encrypted));

    // Negative totalSize
    container.totalSize = -100;
    let payload = new TextEncoder().encode(JSON.stringify(container));
    await expectAsync(service.decryptBinary(payload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation: invalid or out-of-bounds totalSize/);

    // Overflowing totalSize (>10GB)
    container.totalSize = 11 * 1024 * 1024 * 1024;
    payload = new TextEncoder().encode(JSON.stringify(container));
    await expectAsync(service.decryptBinary(payload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation: invalid or out-of-bounds totalSize/);
  });

  it('should reject non-integer or out-of-bounds chunkSize (adversarial)', async () => {
    const originalData = new Uint8Array([1, 2, 3]);
    const encrypted = await service.encryptBinary(originalData, 'test-key');
    const container = JSON.parse(new TextDecoder().decode(encrypted));

    // Zero chunkSize
    container.chunkSize = 0;
    let payload = new TextEncoder().encode(JSON.stringify(container));
    await expectAsync(service.decryptBinary(payload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation: invalid or out-of-bounds chunkSize/);

    // Overflowing chunkSize (>64MB)
    container.chunkSize = 100 * 1024 * 1024;
    payload = new TextEncoder().encode(JSON.stringify(container));
    await expectAsync(service.decryptBinary(payload, 'test-key')).toBeRejectedWithError(/Streaming integrity violation: invalid or out-of-bounds chunkSize/);
  });
});
