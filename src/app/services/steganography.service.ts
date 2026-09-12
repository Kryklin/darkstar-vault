import { Injectable } from '@angular/core';
import { StealthMode, StealthOptions, StegoGenerator, LogGenerator, CsvGenerator, JsonGenerator } from './generators';
import { AudioGenerator } from './generators/audio.generator';
import { TextGenerator } from './generators/text.generator';

@Injectable({
  providedIn: 'root',
})
export class SteganographyService {
  private generators: Map<StealthMode, StegoGenerator> = new Map<StealthMode, StegoGenerator>();

  constructor() {
    this.generators.set(StealthMode.LOG, new LogGenerator());
    this.generators.set(StealthMode.CSV, new CsvGenerator());
    this.generators.set(StealthMode.JSON, new JsonGenerator());
    this.generators.set(StealthMode.AUDIO, new AudioGenerator());
    this.generators.set(StealthMode.TEXT, new TextGenerator());
  }

  public transmute(data: string, mode: StealthMode, options: StealthOptions): string {
    const generator = this.generators.get(mode);
    if (!generator) {
      throw new Error(`Generator for mode ${mode} not implemented or not found.`);
    }
    return generator.generate(data, options);
  }

  public extract(fileContent: string, mode: StealthMode): string {
    const generator = this.generators.get(mode);
    if (!generator) {
      throw new Error(`Generator for mode ${mode} not implemented or not found.`);
    }
    return generator.extract(fileContent);
  }

  /**
   * Detects the stealth mode used in a file based on its extension or content.
   *
   * @param filename The name of the file.
   * @param content The content of the file (unused in current implementation but reserved for content sniffing).
   * @returns The detected StealthMode or null if detection fails.
   */
  public detectMode(filename: string, content: string): StealthMode | null {
    // Basic validation to ensure content is present
    if (!content) return null;

    if (filename.endsWith('.log')) return StealthMode.LOG;
    if (filename.endsWith('.csv')) return StealthMode.CSV;
    if (filename.endsWith('.json')) return StealthMode.JSON;
    if (filename.endsWith('.png')) return StealthMode.IMAGE;
    if (filename.endsWith('.wav')) return StealthMode.AUDIO;
    if (filename.endsWith('.txt')) return StealthMode.TEXT;
    return null;
  }

  /**
   * Embeds a string payload into an image using LSB steganography.
   * @param payload The encrypted string to hide.
   * @param coverImage The original image file to use as cover.
   * @returns A Promise resolving to a generic Blob of the engineered PNG.
   */
  public hideInImage(payload: string, coverImage: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas context not supported'));

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;

          // Convert payload to binary string
          // Prefix with length (32-bit integer) to know how much to read back
          const binaryPayload = this.stringToBinary(payload);
          const lengthBinary = payload.length.toString(2).padStart(32, '0');
          const fullBinary = lengthBinary + binaryPayload;

          if (fullBinary.length > data.length * 3) {
            // 3 channels (RGB) per pixel avail for LSB (ignoring Alpha for safety/visibility)
            // simplified check: utilizing R, G, B channels
            return reject(new Error('Payload too large for this image'));
          }

          let dataIndex = 0;
          for (let i = 0; i < data.length; i += 4) {
            // Modify R, G, B channels
            for (let j = 0; j < 3; j++) {
              if (dataIndex < fullBinary.length) {
                // Clear LSB and set it to bit from payload
                data[i + j] = (data[i + j] & ~1) | parseInt(fullBinary[dataIndex], 10);
                dataIndex++;
              }
            }
          }

          ctx.putImageData(imgData, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Blob creation failed'));
          }, 'image/png');
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(coverImage);
    });
  }

  /**
   * Extracts a string payload from an image using LSB steganography.
   * @param imageFile The steganographic image file.
   * @returns A Promise resolving to the hidden string.
   */
  public revealFromImage(imageFile: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas context not supported'));

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;

          let binaryString = '';

          // First, read 32 bits for length
          let length = 0;
          let lengthBinary = '';

          // Read all LSBs
          // Optimization: This reads EVERYTHING, which is slow for huge images.
          // Better: Read 32 bits first, parse length, then read exactly that amount.

          let state = 'LENGTH'; // 'LENGTH' | 'DATA'
          let payloadBitsNeeded = 0;

          for (let i = 0; i < data.length; i += 4) {
            for (let j = 0; j < 3; j++) {
              const bit = data[i + j] & 1;

              if (state === 'LENGTH') {
                lengthBinary += bit;
                if (lengthBinary.length === 32) {
                  length = parseInt(lengthBinary, 2);
                  state = 'DATA';
                  payloadBitsNeeded = length * 8; // 8 bits per char
                  if (length === 0 || isNaN(length)) {
                    // Potentially invalid or empty
                    return resolve('');
                  }
                }
              } else if (state === 'DATA') {
                binaryString += bit;
                if (binaryString.length === payloadBitsNeeded) {
                  // Done
                  return resolve(this.binaryToString(binaryString));
                }
              }
            }
            if (state === 'DATA' && binaryString.length === payloadBitsNeeded) break;
          }

          // If we fall through without resolving, data might be corrupted or image too small for claimed length
          reject(new Error('Failed to extract data: End of image reached improperly'));
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(imageFile);
    });
  }

  private stringToBinary(str: string): string {
    return str
      .split('')
      .map((char) => {
        return char.charCodeAt(0).toString(2).padStart(8, '0');
      })
      .join('');
  }

  private binaryToString(binary: string): string {
    const bytes = binary.match(/.{1,8}/g) || [];
    return bytes.map((byte) => String.fromCharCode(parseInt(byte, 2))).join('');
  }
}
