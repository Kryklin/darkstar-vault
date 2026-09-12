import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ElectrumV2Encrypt } from './encrypt';
import { MaterialModule } from '../../modules/material/material';

describe('ElectrumV2Encrypt', () => {
  let component: ElectrumV2Encrypt;
  let fixture: ComponentFixture<ElectrumV2Encrypt>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElectrumV2Encrypt, BrowserAnimationsModule, MaterialModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ElectrumV2Encrypt);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
