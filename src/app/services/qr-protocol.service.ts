import { Injectable } from '@angular/core';
import * as QRCode from 'qrcode';

export interface QrChunk {
  index: number;
  total: number;
  data: string;
}

@Injectable({
  providedIn: 'root',
})
export class QrProtocolService {
  // Max alphanumeric characters per QR code for good scanning reliability on screens
  private readonly CHUNK_SIZE = 250;

  /**
   * Splits a raw string payload into an array of base64 data URLs representing QR codes.
   */
  public async generateQrChunks(payload: string): Promise<string[]> {
    const chunks: string[] = [];
    const totalChunks = Math.ceil(payload.length / this.CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = start + this.CHUNK_SIZE;
      const chunkData = payload.substring(start, end);

      // Protocol format: DS_QR|index|total|data
      const formattedPayload = `DS_QR|${i}|${totalChunks}|${chunkData}`;

      try {
        const dataUrl = await QRCode.toDataURL(formattedPayload, {
          errorCorrectionLevel: 'L',
          margin: 2,
          width: 400,
          color: {
            dark: '#000000FF',
            light: '#FFFFFFFF',
          },
        });
        chunks.push(dataUrl);
      } catch (e) {
        console.error('Failed to generate QR chunk', e);
        throw e;
      }
    }

    return chunks;
  }

  /**
   * Parses a raw scanned string back into a QrChunk metadata object.
   * Returns null if it doesn't match the Darkstar protocol.
   */
  public parseScannedChunk(rawScan: string): QrChunk | null {
    if (!rawScan.startsWith('DS_QR|')) {
      return null;
    }

    const parts = rawScan.split('|');
    if (parts.length < 4) return null;

    const index = parseInt(parts[1], 10);
    const total = parseInt(parts[2], 10);

    // The payload might contain '|' characters, so join the rest back together
    const data = parts.slice(3).join('|');

    if (isNaN(index) || isNaN(total)) return null;

    return { index, total, data };
  }
}
