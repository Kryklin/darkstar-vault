import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VaultService, VaultAttachment } from '../../../services/vault';
import { VaultFileService } from '../../../services/vault-file.service';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-vault-files',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './vault-files.component.html',
  styleUrls: ['./vault-files.component.scss'],
})
export class VaultFilesComponent {
  vaultService = inject(VaultService);
  fileService = inject(VaultFileService);
  snackBar = inject(MatSnackBar);

  files = this.vaultService.standaloneFiles;
  searchTerm = signal('');

  filteredFiles = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.files();
    return this.files().filter((f) => f.name.toLowerCase().includes(term));
  });

  isDragging = signal(false);

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  async onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    if (event.dataTransfer?.files) {
      await this.handleFiles(event.dataTransfer.files);
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      await this.handleFiles(input.files);
    }
  }

  private async handleFiles(fileList: FileList) {
    const password = this.vaultService.getMasterKey();
    if (!password) return;

    for (const file of fileList) {
      try {
        const pk = this.vaultService.identity()?.pqcPublicKey;
        const attachment = await this.fileService.uploadFile(file, password, pk);
        this.vaultService.addStandaloneFile(attachment);
        this.snackBar.open(`Encrypted: ${file.name}`, 'OK', { duration: 2000 });
      } catch (err) {
        console.error('File upload failed', err);
        this.snackBar.open(`Failed to encrypt: ${file.name}`, 'Close', { duration: 3000 });
      }
    }
  }

  async downloadFile(file: VaultAttachment) {
    const password = this.vaultService.getMasterKey();
    if (!password) return;
    await this.fileService.downloadFile(file, password);
  }

  async deleteFile(file: VaultAttachment) {
    await this.vaultService.deleteStandaloneFile(file.id);
    this.snackBar.open('File deleted from vault.', 'OK', { duration: 2000 });
  }

  getFileIcon(type: string): string {
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'videocam';
    if (type.startsWith('audio/')) return 'audiotrack';
    if (type === 'application/pdf') return 'picture_as_pdf';
    if (type.includes('zip') || type.includes('compressed')) return 'archive';
    return 'insert_drive_file';
  }
}
