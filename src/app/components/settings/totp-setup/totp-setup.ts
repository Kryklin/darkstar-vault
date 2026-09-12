import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../modules/material/material';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-totp-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  template: `
    <div class="totp-setup-container">
      <h2>Set Up Two-Factor Authentication</h2>
      <p>Scan the QR code below with your Authenticator app (e.g., Google Authenticator, Authy).</p>

      <div class="qr-container">
        @if (qrCodeDataUrl) {
          <img [src]="qrCodeDataUrl" alt="TOTP QR Code" />
        } @else {
          <mat-spinner diameter="40"></mat-spinner>
        }
      </div>

      <p class="secret-text">
        Or enter this code manually: <strong>{{ secret }}</strong>
      </p>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Verification Code</mat-label>
        <input matInput type="text" [(ngModel)]="verificationCode" placeholder="123456" maxlength="6" (keyup.enter)="verify()" />
      </mat-form-field>

      @if (errorMsg) {
        <p class="error-msg">{{ errorMsg }}</p>
      }

      <div class="actions">
        <button mat-button (click)="cancel()">Cancel</button>
        <button mat-flat-button color="primary" [disabled]="verificationCode.length < 6 || isVerifying" (click)="verify()">Verify & Enable</button>
      </div>
    </div>
  `,
  styles: [
    `
      .totp-setup-container {
        padding: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .qr-container {
        margin: 20px 0;
        min-height: 200px;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .qr-container img {
        width: 200px;
        height: 200px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
      .secret-text {
        margin-bottom: 20px;
        font-size: 0.9em;
        color: #777;
      }
      .full-width {
        width: 100%;
      }
      .error-msg {
        color: #f44336;
        margin-top: -10px;
        margin-bottom: 10px;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        width: 100%;
        gap: 10px;
      }
    `,
  ],
})
export class TotpSetup implements OnInit {
  dialogRef = inject(MatDialogRef<TotpSetup>);

  qrCodeDataUrl = '';
  secret = '';
  verificationCode = '';
  errorMsg = '';
  isVerifying = false;

  async ngOnInit() {
    if (window.electronAPI) {
      try {
        const { secret, uri } = await window.electronAPI.vaultGenerateTotp();
        this.secret = secret;
        this.qrCodeDataUrl = await QRCode.toDataURL(uri, {
          width: 250,
          margin: 2,
          color: { dark: '#000000ff', light: '#ffffffff' },
        });
      } catch (e) {
        this.errorMsg = 'Failed to generate QR Code. See console.';
        console.error(e);
      }
    } else {
      this.errorMsg = 'TOTP setup relies on Electron API which is currently unavailable.';
    }
  }

  async verify() {
    if (this.verificationCode.length < 6) return;
    this.isVerifying = true;
    this.errorMsg = '';

    try {
      const isValid = await window.electronAPI.vaultVerifyTotp(this.verificationCode, this.secret);
      if (isValid) {
        this.dialogRef.close(this.secret);
      } else {
        this.errorMsg = 'Invalid verification code. Please try again.';
      }
    } catch (_e) {
      this.errorMsg = 'Verification failed.';
    } finally {
      this.isVerifying = false;
    }
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
