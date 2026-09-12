import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Encrypt } from './encrypt';
import { MaterialModule } from '../../modules/material/material';

describe('BIP39 Encrypt', () => {
  let component: Encrypt;
  let fixture: ComponentFixture<Encrypt>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Encrypt, BrowserAnimationsModule, MaterialModule],
    }).compileComponents();

    fixture = TestBed.createComponent(Encrypt);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
