import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QrSender } from './qr-sender';

describe('QrSender', () => {
  let component: QrSender;
  let fixture: ComponentFixture<QrSender>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QrSender],
    }).compileComponents();

    fixture = TestBed.createComponent(QrSender);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
