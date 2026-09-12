import { TestBed } from '@angular/core/testing';
import { SteganographyService } from './steganography.service';
import { StealthMode } from './generators/types';

describe('SteganographyService', () => {
  let service: SteganographyService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SteganographyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  const payload = 'TEST_PAYLOAD_123';

  it('should transmute and extract LOG mode', () => {
    const result = service.transmute(payload, StealthMode.LOG, { noiseLevel: 0.1 });
    expect(result).toContain('[NET-SEC]');
    expect(result).toContain(payload); // Actually it might be chunked
    const extracted = service.extract(result, StealthMode.LOG);
    expect(extracted).toBe(payload);
  });

  // Basic checks for the other stubs
  it('should transmute and extract CSV mode', () => {
    const result = service.transmute(payload, StealthMode.CSV, { noiseLevel: 0.1 });
    const extracted = service.extract(result, StealthMode.CSV);
    expect(extracted).toBe(payload);
  });

  it('should transmute and extract JSON mode', () => {
    const result = service.transmute(payload, StealthMode.JSON, { noiseLevel: 0.1 });
    const extracted = service.extract(result, StealthMode.JSON);
    expect(extracted).toBe(payload);
  });
});
