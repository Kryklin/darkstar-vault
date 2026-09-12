import { Component, ViewChild } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { SharedEncryptComponent } from '../shared/encrypt/encrypt';
import ElectrumV2 from '../../../assets/electrum-v2.json';

@Component({
  selector: 'app-electrum-v2-encrypt',
  standalone: true,
  imports: [SharedEncryptComponent],
  template: `
    <app-shared-encrypt
      [protocolTitle]="protocolTitle"
      [protocolSummary]="protocolSummary"
      [protocolLink]="protocolLink"
      mnemonicLabel="Insert the Electrum V2 seed phrase"
      mnemonicPlaceholder="e.g. word1 word2 word3 ..."
      [randomWordsGenerator]="generateRandomWords"
      (generateRandom)="generateRandomWords()"
    ></app-shared-encrypt>
  `,
})
export class ElectrumV2Encrypt {
  @ViewChild(SharedEncryptComponent) sharedEncrypt!: SharedEncryptComponent;

  protocolTitle = ElectrumV2.title;
  protocolSummary = ElectrumV2.summary;
  protocolLink = ElectrumV2.link;

  allowedWordCountsValidator(allowedCounts: number[]): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value as string;
      if (!value) {
        return null;
      }
      const words = value.trim().split(/[ ,]+/).filter(Boolean);
      return allowedCounts.includes(words.length) ? null : { allowedWordCounts: { required: allowedCounts, actual: words.length } };
    };
  }

  generateRandomWords = () => {
    const words = ElectrumV2.words;
    let randomWords = '';
    // Electrum V2 standard is typically 12 words
    for (let i = 0; i < 12; i++) {
      randomWords += words[Math.floor(Math.random() * words.length)] + ' ';
    }
    this.sharedEncrypt.setMnemonic(randomWords.trim());
    return randomWords.trim();
  };
}
