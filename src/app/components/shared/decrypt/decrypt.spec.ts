import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedDecryptComponent } from './decrypt';
import { CryptService } from '../../../services/crypt';
import { MaterialModule } from '../../../modules/material/material';
import { SteganographyService } from '../../../services/steganography.service';
import { MatSnackBarModule } from '@angular/material/snack-bar';

describe('SharedDecryptComponent', () => {
  let component: SharedDecryptComponent;
  let fixture: ComponentFixture<SharedDecryptComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedDecryptComponent, BrowserAnimationsModule, MaterialModule, ReactiveFormsModule, MatSnackBarModule],
      providers: [CryptService, SteganographyService],
    }).compileComponents();

    fixture = TestBed.createComponent(SharedDecryptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize forms', () => {
    expect(component.firstFormGroup).toBeDefined();
  });
});
