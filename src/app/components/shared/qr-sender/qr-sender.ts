import { Component, Input, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QrProtocolService } from '../../../services/qr-protocol.service';
import { MaterialModule } from '../../../modules/material/material';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-qr-sender',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './qr-sender.html',
  styles: `
    .qr-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
      margin: 20px 0;
    }
    .main-qr {
      width: 400px;
      height: 400px;
      image-rendering: pixelated;
    }
    .controls {
      display: flex;
      gap: 12px;
      margin-top: 16px;
      align-items: center;
    }
    .status-text {
      font-family: monospace;
      font-size: 14px;
      color: #333;
    }
  `,
})
export class QrSender implements OnInit, OnDestroy {
  @Input() payload = '';

  private qrService = inject(QrProtocolService);
  private timerSub?: Subscription;

  public chunks: string[] = [];
  public currentFrame = signal(0);
  public isPlaying = signal(false);
  public fps = signal(10);

  async ngOnInit() {
    if (this.payload) {
      try {
        this.chunks = await this.qrService.generateQrChunks(this.payload);
        // Start automatically if there is payload
        if (this.chunks.length > 0) {
          this.togglePlayback();
        }
      } catch (e: unknown) {
        console.error('Failed to init QR chunks', e);
      }
    }
  }

  ngOnDestroy() {
    this.stop();
  }

  togglePlayback() {
    if (this.isPlaying()) {
      this.stop();
    } else {
      this.play();
    }
  }

  play() {
    if (this.chunks.length === 0) return;

    this.isPlaying.set(true);
    const msPerFrame = Math.floor(1000 / this.fps());

    this.timerSub = interval(msPerFrame).subscribe(() => {
      this.currentFrame.update((f) => (f + 1) % this.chunks.length);
    });
  }

  stop() {
    this.isPlaying.set(false);
    if (this.timerSub) {
      this.timerSub.unsubscribe();
      this.timerSub = undefined;
    }
  }
}
