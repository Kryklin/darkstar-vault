import { StegoGenerator } from './types';

export class CsvGenerator implements StegoGenerator {
  /**
   * Generates a CSV file mimicking sensor data behavior.
   * The payload is split into chunks and hidden in the 'Trace_Hash' column.
   *
   * @param payload The encrypted string to hide.
   */
  generate(payload: string /* options */): string {
    const headers = ['Timestamp', 'Sensor_ID', 'Temperature', 'Voltage', 'Trace_Hash'];
    const lines = [headers.join(',')];

    // Distribute the payload across multiple rows to simulate extensive logging
    const chunkSize = 64; // Characters per row
    const chunks: string[] = [];

    for (let i = 0; i < payload.length; i += chunkSize) {
      chunks.push(payload.slice(i, i + chunkSize));
    }

    const now = Date.now();

    chunks.forEach((chunk, index) => {
      // Generate realistic noise data for other columns
      const time = new Date(now - (chunks.length - index) * 60000).toISOString();
      const sensorId = `SENS-${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(4, '0')}`;
      const temp = (20 + Math.random() * 10).toFixed(2); // 20.00 - 30.00
      const voltage = (3.3 + Math.random() * 0.5).toFixed(3); // 3.300 - 3.800

      // The payload chunk is embedded in the Trace_Hash column
      lines.push(`${time},${sensorId},${temp},${voltage},${chunk}`);
    });

    return lines.join('\n');
  }

  /**
   * Reconstructs the payload from a CSV string.
   * Scans for the 'Trace_Hash' column and concatenates its values.
   *
   * @param fileContent The CSV content.
   */
  extract(fileContent: string): string {
    try {
      const lines = fileContent.trim().split('\n');
      if (lines.length < 2) return '';

      const headers = lines[0].split(',');
      const traceHashIndex = headers.indexOf('Trace_Hash');

      if (traceHashIndex === -1) {
        return '';
      }

      let payload = '';
      // Iterate through rows (skipping header) to capture payload chunks
      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(',');
        if (columns.length > traceHashIndex) {
          payload += columns[traceHashIndex].trim();
        }
      }

      return payload || '';
    } catch (e) {
      console.error('CSV Extraction Error', e);
      return '';
    }
  }
}
