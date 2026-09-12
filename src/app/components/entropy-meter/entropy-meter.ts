import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntropyService, StrengthLevel } from '../../services/entropy.service';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-entropy-meter',
  standalone: true,
  imports: [CommonModule, MatProgressBarModule, MatIconModule, MatTooltipModule],
  templateUrl: './entropy-meter.html',
  styleUrls: ['./entropy-meter.scss'], // Fixed styleUrl -> styleUrls (plural) which might be the issue
})
export class EntropyMeter implements OnChanges {
  @Input() value = '';

  entropy = 0;
  strength: StrengthLevel = 'weak';
  crackTime = '';
  color: 'warn' | 'accent' | 'primary' = 'warn';
  progressValue = 0;
  label = 'Too Weak';

  private entropyService = inject(EntropyService);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) {
      this.calculate();
    }
  }

  private calculate() {
    this.entropy = this.entropyService.calculateEntropy(this.value);
    this.strength = this.entropyService.getStrengthLevel(this.entropy);
    this.crackTime = this.entropyService.getCrackTimeEstimate(this.entropy);

    if (!this.value) {
      this.color = 'warn';
      this.progressValue = 0;
      this.label = 'Enter Password';
      return;
    }

    switch (this.strength) {
      case 'weak':
        this.color = 'warn'; // Red
        this.progressValue = 25;
        this.label = 'Weak';
        break;
      case 'fair':
        this.color = 'accent'; // Yellow/Orange default angular accent
        this.progressValue = 50;
        this.label = 'Fair';
        break;
      case 'strong':
        this.color = 'primary'; // Blue/Green
        this.progressValue = 75;
        this.label = 'Strong';
        break;
      case 'defense-grade':
        this.color = 'primary';
        this.progressValue = 100;
        this.label = 'Defense-Grade';
        break;
    }
  }

  // Helper for custom CSS colors if Material palette isn't precise enough
  get cssColorClass(): string {
    return `strength-${this.strength}`;
  }
}
