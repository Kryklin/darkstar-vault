import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { Slip39Encrypt } from './encrypt';
import { Slip39Decrypt } from './decrypt';

@Component({
  selector: 'app-slip39-tools',
  standalone: true,
  imports: [CommonModule, MatTabsModule, Slip39Encrypt, Slip39Decrypt],
  template: `
    <div class="page-layout-wrapper">
      <mat-tab-group dynamicHeight animationDuration="300ms">
        <mat-tab label="Encrypt">
          <div style="padding-top: 24px;">
            <app-slip39-encrypt></app-slip39-encrypt>
          </div>
        </mat-tab>
        <mat-tab label="Decrypt">
          <div style="padding-top: 24px;">
            <app-slip39-decrypt></app-slip39-decrypt>
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
export class Slip39Tools {}
