import { Component } from '@angular/core';
import { SharedEncryptComponent } from '../shared/encrypt/encrypt';

@Component({
  selector: 'app-secure-notes-encrypt',
  standalone: true,
  imports: [SharedEncryptComponent],
  template: `
    <app-shared-encrypt
      protocolTitle="Secure Message"
      protocolSummary="Encrypt arbitrary text, passwords, or small files using Darkstar's defense-grade architecture."
      mnemonicLabel="Enter Secret Message"
      mnemonicPlaceholder="Type or paste your secret content here..."
    ></app-shared-encrypt>
  `,
})
export class SecureNotesEncrypt {}
