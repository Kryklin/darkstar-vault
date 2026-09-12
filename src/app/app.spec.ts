import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { Nav } from './components/nav/nav';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';

describe('App', () => {
  beforeEach(async () => {
    // Mock Electron API
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      onUpdateStatus: jasmine.createSpy('onUpdateStatus'),
      onInitiateUpdateCheck: jasmine.createSpy('onInitiateUpdateCheck'),
      setVersionLock: jasmine.createSpy('setVersionLock'),
      isUpdateAvailable: jasmine.createSpy('isUpdateAvailable').and.resolveTo(false),
    };

    await TestBed.configureTestingModule({
      imports: [App, Nav, NoopAnimationsModule, RouterTestingModule],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'darkstar' title`, () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.title()).toEqual('darkstar');
  });

  it('should render the nav', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-nav')).not.toBe(null);
  });
});
