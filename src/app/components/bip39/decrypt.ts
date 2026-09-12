import { Component } from '@angular/core';
import { SharedDecryptComponent } from '../shared/decrypt/decrypt';
import BIP39 from '../../../assets/BIP39.json';

@Component({
  selector: 'app-decrypt',
  standalone: true,
  imports: [SharedDecryptComponent],
  template: ` <app-shared-decrypt [protocolTitle]="protocolTitle" [protocolSummary]="protocolSummary" [protocolLink]="protocolLink"></app-shared-decrypt> `,
})
export class Decrypt {
  protocolTitle = BIP39.title;
  protocolSummary = BIP39.summary;
  protocolLink = BIP39.link;
}
