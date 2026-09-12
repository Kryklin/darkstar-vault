import { TestBed } from '@angular/core/testing';
import { CryptService } from './crypt';

describe('CryptService', () => {
  let service: CryptService;
  const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const testPassword = 'mysecretpassword';
  let mockWin: { electronAPI: { dAsPEncrypt: jasmine.Spy; dAsPDecrypt: jasmine.Spy } };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CryptService],
    });
    service = TestBed.inject(CryptService);

    // Mock Electron API
    const mockElectron = {
      dAsPEncrypt: jasmine.createSpy('dAsPEncrypt').and.resolveTo('mock-encrypted-data'),
      dAsPDecrypt: jasmine.createSpy('dAsPDecrypt').and.resolveTo(testMnemonic),
    };
    mockWin = window as unknown as { electronAPI: typeof mockElectron };
    mockWin.electronAPI = mockElectron;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('D-ASP Protocol Logic', () => {
    it('should call Electron IPC for encryption', async () => {
      const result = await service.encrypt(testMnemonic, 'test-pk');

      expect(mockWin.electronAPI.dAsPEncrypt).toHaveBeenCalledWith(testMnemonic, 'test-pk', jasmine.any(String), undefined);
      expect(result.encryptedData).toBe('mock-encrypted-data');
    });

    it('should call Electron IPC for decryption', async () => {
      const encryptedData = 'mock-encrypted-data';
      const result = await service.decrypt(encryptedData, '', testPassword);

      expect(mockWin.electronAPI.dAsPDecrypt).toHaveBeenCalledWith(encryptedData, '', testPassword, jasmine.any(String), undefined);
      expect(result.decrypted).toBe(testMnemonic);
    });
  });

  describe('Internal AES-GCM Helpers', () => {
    const plainText = 'Hello Darkstar';
    const password = 'pass';
    const iterations = 1000;

    it('should encrypt and decrypt using AES-256-GCM (async)', async () => {
      const encrypted = await service.encryptAES256GCMAsync(plainText, password, iterations);
      const decrypted = await service.decryptAES256GCMAsync(encrypted, password, iterations);
      expect(decrypted).toBe(plainText);
    });
  });

  describe('Binary D-ASP Helpers', () => {
    it('should encrypt and decrypt Uint8Array data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const password = 'binary-pass';

      const encrypted = await service.encryptBinaryDAsP(data, password);
      const decrypted = await service.decryptBinary(encrypted, password);

      expect(decrypted).toEqual(data);
    });
  });
});
