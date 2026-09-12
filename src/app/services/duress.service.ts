import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import * as CryptoJS from 'crypto-js';

@Injectable({
  providedIn: 'root',
})
export class DuressService {
  private router = inject(Router);
  private storageKey = 'darkstar_duress_hash';

  /**
   * Sets the Duress Password.
   * Stores a SHA-256 hash of the password to verify against later.
   * @param password The duress password to set.
   */
  setDuressPassword(password: string): void {
    const hash = CryptoJS.SHA256(password).toString();
    localStorage.setItem(this.storageKey, hash);
  }

  /**
   * Checks if a duress password is set.
   */
  isDuressConfigured(): boolean {
    return !!localStorage.getItem(this.storageKey);
  }

  /**
   * Clears the duress password configuration.
   */
  clearDuressPassword(): void {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Verifies if the provided password matches the stored duress hash.
   * @param password The password to check.
   */
  checkDuress(password: string): boolean {
    const storedHash = localStorage.getItem(this.storageKey);
    if (!storedHash) return false;

    const inputHash = CryptoJS.SHA256(password).toString();
    return inputHash === storedHash;
  }

  /**
   * Triggers the "Panic Mode".
   * 1. Wipes the vault from local storage.
   * 2. Clears the duress config itself (optional, but safer to leave no trace).
   * 3. Redirects to a safe state (e.g., initial setup or a fake error).
   */
  triggerDuress(): void {
    console.warn('DURESS MODE TRIGGERED. Wiping data...');

    // 1. Wipe Vault
    localStorage.removeItem('darkstar_vault');

    // 2. Clear Session Logic (if any) - Handled by VaultService.lock() usually, but be sure.
    // We expect VaultService to call this, but we can do a hard reload to be sure.

    // 3. Optional: Clear Duress Config so they can't even prove it was set?
    // Let's keep it simple: Just wipe the vault.

    // 4. Force Reload / Redirect
    // A hard reload is the safest way to clear all memory state (Signals, etc).
    window.location.reload();
  }
}
