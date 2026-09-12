import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { UpdateService } from './update';

describe('UpdateService', () => {
  let service: UpdateService;

  let mockElectronAPI: {
    setVersionLock: jasmine.Spy;
    onUpdateStatus: jasmine.Spy;
    onInitiateUpdateCheck: jasmine.Spy;
    restartAndInstall: jasmine.Spy;
  };

  beforeEach(() => {
    // Mock Electron API
    mockElectronAPI = {
      setVersionLock: jasmine.createSpy('setVersionLock'),
      onUpdateStatus: jasmine.createSpy('onUpdateStatus'),
      onInitiateUpdateCheck: jasmine.createSpy('onInitiateUpdateCheck'),
      restartAndInstall: jasmine.createSpy('restartAndInstall'),
    };
    (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;

    TestBed.configureTestingModule({
      imports: [MatSnackBarModule],
      providers: [provideRouter([]), UpdateService],
    });
    service = TestBed.inject(UpdateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set up listeners if running in electron', () => {
    expect(mockElectronAPI.onUpdateStatus).toHaveBeenCalled();
    expect(mockElectronAPI.onInitiateUpdateCheck).toHaveBeenCalled();
  });

  it('should toggle version lock', () => {
    const initialLock = service.versionLocked();
    service.toggleVersionLock();
    expect(service.versionLocked()).toBe(!initialLock);
    expect(mockElectronAPI.setVersionLock).toHaveBeenCalledWith(!initialLock);
  });
});
