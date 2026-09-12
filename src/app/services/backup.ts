import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class BackupService {
  enabled = signal<boolean>(localStorage.getItem('backup_enabled') === 'true');
  intervalDays = signal<number>(parseInt(localStorage.getItem('backup_interval_days') || '7', 10));
  lastBackupDate = signal<Date | null>(localStorage.getItem('backup_last_date') ? new Date(localStorage.getItem('backup_last_date')!) : null);
  backupPath = signal<string>(localStorage.getItem('backup_path') || '');

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Persist settings whenever they change
    effect(() => {
      localStorage.setItem('backup_enabled', String(this.enabled()));
      localStorage.setItem('backup_interval_days', String(this.intervalDays()));
      localStorage.setItem('backup_path', this.backupPath());
      if (this.lastBackupDate()) {
        localStorage.setItem('backup_last_date', this.lastBackupDate()!.toISOString());
      } else {
        localStorage.removeItem('backup_last_date');
      }

      // Restart the timer when settings change
      this.checkAndStartBackupJob();
    });
  }

  checkAndStartBackupJob() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    if (!this.enabled() || !window.electronAPI) return;

    // Run immediately on boot if missed
    this.performBackupIfDue();

    // Check every hour
    this.timer = setInterval(
      () => {
        this.performBackupIfDue();
      },
      60 * 60 * 1000,
    );
  }

  async performBackupIfDue() {
    if (!this.enabled()) return;

    const last = this.lastBackupDate();
    const interval = this.intervalDays() * 24 * 60 * 60 * 1000;

    if (!last || Date.now() - last.getTime() >= interval) {
      await this.triggerBackup();
    }
  }

  async triggerBackup(): Promise<boolean> {
    if (!window.electronAPI) return false;

    // Grab the encrypted vault blob directly
    const vaultData = localStorage.getItem('darkstar_vault');
    if (!vaultData) return false;

    let dir = this.backupPath();
    if (!dir) {
      // If no custom directory set, we rely on the main process default
      dir = await window.electronAPI.getDefaultBackupPath();
    }

    const filename = `darkstar_vault_${new Date().toISOString().replace(/[:.]/g, '-')}.backup`;

    try {
      // Send to electron to write
      const success = await window.electronAPI.saveBackup(dir, filename, vaultData);
      if (success) {
        this.lastBackupDate.set(new Date());
        return true;
      }
    } catch (e) {
      console.error('Backup failed', e);
    }
    return false;
  }

  async chooseBackupDirectory(): Promise<string | null> {
    if (!window.electronAPI) return null;
    const path = await window.electronAPI.showDirectoryPicker();
    if (path) {
      this.backupPath.set(path);
    }
    return path;
  }

  async validateAndRestoreBackup(): Promise<{ success: boolean; message: string }> {
    if (!window.electronAPI) return { success: false, message: 'Electron API unavailable.' };

    try {
      // 1. Pick file
      const filePath = await window.electronAPI.showFilePicker();
      if (!filePath) return { success: false, message: 'No file selected.' };

      // 2. Read file blob
      const backupData = await window.electronAPI.openBackup(filePath);
      if (!backupData) return { success: false, message: 'Failed to read backup file.' };

      // 3. Very basic structural validation
      // We expect a base64 encoded JSON string representing the Vault envelope
      try {
        const parsed = JSON.parse(backupData);
        if (!parsed || !parsed.data) {
          return { success: false, message: 'Invalid backup file format or corrupted payload.' };
        }
      } catch (_e) {
        return { success: false, message: 'Invalid backup file format. Expected JSON storage envelope.' };
      }

      // 4. Inject
      localStorage.setItem('darkstar_vault', backupData);

      // 5. Force reload
      window.location.reload();

      // Technically won't reach here if reload succeeds instantly
      return { success: true, message: 'Restoration successful. Reloading...' };
    } catch (err) {
      console.error('Backup Restoration Error:', err);
      return { success: false, message: err instanceof Error ? err.message : 'An unknown error occurred during restoration.' };
    }
  }
}
