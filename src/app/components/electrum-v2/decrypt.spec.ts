import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ElectrumV2Decrypt } from './decrypt';
import { MaterialModule } from '../../modules/material/material';

describe('ElectrumV2Decrypt', () => {
  let component: ElectrumV2Decrypt;
  let fixture: ComponentFixture<ElectrumV2Decrypt>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElectrumV2Decrypt, BrowserAnimationsModule, MaterialModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ElectrumV2Decrypt);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
