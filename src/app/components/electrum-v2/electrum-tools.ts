import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { ElectrumV2Encrypt } from './encrypt';
import { ElectrumV2Decrypt } from './decrypt';

@Component({
  selector: 'app-electrum-tools',
  standalone: true,
  imports: [CommonModule, MatTabsModule, ElectrumV2Encrypt, ElectrumV2Decrypt],
  template: `
    <div class="page-layout-wrapper">
      <mat-tab-group dynamicHeight animationDuration="300ms">
        <mat-tab label="Electrum V2 (Encrypt)">
          <div style="padding-top: 24px;">
            <app-electrum-v2-encrypt></app-electrum-v2-encrypt>
          </div>
        </mat-tab>
        <mat-tab label="Electrum V2 (Decrypt)">
          <div style="padding-top: 24px;">
            <app-electrum-v2-decrypt></app-electrum-v2-decrypt>
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
export class ElectrumTools {}
