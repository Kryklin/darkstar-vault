import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Decrypt } from './decrypt';
import { MaterialModule } from '../../modules/material/material';

describe('BIP39 Decrypt', () => {
  let component: Decrypt;
  let fixture: ComponentFixture<Decrypt>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Decrypt, BrowserAnimationsModule, MaterialModule],
    }).compileComponents();

    fixture = TestBed.createComponent(Decrypt);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
