import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Slip39Decrypt } from './decrypt';
import { MaterialModule } from '../../modules/material/material';

describe('Slip39Decrypt', () => {
  let component: Slip39Decrypt;
  let fixture: ComponentFixture<Slip39Decrypt>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Slip39Decrypt, BrowserAnimationsModule, MaterialModule],
    }).compileComponents();

    fixture = TestBed.createComponent(Slip39Decrypt);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
