import { Injectable, signal, inject, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { z } from 'zod';
import pkg from '../../../package.json';

const GitHubReleaseSchema = z.object({
  tag_name: z.string(),
});

/**
 * Manages application updates by checking GitHub Releases directly.
 * Bypasses electron-updater for reliable status checks.
 */
@Injectable({
  providedIn: 'root',
})
export class UpdateService {
  router = inject(Router);
  ngZone = inject(NgZone);
  private snackBar = inject(MatSnackBar);

  isChecking = signal(false);
  updateStatus = signal<string>('idle');
  updateError = signal<string | null>(null);
  versionLocked = signal<boolean>(localStorage.getItem('versionLocked') === null ? true : localStorage.getItem('versionLocked') === 'true');
  currentVersion = pkg.version;

  isElectron = !!window.electronAPI;

  constructor() {
    if (this.isElectron) {
      this.setupListeners();
    }
    this.loadSettings();
  }

  private loadSettings() {
    const locked = this.versionLocked();

    if (this.isElectron) {
      window.electronAPI.setVersionLock(locked);
    }

    if (locked) {
      this.snackBar.open('Updater is version locked. Disable in Settings to update.', 'Dismiss', {
        duration: 5000,
        verticalPosition: 'top',
      });
    }
  }

  toggleVersionLock() {
    const newState = !this.versionLocked();
    this.versionLocked.set(newState);
    localStorage.setItem('versionLocked', String(newState));

    if (this.isElectron) {
      window.electronAPI.setVersionLock(newState);
    }
  }

  private setupListeners() {
    const api = window.electronAPI;

    // Listen for background auto-updater events
    api.onUpdateStatus((status: { status: string; error?: string }) => {
      this.ngZone.run(() => {
        console.log('Main process update status:', status.status);
        this.updateStatus.set(status.status);
        if (status.status === 'downloaded' || status.status === 'available') {
          this.router.navigate(['/update-check']);
        }
        if (status.error) {
          this.updateError.set(status.error);
        }
      });
    });

    // Listen for menu clicks/shortcuts to trigger check
    api.onInitiateUpdateCheck(() => {
      this.ngZone.run(() => {
        if (this.versionLocked()) {
          console.log('Update check skipped due to version lock.');
          return;
        }

        this.router.navigate(['/update-check']);
        this.checkForUpdates();
      });
    });
  }

  /**
   * Triggers an update check via GitHub API.
   */
  async checkForUpdates() {
    if (this.versionLocked()) {
      console.log('Update check blocked: Version is locked.');
      return;
    }

    if (this.isChecking()) return;

    this.isChecking.set(true);
    this.updateStatus.set('checking');
    this.updateError.set(null);

    try {
      // Simulate a small delay for UX so it doesn't flash too fast
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const response = await fetch('https://api.github.com/repos/Kryklin/darkstar-vault/releases/latest');
      if (!response.ok) {
        throw new Error(`GitHub API Error: ${response.statusText}`);
      }

      const data = await response.json();
      const validation = GitHubReleaseSchema.safeParse(data);

      if (!validation.success) {
        throw new Error('Invalid response from GitHub API.');
      }

      const remoteTag = validation.data.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present
      const localVersion = this.currentVersion;

      const comparison = this.compareVersions(remoteTag, localVersion);

      console.log('Update Check Debug:', { remoteTag, localVersion, comparison });

      if (comparison > 0) {
        this.updateStatus.set('available');
        this.router.navigate(['/update-check']);
        // On mobile/web, we don't have auto-download events, so we notify clearly.
        if (!this.isElectron) {
          console.log('Update available for non-Electron platform.');
        }
      } else if (comparison < 0) {
        this.updateStatus.set('alpha');
      } else {
        this.updateStatus.set('not-available');
      }
    } catch (err: unknown) {
      console.error('Update check failed:', err);
      this.updateStatus.set('error');
      const errorMessage = err instanceof Error ? err.message : 'Failed to check for updates.';
      this.updateError.set(errorMessage);
    } finally {
      this.isChecking.set(false);
    }
  }

  /**
   * Returns > 0 if v1 > v2, < 0 if v1 < v2, 0 if equal.
   */
  private compareVersions(v1: string, v2: string): number {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    const len = Math.max(p1.length, p2.length);

    for (let i = 0; i < len; i++) {
      const num1 = p1[i] || 0;
      const num2 = p2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }

  quitAndInstall() {
    if (this.isElectron) {
      window.electronAPI.restartAndInstall();
    } else {
      window.open('https://github.com/Kryklin/darkstar-vault/releases/latest', '_blank');
    }
  }

  resetState() {
    this.isChecking.set(false);
    this.updateStatus.set('idle');
    this.updateError.set(null);
  }
}
