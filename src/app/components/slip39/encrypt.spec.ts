import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Slip39Encrypt } from './encrypt';
import { MaterialModule } from '../../modules/material/material';

describe('Slip39Encrypt', () => {
  let component: Slip39Encrypt;
  let fixture: ComponentFixture<Slip39Encrypt>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Slip39Encrypt, BrowserAnimationsModule, MaterialModule],
    }).compileComponents();

    fixture = TestBed.createComponent(Slip39Encrypt);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
