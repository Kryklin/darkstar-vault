import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Nav } from './nav';
import { Theme } from '../../services/theme';
import { MaterialModule } from '../../modules/material/material';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { provideRouter } from '@angular/router';

describe('Nav', () => {
  let component: Nav;
  let fixture: ComponentFixture<Nav>;

  beforeEach(async () => {
    // Mock Electron API
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      onUpdateStatus: jasmine.createSpy('onUpdateStatus'),
      onInitiateUpdateCheck: jasmine.createSpy('onInitiateUpdateCheck'),
      setVersionLock: jasmine.createSpy('setVersionLock'),
    };

    await TestBed.configureTestingModule({
      imports: [Nav, MaterialModule, NoopAnimationsModule, RouterTestingModule],
      providers: [Theme, provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Nav);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });
});
