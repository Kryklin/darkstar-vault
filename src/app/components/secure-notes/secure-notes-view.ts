import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { SecureNotesEncrypt } from './encrypt';
import { SecureNotesDecrypt } from './decrypt';

@Component({
  selector: 'app-secure-notes-view',
  standalone: true,
  imports: [CommonModule, MatTabsModule, SecureNotesEncrypt, SecureNotesDecrypt],
  template: `
    <div class="page-layout-wrapper">
      <mat-tab-group dynamicHeight animationDuration="300ms">
        <mat-tab label="Encrypt">
          <div style="padding-top: 24px;">
            <app-secure-notes-encrypt></app-secure-notes-encrypt>
          </div>
        </mat-tab>
        <mat-tab label="Decrypt">
          <div style="padding-top: 24px;">
            <app-secure-notes-decrypt></app-secure-notes-decrypt>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class SecureNotesView {}
