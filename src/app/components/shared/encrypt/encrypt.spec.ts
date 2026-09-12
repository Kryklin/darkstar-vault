import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { SharedEncryptComponent } from './encrypt';
import { CryptService } from '../../../services/crypt';
import { VaultService } from '../../../services/vault';
import { SteganographyService } from '../../../services/steganography.service';
import { PaperWalletService } from '../../../services/paper-wallet.service';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MaterialModule } from '../../../modules/material/material';
import { signal, WritableSignal } from '@angular/core';

describe('SharedEncryptComponent', () => {
  let component: SharedEncryptComponent;
  let fixture: ComponentFixture<SharedEncryptComponent>;
  let mockCryptService: jasmine.SpyObj<CryptService>;
  let mockVaultService: { isUnlocked: WritableSignal<boolean>; identity: WritableSignal<unknown> };

  beforeEach(async () => {
    mockCryptService = jasmine.createSpyObj('CryptService', ['encrypt']);
    mockCryptService.encrypt.and.resolveTo({ encryptedData: '{"v":6,"data":"..."}', reverseKey: '' });

    mockVaultService = {
      isUnlocked: signal(true),
      identity: signal({ pqcPublicKey: btoa('test-key') }),
    };

    await TestBed.configureTestingModule({
      imports: [SharedEncryptComponent, BrowserAnimationsModule, MaterialModule, MatSnackBarModule],
      providers: [{ provide: CryptService, useValue: mockCryptService }, { provide: VaultService, useValue: mockVaultService }, SteganographyService, PaperWalletService],
    }).compileComponents();

    fixture = TestBed.createComponent(SharedEncryptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the first form group', () => {
    expect(component.firstFormGroup).toBeDefined();
    expect(component.firstFormGroup.controls['firstCtrl']).toBeDefined();
  });

  describe('onSubmit', () => {
    it('should not call cryptService if form is invalid', fakeAsync(() => {
      component.firstFormGroup.controls['firstCtrl'].setValue('');
      fixture.detectChanges();
      component.onSubmit();
      tick();
      expect(mockCryptService.encrypt).not.toHaveBeenCalled();
    }));

    it('should show snackbar if vault is locked', fakeAsync(() => {
      // Directly spy on the component's injected snackbar instance
      const spy = spyOn((component as unknown as { snackBar: { open: (...args: unknown[]) => void } }).snackBar, 'open');

      mockVaultService.isUnlocked.set(false);
      fixture.detectChanges();

      component.firstFormGroup.controls['firstCtrl'].setValue('abandon abandon abandon');
      component.firstFormGroup.controls['firstCtrl'].updateValueAndValidity();
      fixture.detectChanges();

      component.onSubmit();
      tick();

      expect(spy).toHaveBeenCalledWith(jasmine.stringMatching(/Vault is locked/), 'Close', jasmine.any(Object));
      expect(mockCryptService.encrypt).not.toHaveBeenCalled();
    }));

    it('should call cryptService.encrypt when valid and unlocked', fakeAsync(() => {
      mockVaultService.isUnlocked.set(true);
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      component.firstFormGroup.controls['firstCtrl'].setValue(mnemonic);
      component.firstFormGroup.controls['firstCtrl'].updateValueAndValidity();
      fixture.detectChanges();

      component.onSubmit();
      tick();

      expect(mockCryptService.encrypt).toHaveBeenCalled();
      expect(component.showResult).toBeTrue();
    }));
  });

  it('should reset component state', () => {
    component.showResult = true;
    component.encryptedData = 'data';

    component.reset();

    expect(component.showResult).toBeFalse();
    expect(component.encryptedData).toBe('');
    expect(component.firstFormGroup.pristine).toBeTrue();
  });
});
