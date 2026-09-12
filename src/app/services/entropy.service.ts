import { Injectable } from '@angular/core';

export type StrengthLevel = 'weak' | 'fair' | 'strong' | 'defense-grade';

@Injectable({
  providedIn: 'root',
})
export class EntropyService {
  /**
   * Calculates the entropy of a given string in bits.
   * E = L * log2(R)
   * L = length of password
   * R = size of character pool
   */
  calculateEntropy(input: string): number {
    if (!input) return 0;

    let poolSize = 0;

    // Determine pool size
    if (/[a-z]/.test(input)) poolSize += 26;
    if (/[A-Z]/.test(input)) poolSize += 26;
    if (/[0-9]/.test(input)) poolSize += 10;
    if (/[^a-zA-Z0-9]/.test(input)) poolSize += 32; // Special chars

    if (poolSize === 0) return 0;

    return Math.floor(input.length * Math.log2(poolSize));
  }

  /**
   * Returns a strength classification based on entropy bits.
   */
  getStrengthLevel(entropy: number): StrengthLevel {
    if (entropy < 50) return 'weak';
    if (entropy < 80) return 'fair';
    if (entropy < 120) return 'strong';
    return 'defense-grade';
  }

  /**
   * Estimates time to crack based on a hypothetical attack rate.
   * Assuming a powerful cracking rig doing 100 billion (10^11) guesses per second (offline attack).
   */
  getCrackTimeEstimate(entropy: number): string {
    if (entropy === 0) return 'Instant';

    const guesses = Math.pow(2, entropy);
    const guessesPerSecond = 1e11; // 100 Billion/sec
    const seconds = guesses / guessesPerSecond;

    if (seconds < 1) return 'Instant';
    if (seconds < 60) return '< 1 minute';
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
    if (seconds < 31536000) return `${Math.round(seconds / 86400)} days`;

    const years = seconds / 31536000;
    if (years < 1000) return `${Math.round(years)} years`;
    if (years < 1000000) return `${Math.round(years / 1000)}k years`;
    if (years < 1000000000) return `${Math.round(years / 1000000)}m years`;

    return 'Centuries';
  }
}
