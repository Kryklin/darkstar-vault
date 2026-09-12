import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { Encrypt } from './encrypt';
import { Decrypt } from './decrypt';

@Component({
  selector: 'app-bip39-tools',
  standalone: true,
  imports: [CommonModule, MatTabsModule, Encrypt, Decrypt],
  template: `
    <div class="page-layout-wrapper">
      <mat-tab-group dynamicHeight animationDuration="300ms">
        <mat-tab label="Encrypt">
          <div style="padding-top: 24px;">
            <app-encrypt></app-encrypt>
          </div>
        </mat-tab>
        <mat-tab label="Decrypt">
          <div style="padding-top: 24px;">
            <app-decrypt></app-decrypt>
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
export class Bip39Tools {}
