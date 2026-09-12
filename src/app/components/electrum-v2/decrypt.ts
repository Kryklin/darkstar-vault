import { Component } from '@angular/core';
import { SharedDecryptComponent } from '../shared/decrypt/decrypt';
import ElectrumV2 from '../../../assets/electrum-v2.json';

@Component({
  selector: 'app-electrum-v2-decrypt',
  standalone: true,
  imports: [SharedDecryptComponent],
  template: ` <app-shared-decrypt [protocolTitle]="protocolTitle" [protocolSummary]="protocolSummary" [protocolLink]="protocolLink"></app-shared-decrypt> `,
})
export class ElectrumV2Decrypt {
  protocolTitle = ElectrumV2.title;
  protocolSummary = ElectrumV2.summary;
  protocolLink = ElectrumV2.link;
}
