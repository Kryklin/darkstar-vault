import { StegoGenerator, StealthOptions } from './types';

/**
 * TextGenerator ("Stealth Paste")
 * Maps binary bits to natural language words to create a "spam-like" or "prose-like" cover text.
 *
 * Simple implementation:
 * - 0 = Word from List A (Adjectives/Nouns)
 * - 1 = Word from List B (Verbs/Connectors)
 * - OR: Use a BIP39-style index mapping if strictly binary.
 *
 * For this version, we will use a simple 1-bit mapping:
 * 0 -> Even index words
 * 1 -> Odd index words
 * From a fixed dictionary.
 */
export class TextGenerator implements StegoGenerator {
  // A small dictionary of common words.
  // In a real V2, this would be a much larger corpus or BIP39 wordlist.
  private dictionary = [
    'the',
    'quick',
    'brown',
    'fox',
    'jumps',
    'over',
    'lazy',
    'dog',
    'audit',
    'finance',
    'report',
    'system',
    'check',
    'status',
    'valid',
    'error',
    'meeting',
    'notes',
    'agenda',
    'team',
    'work',
    'done',
    'todo',
    'later',
    'sales',
    'growth',
    'market',
    'share',
    'value',
    'price',
    'cost',
    'net',
    'server',
    'cloud',
    'data',
    'base',
    'node',
    'link',
    'down',
    'up',
  ];

  generate(payload: string, _options?: StealthOptions): string {
    // payload is Base64 (usually)
    // Convert to Binary String
    const binary = this.stringToBinary(payload);

    // Header for recognition (optional, but good for reliable extraction)
    // We'll trust the dictionary mapping for now without a header to keep it stealthy.

    const words = [];

    // Map bits to words
    // 0 -> dictionary[0, 2, 4...]
    // 1 -> dictionary[1, 3, 5...]
    // We cycle through the dictionary to provide variety.

    let dictIndex = 0;

    for (const bit of binary) {
      if (dictIndex >= this.dictionary.length - 1) dictIndex = 0;

      if (bit === '0') {
        // Find next even index
        if (dictIndex % 2 !== 0) dictIndex++;
        words.push(this.dictionary[dictIndex]);
      } else {
        // Find next odd index
        if (dictIndex % 2 === 0) dictIndex++;
        words.push(this.dictionary[dictIndex]);
      }

      dictIndex++;
    }

    return words.join(' ');
  }

  extract(content: string): string {
    const words = content.trim().split(/\s+/);
    let binary = '';

    for (const word of words) {
      const index = this.dictionary.indexOf(word.toLowerCase());
      if (index === -1) {
        // Ignore unknown words (noise tolerance)
        continue;
      }

      // Even = 0, Odd = 1
      binary += index % 2 === 0 ? '0' : '1';
    }

    return this.binaryToString(binary);
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
}
