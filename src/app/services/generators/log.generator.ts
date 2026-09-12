import { StegoGenerator, StealthOptions } from './types';

export class LogGenerator implements StegoGenerator {
  private readonly CARRIER_TAG = 'NET-SEC'; // The component that carries data
  private readonly NOISE_TAGS = ['SYS-CORE', 'DB-SYNC', 'UI-RENDER', 'AUDIT-LOG', 'AUTH-SVC'];
  private readonly LOG_LEVELS = ['INFO', 'DEBUG', 'WARN'];

  private readonly MESSAGES = [
    'Connection established',
    'Handshake successful',
    'Retrying packet delivery',
    'Cache invalidated',
    'User session updated',
    'Database index rebuilt',
    'Garbage collection started',
    'Thread pool initialized',
    'Buffer overflow protection active',
    'Latency optimization routines running',
  ];

  /**
   * Generates a realistic system log file containing the encrypted payload.
   * The payload is chunked and embedded alongside noise logs to simulate authentic system activity.
   *
   * @param payload The encrypted data string.
   * @param options Configuration for noise levels and format.
   */
  generate(payload: string, options: StealthOptions): string {
    const lines: string[] = [];
    const chunks = this.chunkString(payload, 32); // 32 chars per line
    const noiseRatio = Math.max(1, Math.floor(options.noiseLevel * 10)); // 1 to 10 noise lines per data line

    // Header: Standard system boot log sequence
    lines.push(`[${new Date().toISOString()}] [INFO] [SYS-BOOT] System initialization complete.`);

    for (const chunk of chunks) {
      // Generate Noise: Insert random system events
      for (let i = 0; i < noiseRatio; i++) {
        lines.push(this.generateLogLine(false));
      }
      // Generate Carrier: Embed payload chunk within a specific log pattern
      lines.push(this.generateLogLine(true, chunk));
    }

    // Footer: Standard system shutdown log sequence
    lines.push(`[${new Date().toISOString()}] [INFO] [SYS-SHUTDOWN] Service stopped gracefully.`);

    return lines.join('\n');
  }

  /**
   * Parses the log file to extract the hidden payload.
   * Filters for the specific carrier tag and reassembles the payload chunks.
   *
   * @param content The log file content.
   */
  extract(content: string): string {
    const lines = content.split('\n');
    let payload = '';

    for (const line of lines) {
      if (line.includes(`[${this.CARRIER_TAG}]`)) {
        // Extract the last part which corresponds to the chunk ID
        // Format: ... [NET-SEC] Message. ID: <CHUNK>
        const parts = line.split('ID: ');
        if (parts.length > 1) {
          payload += parts[1].trim();
        }
      }
    }
    return payload;
  }

  private generateLogLine(isCarrier: boolean, payloadChunk = '') {
    const timestamp = new Date().toISOString();
    const level = this.LOG_LEVELS[Math.floor(Math.random() * this.LOG_LEVELS.length)];

    if (isCarrier) {
      const msg = 'Secure channel active.';
      return `[${timestamp}] [INFO] [${this.CARRIER_TAG}] ${msg} ID: ${payloadChunk}`;
    } else {
      const tag = this.NOISE_TAGS[Math.floor(Math.random() * this.NOISE_TAGS.length)];
      const msg = this.MESSAGES[Math.floor(Math.random() * this.MESSAGES.length)];
      const fakeId = this.generateRandomId(32);
      return `[${timestamp}] [${level}] [${tag}] ${msg} ID: ${fakeId}`;
    }
  }

  private chunkString(str: string, size: number): string[] {
    const numChunks = Math.ceil(str.length / size);
    const chunks = new Array(numChunks);
    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
      chunks[i] = str.substr(o, size);
    }
    return chunks;
  }

  private generateRandomId(length: number): string {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }
}
