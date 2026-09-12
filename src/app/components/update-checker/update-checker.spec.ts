import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UpdateChecker } from './update-checker';
import { UpdateService } from '../../services/update';
import { provideRouter } from '@angular/router';
import { MatSnackBarModule } from '@angular/material/snack-bar';

describe('UpdateChecker', () => {
  let component: UpdateChecker;
  let fixture: ComponentFixture<UpdateChecker>;

  beforeEach(async () => {
    // Mock Electron API
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      onUpdateStatus: jasmine.createSpy('onUpdateStatus'),
      onInitiateUpdateCheck: jasmine.createSpy('onInitiateUpdateCheck'),
      setVersionLock: jasmine.createSpy('setVersionLock'),
    };

    await TestBed.configureTestingModule({
      imports: [UpdateChecker, NoopAnimationsModule, MatSnackBarModule],
      providers: [UpdateService, provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(UpdateChecker);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
