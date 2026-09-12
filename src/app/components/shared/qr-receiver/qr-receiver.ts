import { Component, OnInit, OnDestroy, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Html5Qrcode } from 'html5-qrcode';
import { QrProtocolService } from '../../../services/qr-protocol.service';
import { MaterialModule } from '../../../modules/material/material';

@Component({
  selector: 'app-qr-receiver',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './qr-receiver.html',
  styles: `
    .scanner-container {
      position: relative;
      width: 100%;
      max-width: 500px;
      margin: 0 auto;
      border-radius: 12px;
      overflow: hidden;
      background: #000;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }
    #qr-reader {
      width: 100%;
      border: none !important;
    }
    .scan-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(0, 0, 0, 0.7);
      padding: 16px;
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .progress-bar {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: #00c853;
      transition: width 0.2s ease;
    }
    .cam-controls {
      margin-top: 16px;
      display: flex;
      gap: 12px;
      justify-content: center;
    }
  `,
})
export class QrReceiver implements OnInit, OnDestroy {
  @Output() payloadReceived = new EventEmitter<string>();

  private qrService = inject(QrProtocolService);
  private html5QrCode?: Html5Qrcode;

  public isScanning = signal(false);
  public scanError = signal<string | null>(null);
  public progress = signal(0);

  // State for reassembly
  private expectedTotal = 0;
  private receivedChunks = new Map<number, string>();

  ngOnInit() {
    // Defer instantiation slightly to ensure DOM is ready
    setTimeout(() => {
      this.html5QrCode = new Html5Qrcode('qr-reader');
    }, 100);
  }

  ngOnDestroy() {
    this.stopScanning();
  }

  public async startScanning() {
    if (!this.html5QrCode) return;

    this.scanError.set(null);
    this.progress.set(0);
    this.receivedChunks.clear();
    this.expectedTotal = 0;

    try {
      this.isScanning.set(true);
      await this.html5QrCode.start(
        { facingMode: 'environment' }, // Prefer back camera on mobile/laptops
        {
          fps: 15,
          qrbox: { width: 300, height: 300 },
        },
        this.onScanSuccess.bind(this),
        this.onScanFailure.bind(this),
      );
    } catch (err) {
      this.isScanning.set(false);
      this.scanError.set(`Camera initialization failed: ${err}`);
    }
  }

  public async stopScanning() {
    if (this.html5QrCode && this.isScanning()) {
      try {
        await this.html5QrCode.stop();
        this.isScanning.set(false);
      } catch (err) {
        console.error('Failed to stop scanner', err);
      }
    }
  }

  private onScanSuccess(decodedText: string, _decodedResult: unknown) {
    const chunk = this.qrService.parseScannedChunk(decodedText);
    if (!chunk) return; // Not a Darkstar protocol code

    if (this.expectedTotal === 0) {
      this.expectedTotal = chunk.total;
    } else if (this.expectedTotal !== chunk.total) {
      // Received a chunk from a different payload sequence, ignore.
      return;
    }

    if (!this.receivedChunks.has(chunk.index)) {
      this.receivedChunks.set(chunk.index, chunk.data);

      // Update progress
      const currentProgress = (this.receivedChunks.size / this.expectedTotal) * 100;
      this.progress.set(currentProgress);

      // Check for completion
      if (this.receivedChunks.size === this.expectedTotal) {
        this.finalizePayload();
      }
    }
  }

  private onScanFailure(_error: unknown) {
    // Expected to fail frequently on frames without QRs. Ignore.
  }

  private finalizePayload() {
    this.stopScanning();

    let finalPayload = '';
    for (let i = 0; i < this.expectedTotal; i++) {
      finalPayload += this.receivedChunks.get(i) || '';
    }

    this.payloadReceived.emit(finalPayload);
  }
}
