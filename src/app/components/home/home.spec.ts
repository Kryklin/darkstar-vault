import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Home } from './home';
import { MaterialModule } from '../../modules/material/material';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Theme } from '../../services/theme';
import { provideRouter } from '@angular/router';

import packageJson from '../../../../package.json';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;
  let compiled: HTMLElement;

  beforeEach(async () => {
    // Mock Electron API
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      onUpdateStatus: jasmine.createSpy('onUpdateStatus'),
      onInitiateUpdateCheck: jasmine.createSpy('onInitiateUpdateCheck'),
      setVersionLock: jasmine.createSpy('setVersionLock'),
      checkIntegrity: jasmine.createSpy('checkIntegrity').and.returnValue(Promise.resolve(true)),
    };

    await TestBed.configureTestingModule({
      imports: [Home, MaterialModule, NoopAnimationsModule],
      providers: [Theme, provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should show the info card immediately', () => {
    fixture.detectChanges();
    const card = compiled.querySelector('mat-card.info-card');
    expect(card).toBeTruthy();
  });

  it('should display the correct subtitle', fakeAsync(() => {
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();
    const subtitle = compiled.querySelector('.subtitle-text');
    expect(subtitle?.textContent).toContain('Quantum-Safe Information Security');
  }));

  it('should display the footer with correct version', fakeAsync(() => {
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();
    const footer = compiled.querySelector('.footer');
    expect(footer).toBeTruthy();
    expect(footer?.textContent).toContain('© 2026. All Rights Reserved.');
    expect(footer?.textContent).toContain(`Version ${packageJson.version}`);
  }));
});
