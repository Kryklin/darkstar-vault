export enum StealthMode {
  LOG = 'log',
  CSV = 'csv',
  JSON = 'json',
  IMAGE = 'image',
  AUDIO = 'audio',
  TEXT = 'text',
}

export interface StealthOptions {
  noiseLevel: number; // 0.1 to 1.0 (Higher = more noise/cover text, larger file)
  theme?: string; // e.g., 'financial', 'server', 'iot'
  coverFile?: ArrayBuffer; // Optional binary cover for audio/image
}

export interface StegoGenerator {
  generate(payload: string, options: StealthOptions): string;
  extract(content: string): string;
}
