import { Component } from '@angular/core';
import { SharedDecryptComponent } from '../shared/decrypt/decrypt';

@Component({
  selector: 'app-secure-notes-decrypt',
  standalone: true,
  imports: [SharedDecryptComponent],
  template: ` <app-shared-decrypt protocolTitle="Secure Message Decryption" protocolSummary="Decrypt your secure messages."></app-shared-decrypt> `,
})
export class SecureNotesDecrypt {}
