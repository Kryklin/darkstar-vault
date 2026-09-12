import { Component } from '@angular/core';
import { SharedDecryptComponent } from '../shared/decrypt/decrypt';
import Slip39 from '../../../assets/slip39.json';

@Component({
  selector: 'app-slip39-decrypt',
  standalone: true,
  imports: [SharedDecryptComponent],
  template: ` <app-shared-decrypt [protocolTitle]="protocolTitle" [protocolSummary]="protocolSummary" [protocolLink]="protocolLink"></app-shared-decrypt> `,
})
export class Slip39Decrypt {
  protocolTitle = Slip39.title;
  protocolSummary = Slip39.summary;
  protocolLink = Slip39.link;
}
