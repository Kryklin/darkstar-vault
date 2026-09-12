import { StegoGenerator, StealthOptions } from './types';

/**
 * AudioGenerator (WAV LSB)
 * Hides data in the Least Significant Bits of a WAV file's PCM data.
 * Note: This requires a browser-compatible approach to handle binary Blobs/Arrays not strings.
 * However, the interface expects strings (Base64). We'll assume input/output are Base64 encoded WAVs.
 */
export class AudioGenerator implements StegoGenerator {
  /**
   * Generates a new WAV file with embedded payload.
   * @param payload Encrypted string (will be converted to binary).
   * @param options Contains the 'cover' audio (must be passed as Base64 in custom options or we generate noise).
   * For this V2 implementation, we will generate WHITE NOISE if no cover is provided,
   * or inject into provided Base64 WAV data.
   */
  generate(payload: string, options: StealthOptions): string {
    // 1. Prepare Payload (Binary)
    const binaryPayload = this.stringToBinary(payload);
    const lengthBinary = payload.length.toString(2).padStart(32, '0');
    const fullBinary = lengthBinary + binaryPayload;

    // 2. Prepare Buffer
    let buffer: DataView;
    const sampleRate = 44100;
    const bitsPerSample = 16;
    let totalSamples = 0;
    let offset = 44;

    if (options.coverFile) {
      // Use provided cover
      const coverView = new DataView(options.coverFile);
      // Verify Header
      const riff = this.readString(coverView, 0, 4);
      if (riff !== 'RIFF') throw new Error('Invalid WAV cover file');

      // Copy cover to new buffer (mutable)
      // We clone it to avoid mutating original source reference if reused
      const tmp = new Uint8Array(options.coverFile.byteLength);
      tmp.set(new Uint8Array(options.coverFile as unknown as ArrayBuffer));
      buffer = new DataView(tmp.buffer);

      // Parse existing size
      const subchunk2Size = coverView.getUint32(40, true);
      totalSamples = subchunk2Size / 2;
    } else {
      // Generate White Noise Buffer
      // Sample calc...
      // 1 bit per sample (LSB)
      const requiredSamples = fullBinary.length;
      const minSamples = sampleRate * 1; // Minimum 1 second
      totalSamples = Math.max(requiredSamples + 1000, minSamples);

      buffer = new DataView(new ArrayBuffer(44 + totalSamples * 2));

      // 3. Write WAV Header (Fresh)
      this.writeString(buffer, 0, 'RIFF');
      buffer.setUint32(4, 36 + totalSamples * 2, true); // ChunkSize
      this.writeString(buffer, 8, 'WAVE');
      this.writeString(buffer, 12, 'fmt ');
      buffer.setUint32(16, 16, true); // Subchunk1Size
      buffer.setUint16(20, 1, true); // AudioFormat (PCM)
      buffer.setUint16(22, 1, true); // NumChannels (Mono)
      buffer.setUint32(24, sampleRate, true); // SampleRate
      buffer.setUint32(28, sampleRate * 2, true); // ByteRate
      buffer.setUint16(32, 2, true); // BlockAlign
      buffer.setUint16(34, bitsPerSample, true); // BitsPerSample
      this.writeString(buffer, 36, 'data');
      buffer.setUint32(40, totalSamples * 2, true); // Subchunk2Size
    }

    // 4. Write Data
    // ...
    // If cover, we just overwrite LSBs. If noise, we gen noise then overwrite.

    // Check capacity
    if (fullBinary.length > totalSamples) {
      throw new Error(`Payload too large for cover audio. Need ${fullBinary.length} samples, have ${totalSamples}.`);
    }

    // 4. Write Data (Noise + LSB)
    // Scale noise based on noiseLevel (default 0.1 if missing/invalid logic, but type says number)
    // Max amplitude for 16-bit is ~32767.
    // noiseLevel 1.0 -> full loudness (very loud).
    // noiseLevel 0.1 -> ~3000 amplitude (reasonable background hiss).
    const amplitude = Math.floor(32767 * (options.noiseLevel || 0.1));

    for (let i = 0; i < totalSamples; i++) {
      let sample = 0;

      if (options.coverFile) {
        // Read existing sample
        sample = buffer.getInt16(offset, true);
      } else {
        // Generate random 16-bit noise
        sample = Math.floor(Math.random() * (amplitude * 2) - amplitude);
      }

      // Inject LSB
      if (i < fullBinary.length) {
        const bit = parseInt(fullBinary[i], 10);
        // Clear LSB then set it
        sample = (sample & ~1) | bit;
      }

      buffer.setInt16(offset, sample, true);
      offset += 2;
    }

    // 5. Return as Base64
    return this.arrayBufferToBase64(buffer.buffer);
  }

  extract(content: string): string {
    // 1. Decode Base64 to ArrayBuffer
    const buffer = this.base64ToArrayBuffer(content);
    const view = new DataView(buffer);

    // 2. Basic WAV Validation
    const riff = this.readString(view, 0, 4);
    if (riff !== 'RIFF') throw new Error('Invalid WAV header');

    // 3. Extract Payload
    let offset = 44;
    const totalSamples = (view.byteLength - 44) / 2;

    let length = 0;
    let lengthBinary = '';
    let binaryString = '';
    let state = 'LENGTH'; // 'LENGTH' | 'DATA'
    let payloadBitsNeeded = 0;

    for (let i = 0; i < totalSamples; i++) {
      const sample = view.getInt16(offset, true);
      const bit = sample & 1;
      offset += 2;

      if (state === 'LENGTH') {
        lengthBinary += bit;
        if (lengthBinary.length === 32) {
          length = parseInt(lengthBinary, 2);
          state = 'DATA';
          payloadBitsNeeded = length * 8;
          if (length === 0 || isNaN(length)) return '';
        }
      } else if (state === 'DATA') {
        binaryString += bit;
        if (binaryString.length === payloadBitsNeeded) {
          return this.binaryToString(binaryString);
        }
      }
    }

    return '';
  }

  // --- Helpers ---

  private writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  private readString(view: DataView, offset: number, length: number): string {
    let str = '';
    for (let i = 0; i < length; i++) {
      str += String.fromCharCode(view.getUint8(offset + i));
    }
    return str;
  }

  private stringToBinary(str: string): string {
    let result = '';
    for (let i = 0; i < str.length; i++) {
      result += str.charCodeAt(i).toString(2).padStart(8, '0');
    }
    return result;
  }

  private binaryToString(binary: string): string {
    const bytes = binary.match(/.{1,8}/g) || [];
    return bytes.map((byte) => String.fromCharCode(parseInt(byte, 2))).join('');
  }

  private arrayBufferToBase64(buffer: ArrayBufferLike): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
