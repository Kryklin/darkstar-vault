import { Component, ViewChild } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { SharedEncryptComponent } from '../shared/encrypt/encrypt';
import Slip39 from '../../../assets/slip39.json';

@Component({
  selector: 'app-slip39-encrypt',
  standalone: true,
  imports: [SharedEncryptComponent],
  template: `
    <app-shared-encrypt
      [protocolTitle]="protocolTitle"
      [protocolSummary]="protocolSummary"
      [protocolLink]="protocolLink"
      mnemonicLabel="Insert the SLIP39 seed phrase"
      mnemonicPlaceholder="e.g. word1 word2 word3 ..."
      [randomWordsGenerator]="generateRandomWords"
      (generateRandom)="generateRandomWords()"
    ></app-shared-encrypt>
  `,
})
export class Slip39Encrypt {
  @ViewChild(SharedEncryptComponent) sharedEncrypt!: SharedEncryptComponent;

  protocolTitle = Slip39.title;
  protocolSummary = Slip39.summary;
  protocolLink = Slip39.link;

  allowedWordCountsValidator(allowedCounts: number[]): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value as string;
      if (!value) {
        return null;
      }
      const words = value.trim().split(/[ ,]+/).filter(Boolean);
      // SLIP39 words count usually fixed or specific, passing dynamic if needed but here simple check
      return allowedCounts.includes(words.length) ? null : { allowedWordCounts: { required: allowedCounts, actual: words.length } };
    };
  }

  generateRandomWords = () => {
    const words = Slip39.words;
    let randomWords = '';
    // SLIP39 shares often come in 20 or 33 words. We'll generate 20 for this example.
    for (let i = 0; i < 20; i++) {
      randomWords += words[Math.floor(Math.random() * words.length)] + ' ';
    }
    this.sharedEncrypt.setMnemonic(randomWords.trim());
    return randomWords.trim();
  };
}
