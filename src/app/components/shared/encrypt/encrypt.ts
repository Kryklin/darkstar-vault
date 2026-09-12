import { Component, EventEmitter, Input, Output, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MaterialModule } from '../../../modules/material/material';
import { CryptService } from '../../../services/crypt';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SteganographyService } from '../../../services/steganography.service';
import { StealthMode, StealthOptions } from '../../../services/generators/types';

import { PaperWalletService } from '../../../services/paper-wallet.service';
import { QrSender } from '../qr-sender/qr-sender';
import { VaultService } from '../../../services/vault';

@Component({
  selector: 'app-shared-encrypt',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TextFieldModule, MaterialModule, QrSender],
  templateUrl: './encrypt.html',
  styleUrl: './encrypt.scss',
})
export class SharedEncryptComponent implements OnInit {
  @Input() protocolTitle = '';
  @Input() protocolSummary = '';
  @Input() protocolLink = '';
  @Input() mnemonicLabel = 'Insert your recovery phrase';
  @Input() mnemonicPlaceholder = 'e.g. word1 word2...';
  @Input() mnemonicValidator: ValidatorFn | null = null;
  @Input() randomWordsGenerator: (() => string) | null = null;

  @Output() generateRandom = new EventEmitter<void>();

  firstFormGroup: FormGroup;

  showResult = false;
  encryptedData = '';

  stealthMode: StealthMode | 'standard' = 'standard';
  stealthModes = [
    { value: 'standard', label: 'Standard (Text)' },
    { value: 'log', label: 'System Log (.log)' },
    { value: 'csv', label: 'Dataset (.csv)' },
    { value: 'json', label: 'Configuration (.json)' },
    { value: 'image', label: 'Image (PNG)' },
    { value: 'audio', label: 'Audio (WAV)' },
  ];
  stealthNoiseLevel = 0.5;
  selectedCoverImage: File | null = null;
  selectedCoverAudio: File | null = null;
  showQrSender = false;
  useHardwareId = false;
  vaultService = inject(VaultService);

  private _formBuilder = inject(FormBuilder);
  private cryptService = inject(CryptService);
  private steganographyService = inject(SteganographyService);
  private paperWalletService = inject(PaperWalletService);
  private clipboard = inject(Clipboard);
  private snackBar = inject(MatSnackBar);

  constructor() {
    this.firstFormGroup = this._formBuilder.group({
      firstCtrl: ['', [Validators.required]],
    });
  }

  ngOnInit() {
    if (this.mnemonicValidator) {
      this.firstFormGroup.controls['firstCtrl'].addValidators(this.mnemonicValidator);
      this.firstFormGroup.controls['firstCtrl'].updateValueAndValidity();
    }
  }

  // Called by parent to set the mnemonic value (e.g. from random generator)
  setMnemonic(mnemonic: string) {
    this.firstFormGroup.controls['firstCtrl'].setValue(mnemonic);
  }

  async onSubmit() {
    if (this.firstFormGroup.valid) {
      const mnemonic = this.firstFormGroup.controls['firstCtrl'].value;

      if (!this.vaultService.isUnlocked()) {
        this.snackBar.open('Vault is locked. Cannot retrieve ML-KEM key.', 'Close', { duration: 3000 });
        return;
      }

      const id = this.vaultService.identity();
      if (!id || !id.pqcPublicKey) {
        this.snackBar.open('No Vault Identity or ML-KEM-1024 public key found.', 'Close', { duration: 3000 });
        return;
      }

      // Convert Base64 PQC Public Key to Hex for the engine payload
      const rawBody = atob(id.pqcPublicKey);
      let pkHex = '';
      for (let i = 0; i < rawBody.length; i++) {
        const hex = rawBody.charCodeAt(i).toString(16);
        pkHex += hex.length === 2 ? hex : '0' + hex;
      }

      let hwid: string | undefined = undefined;

      if (this.useHardwareId) {
        const hwId = await this.vaultService.getHardwareId();
        if (hwId) {
          hwid = hwId;
        } else {
          this.snackBar.open('Failed to retrieve Machine Hardware ID from system.', 'Close', { duration: 3000 });
          return;
        }
      }

      const { encryptedData } = await this.cryptService.encrypt(mnemonic, pkHex, hwid);

      this.encryptedData = encryptedData;
      this.showResult = true;
    }
  }

  copyToClipboard(text: string) {
    this.clipboard.copy(text);
    this.snackBar.open('Copied to clipboard!', 'Close', {
      duration: 2000,
    });
  }

  onGenerateRandomWords() {
    this.generateRandom.emit();
  }

  onCoverImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedCoverImage = input.files[0];
    }
  }

  onCoverAudioSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedCoverAudio = input.files[0];
    }
  }

  downloadFile() {
    if (this.stealthMode === 'standard') {
      this.downloadBlob(this.encryptedData, 'encrypted_data.txt', 'text/plain');
    } else if (this.stealthMode === 'image') {
      if (!this.selectedCoverImage) {
        this.snackBar.open('Please select a cover image first.', 'Close', { duration: 3000 });
        return;
      }
      this.steganographyService
        .hideInImage(this.encryptedData, this.selectedCoverImage)
        .then((blob) => {
          this.downloadBlobObj(blob, 'stego_image.png');
        })
        .catch((err) => {
          console.error(err);
          this.snackBar.open('Failed to create stego image.', 'Close', { duration: 3000 });
        });
    } else {
      const options: StealthOptions = { noiseLevel: this.stealthNoiseLevel };

      const processAndDownload = (buffer?: ArrayBuffer) => {
        if (buffer) options.coverFile = buffer;

        const content = this.steganographyService.transmute(this.encryptedData, this.stealthMode as StealthMode, options);

        let filename = 'system_debug.log';
        let mime = 'text/plain';

        if (this.stealthMode === StealthMode.CSV) {
          filename = 'dataset.csv';
          mime = 'text/csv';
        } else if (this.stealthMode === StealthMode.JSON) {
          filename = 'config.json';
          mime = 'application/json';
        } else if (this.stealthMode === ('audio' as StealthMode)) {
          filename = 'audio_track.wav';
          // Decode base64 content returned by generator
          // For downloadBlob we expect string context, but for binary we might need blob logic
          // The generator returns Base64 string for audio.
          // downloadBlob creates Blob from content(string).
          // We need to decode base64 to binary for the blob.

          // Helper to convert base64 to blob
          const byteCharacters = atob(content);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          this.downloadBlobObj(new Blob([byteArray], { type: 'audio/wav' }), filename);
          return;
        }

        this.downloadBlob(content, filename, mime);
      };

      if (this.stealthMode === 'audio' && this.selectedCoverAudio) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            processAndDownload(e.target.result as ArrayBuffer);
          }
        };
        reader.readAsArrayBuffer(this.selectedCoverAudio);
      } else {
        processAndDownload();
      }
    }
  }

  downloadPaperWallet() {
    this.paperWalletService.generate(this.encryptedData, '', {
      protocolTitle: this.protocolTitle,
      protocolSummary: this.protocolSummary,
    });
  }

  private downloadBlob(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  private downloadBlobObj(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  reset() {
    this.firstFormGroup.reset();
    this.showResult = false;
    this.encryptedData = '';
    this.stealthMode = 'standard';
    this.stealthNoiseLevel = 0.5;
    this.showQrSender = false;
  }
}
