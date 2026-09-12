import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QrReceiver } from './qr-receiver';

describe('QrReceiver', () => {
  let component: QrReceiver;
  let fixture: ComponentFixture<QrReceiver>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QrReceiver],
    }).compileComponents();

    fixture = TestBed.createComponent(QrReceiver);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
