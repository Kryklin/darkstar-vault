import { Component, ViewChild } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { SharedEncryptComponent } from '../shared/encrypt/encrypt';
import BIP39 from '../../../assets/BIP39.json';

@Component({
  selector: 'app-encrypt',
  standalone: true,
  imports: [SharedEncryptComponent],
  template: `
    <app-shared-encrypt
      [protocolTitle]="protocolTitle"
      [protocolSummary]="protocolSummary"
      [protocolLink]="protocolLink"
      [mnemonicValidator]="mnemonicValidator"
      mnemonicLabel="Insert your BIP39 recovery phrase"
      mnemonicPlaceholder="e.g. army van defense carry..."
      [randomWordsGenerator]="generateRandomWords"
      (generateRandom)="generateRandomWords()"
    ></app-shared-encrypt>
  `,
})
export class Encrypt {
  @ViewChild(SharedEncryptComponent) sharedEncrypt!: SharedEncryptComponent;

  protocolTitle = BIP39.title;
  protocolSummary = BIP39.summary;
  protocolLink = BIP39.link;

  mnemonicValidator = this.allowedWordCountsValidator([12, 15, 18, 21, 24]);

  allowedWordCountsValidator(allowedCounts: number[]): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value as string;
      if (!value) {
        return null;
      }
      const words = value.trim().split(/[ ,]+/).filter(Boolean);
      const allowed = allowedCounts as number[];
      return allowed.includes(words.length) ? null : { allowedWordCounts: { required: allowedCounts, actual: words.length } };
    };
  }

  generateRandomWords = () => {
    const words = BIP39.words;
    const array = new Uint32Array(24);
    window.crypto.getRandomValues(array);

    let randomWords = '';
    for (let i = 0; i < 24; i++) {
      const index = array[i] % words.length;
      randomWords += words[index] + ' ';
    }
    this.sharedEncrypt.setMnemonic(randomWords.trim());
    return randomWords.trim(); // Just in case we need to return it, though we set it directly via ViewChild
  };
}
