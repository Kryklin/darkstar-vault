import { Component, inject, OnInit, effect } from '@angular/core';

import { Router } from '@angular/router';
import { MaterialModule } from '../../modules/material/material';
import { UpdateService } from '../../services/update';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-update-checker',
  standalone: true,
  imports: [MaterialModule],
  templateUrl: './update-checker.html',
  styleUrl: './update-checker.scss',
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [style({ opacity: 0, transform: 'scale(0.95)' }), animate('300ms cubic-bezier(0.4, 0.0, 0.2, 1)', style({ opacity: 1, transform: 'scale(1)' }))]),
      transition(':leave', [animate('200ms cubic-bezier(0.4, 0.0, 0.2, 1)', style({ opacity: 0, transform: 'scale(0.95)' }))]),
    ]),
  ],
})
export class UpdateChecker implements OnInit {
  updateService = inject(UpdateService);
  router = inject(Router);
  isElectron = !!window.electronAPI;

  constructor() {
    effect(() => {
      const status = this.updateService.updateStatus();
      if (status === 'not-available') {
        setTimeout(() => {
          this.updateService.resetState();
          this.router.navigate(['/home']);
        }, 2000);
      } else if (status === 'error' || status === 'alpha') {
        // Stay on page to show error or alpha status
      }
    });
  }

  ngOnInit() {
    // If we landed here accurately, check should be in progress.
    // If not started (e.g. manual nav), start it.
    if (this.updateService.updateStatus() === 'idle') {
      this.updateService.checkForUpdates();
    }
  }

  restart() {
    this.updateService.quitAndInstall();
  }

  goHome() {
    this.updateService.resetState();
    this.router.navigate(['/home']);
  }

  getStatusMessage(): string {
    const status = this.updateService.updateStatus();
    switch (status) {
      case 'checking':
        return 'Checking for updates...';
      case 'available':
        return this.isElectron ? 'Update found. Downloading...' : 'New Version Found';
      case 'downloaded':
        return 'Update ready to install';
      case 'not-available':
        return 'You are up to date';
      case 'error':
        return 'Update failed';
      default:
        return '';
    }
  }

  showProgressBar(): boolean {
    const status = this.updateService.updateStatus();
    return status === 'checking' || status === 'available';
  }
}
