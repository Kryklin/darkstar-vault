import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VaultService } from '../../services/vault';
import { VaultAuthComponent } from './auth/vault-auth.component';
import { VaultDashboardComponent } from './dashboard/vault-dashboard.component';

@Component({
  selector: 'app-vault',
  standalone: true,
  imports: [CommonModule, VaultAuthComponent, VaultDashboardComponent],
  template: `
    <div class="vault-wrapper">
      @if (!vaultService.isUnlocked()) {
        <app-vault-auth></app-vault-auth>
      }
      @if (vaultService.isUnlocked()) {
        <app-vault-dashboard></app-vault-dashboard>
      }
    </div>
  `,
  styles: [
    `
      .vault-wrapper {
        height: 100%;
        width: 100%;
        overflow: hidden;
        position: relative;
      }
    `,
  ],
})
export class VaultComponent {
  vaultService = inject(VaultService);
}
