import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../modules/material/material';
import { BackupService } from '../../../services/backup';

@Component({
  selector: 'app-backup-config',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  template: `
    <div class="backup-config-container">
      <h2 mat-dialog-title>Automated Backups</h2>

      <mat-dialog-content>
        <p>Your vault data will be exported automatically in the background when the app is running.</p>

        <div class="config-row toggle-row">
          <span>Enable Automated Backups</span>
          <mat-slide-toggle [(ngModel)]="isEnabled" (change)="toggleBackup($event)"></mat-slide-toggle>
        </div>

        <div class="config-row">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Backup Frequency (Days)</mat-label>
            <input matInput type="number" min="1" max="365" [(ngModel)]="intervalDays" [disabled]="!isEnabled" (change)="saveSettings()" />
          </mat-form-field>
        </div>

        <div class="config-row path-row">
          <mat-form-field appearance="outline" class="full-width path-field">
            <mat-label>Backup Directory</mat-label>
            <input matInput type="text" [value]="backupPath || 'Default Documents Folder'" readonly disabled />
          </mat-form-field>
          <button mat-icon-button (click)="chooseFolder()" [disabled]="!isEnabled" matTooltip="Change Directory">
            <mat-icon>folder_open</mat-icon>
          </button>
        </div>

        <div class="status-row">
          <div class="last-backup">
            <mat-icon>history</mat-icon>
            <span>Last Backup: {{ lastBackupDate ? (lastBackupDate | date: 'medium') : 'Never' }}</span>
          </div>
          <button mat-stroked-button color="primary" [disabled]="!isEnabled || isRunning" (click)="runNow()">
            @if (!isRunning) {
              <span>Run Now</span>
            }
            @if (isRunning) {
              <mat-spinner diameter="20"></mat-spinner>
            }
          </button>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-flat-button color="primary" (click)="close()">Close</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .backup-config-container {
        padding: 0;
        min-width: 400px;
      }
      .config-row {
        display: flex;
        align-items: center;
        margin-bottom: 5px;
        width: 100%;
      }
      .toggle-row {
        justify-content: space-between;
        margin-bottom: 20px;
        font-weight: 500;
      }
      .path-row {
        gap: 10px;
      }
      .path-field {
        flex: 1;
      }
      .full-width {
        width: 100%;
      }
      .status-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
        padding-top: 15px;
        border-top: 1px solid #333;
      }
      .last-backup {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.9em;
        color: #888;
      }
      mat-dialog-content {
        padding-bottom: 10px !important;
      }
    `,
  ],
})
export class BackupConfig {
  dialogRef = inject(MatDialogRef<BackupConfig>);
  backupService = inject(BackupService);

  get isEnabled() {
    return this.backupService.enabled();
  }
  set isEnabled(val: boolean) {
    this.backupService.enabled.set(val);
  }

  get intervalDays() {
    return this.backupService.intervalDays();
  }
  set intervalDays(val: number) {
    this.backupService.intervalDays.set(val);
  }

  get backupPath() {
    return this.backupService.backupPath();
  }

  get lastBackupDate() {
    return this.backupService.lastBackupDate();
  }

  isRunning = false;

  toggleBackup(event: { checked: boolean }) {
    this.isEnabled = event.checked;
  }

  saveSettings() {
    // Signals persist automatically via the effect in BackupService
  }

  async chooseFolder() {
    await this.backupService.chooseBackupDirectory();
  }

  async runNow() {
    this.isRunning = true;
    try {
      await this.backupService.triggerBackup();
    } finally {
      this.isRunning = false;
    }
  }

  close() {
    this.dialogRef.close();
  }
}
