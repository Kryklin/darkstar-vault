import { Injectable, signal } from '@angular/core';

export interface ThemeDef {
  name: string;
  primary: string;
  className: string;
}

@Injectable({
  providedIn: 'root',
})
/**
 * Manages the application's visual theme (light/dark mode) and associated assets.
 * Persists user preference to local storage.
 */
export class Theme {
  availableThemes: ThemeDef[] = [
    { name: 'Obsidian Black', primary: '#000000', className: 'theme-obsidian-shard' },
    { name: 'Crimson Void', primary: '#D50000', className: 'theme-crimson-void' },
    { name: 'Solar Flare', primary: '#E65100', className: 'theme-solar-flare' },
    { name: 'Amber Glow', primary: '#FF6F00', className: 'theme-amber-glow' },
    { name: 'Forest Whisper', primary: '#2E7D32', className: 'theme-forest-whisper' },
    { name: 'Teal Torrent', primary: '#009688', className: 'theme-teal-torrent' },
    { name: 'Neon Cyberpunk', primary: '#00E5FF', className: 'theme-neon-cyberpunk' },
    { name: 'Oceanic Depth', primary: '#1A237E', className: 'theme-oceanic-depth' },
    { name: 'Royal Amethyst', primary: '#4A148C', className: 'theme-royal-amethyst' },
    { name: 'Magenta Madness', primary: '#D500F9', className: 'theme-magenta-madness' },
    { name: 'Golden Sands', primary: '#5D4037', className: 'theme-golden-sands' },
    { name: 'Midnight Slate', primary: '#263238', className: 'theme-midnight-slate' },
    { name: 'Barbie Pink', primary: '#E0218A', className: 'theme-barbie-pink' },
    { name: 'Toxic Sludge', primary: '#76FF03', className: 'theme-toxic-sludge' },
    { name: 'Vapor Wave', primary: '#6200EA', className: 'theme-vapor-wave' },
    { name: 'Arctic Frost', primary: '#00BCD4', className: 'theme-arctic-frost' },
  ];

  isDarkTheme = signal<boolean>(true);
  logoSrc = signal<string>('assets/img/logo-white.png');
  selectedTheme = signal<ThemeDef>(this.getInitialTheme());

  private getInitialTheme(): ThemeDef {
    const stored = localStorage.getItem('selectedTheme');
    return this.availableThemes.find((t) => t.className === stored) || this.availableThemes[0];
  }

  constructor() {
    this.updateBodyClass();
    this.updateLogo();
    this.updateFavicon();
  }

  setDarkTheme(_isDark: boolean) {
    // Disabled logic: Enforce dark theme
    this.isDarkTheme.set(true);
    localStorage.setItem('isDarkTheme', JSON.stringify(true));
    this.updateBodyClass();
    this.updateLogo();
    this.updateFavicon();
  }

  setTheme(theme: ThemeDef) {
    this.selectedTheme.set(theme);
    localStorage.setItem('selectedTheme', theme.className);
    this.updateBodyClass();
  }

  private updateBodyClass() {
    // Remove all theme classes
    this.availableThemes.forEach((t) => document.body.classList.remove(t.className));

    // Add selected theme class
    document.body.classList.add(this.selectedTheme().className);

    // Add light/dark class
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');

    // Generate RGB version of primary color for alpha-blending in CSS
    const hex = this.selectedTheme().primary;
    if (hex && hex.length === 7) {
      const r = parseInt(hex.substring(1, 3), 16);
      const g = parseInt(hex.substring(3, 5), 16);
      const b = parseInt(hex.substring(5, 7), 16);
      document.documentElement.style.setProperty('--mat-sys-primary-rgb', `${r}, ${g}, ${b}`);
    }
  }

  private updateLogo() {
    this.logoSrc.set('assets/img/logo-white.png');
  }

  private updateFavicon() {
    const favicon = document.getElementById('favicon') as HTMLLinkElement;
    if (favicon) {
      favicon.href = 'assets/img/logo-white.png';
    }
  }
}
