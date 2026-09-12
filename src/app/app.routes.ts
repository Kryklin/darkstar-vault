import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'home', loadComponent: () => import('./components/home/home').then((m) => m.Home) },
  {
    path: 'bip39',
    loadComponent: () => import('./components/bip39/bip39').then((m) => m.Bip39Tools),
  },
  {
    path: 'slip39',
    loadComponent: () => import('./components/slip39/slip39').then((m) => m.Slip39Tools),
  },
  {
    path: 'electrum',
    loadComponent: () => import('./components/electrum-v2/electrum-tools').then((m) => m.ElectrumTools),
  },
  {
    path: 'secure-notes',
    loadComponent: () => import('./components/secure-notes/secure-notes-view').then((m) => m.SecureNotesView),
  },
  {
    path: 'vault',
    loadComponent: () => import('./components/vault/vault.component').then((m) => m.VaultComponent),
  },
  {
    path: 'settings',
    loadComponent: () => import('./components/settings/settings').then((m) => m.Settings),
  },
  {
    path: 'about',
    loadComponent: () => import('./components/about/about').then((m) => m.About),
  },
  {
    path: 'update-check',
    loadComponent: () => import('./components/update-checker/update-checker').then((m) => m.UpdateChecker),
  },

  // Legacy Redirects for backwards compatibility with dashboard links if any
  { path: 'encrypt', redirectTo: 'bip39', pathMatch: 'full' },
  { path: 'decrypt', redirectTo: 'bip39', pathMatch: 'full' },
  { path: 'secure-notes/encrypt', redirectTo: 'secure-notes', pathMatch: 'full' },
  { path: 'secure-notes/decrypt', redirectTo: 'secure-notes', pathMatch: 'full' },
  { path: 'slip39/encrypt', redirectTo: 'slip39', pathMatch: 'full' },
  { path: 'slip39/decrypt', redirectTo: 'slip39', pathMatch: 'full' },
  { path: 'electrum-v2/encrypt', redirectTo: 'electrum', pathMatch: 'full' },
  { path: 'electrum-v2/decrypt', redirectTo: 'electrum', pathMatch: 'full' },
  { path: 'electrum-legacy/encrypt', redirectTo: 'electrum', pathMatch: 'full' },
  { path: 'electrum-legacy/decrypt', redirectTo: 'electrum', pathMatch: 'full' },

  { path: '', redirectTo: 'home', pathMatch: 'full' },
];
