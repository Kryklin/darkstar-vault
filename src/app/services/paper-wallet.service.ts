import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import * as QRCode from 'qrcode';

export interface PaperWalletMetadata {
  protocolTitle: string;
  protocolSummary: string;
  noiseLevel?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PaperWalletService {
  async generate(encryptedData: string, _reverseKey: string, metadata: PaperWalletMetadata): Promise<void> {
    const timestamp = Date.now();
    await this.generateDocument('Part 1: Encrypted Payload', encryptedData, metadata, `darkstar-passport-payload-${timestamp}.pdf`);
  }

  private async generateDocument(title: string, content: string, metadata: PaperWalletMetadata, filename: string): Promise<void> {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = 0;

    const addHeader = () => {
      doc.setFillColor(33, 33, 33); // Dark background
      doc.rect(0, 0, pageWidth, 40, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text('Darkstar Paper Wallet', margin, 20);

      doc.setFontSize(12);
      doc.setTextColor(200, 200, 200);
      doc.text(`Protocol: ${metadata.protocolTitle}`, margin, 32);

      doc.setFontSize(10);
      doc.text(new Date().toLocaleString(), pageWidth - margin, 20, { align: 'right' });

      // Reset for content
      doc.setTextColor(0, 0, 0);
      y = 60;
    };

    addHeader();

    // Section Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, y);
    y += 10;

    // --- Generate and Document QR Codes ---
    // If the content is too large for a single QR code, we split it into multiple QR codes.
    // A standard QR code can safely hold dense data, but for better scannability via webcam,
    // we'll use a chunk size of 500 characters.
    const CHUNK_SIZE = 500;
    const numChunks = Math.ceil(content.length / CHUNK_SIZE);

    for (let i = 0; i < numChunks; i++) {
      const chunk = content.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      try {
        // Format for compatibility with the QrReceiver scanner component
        const qrContent = `DS_QR|${i}|${numChunks}|${chunk}`;

        const qrDataUrl = await QRCode.toDataURL(qrContent, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 200,
        });

        const qrWidth = 40; // Rendered width on PDF in mm

        // Layout QR codes gracefully (maybe next to each other or wrapping)
        // For simplicity, we'll draw them sequentially downwards, or in a grid
        // Let's draw up to 3 side-by-side if there are multiple.
        const codesPerRow = 4;
        const xPos = margin + (i % codesPerRow) * (qrWidth + 5);

        // Check if we need to move to a new line of QR codes
        if (i > 0 && i % codesPerRow === 0) {
          y += qrWidth + 5;
        }

        // Check if we need a new page for QR codes
        if (y + qrWidth > pageHeight - margin) {
          doc.addPage();
          addHeader();
        }

        doc.addImage(qrDataUrl, 'PNG', xPos, y, qrWidth, qrWidth);

        // If it's the last QR code in the loop, advance Y coordinate past the row
        if (i === numChunks - 1) {
          y += qrWidth + 10;
        }
      } catch (e) {
        console.error('QR Gen Failed', e);
        if (i === numChunks - 1) {
          y += 10;
        }
      }
    }

    // --- Write Raw Text Content ---
    doc.setFontSize(10);
    doc.setFont('courier', 'normal');

    // Add secondary "Raw Text" header
    doc.setFont('helvetica', 'bold');
    doc.text('Raw Text Backup:', margin, y);
    y += 7;
    doc.setFont('courier', 'normal');

    const splitText = doc.splitTextToSize(content, contentWidth);
    const lineHeight = 5;

    for (const line of splitText) {
      if (y + lineHeight > pageHeight - margin - 50) {
        // Keep space for footer
        doc.addPage();
        addHeader();
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }

    y += 10; // Spacing after section

    // --- Footer / Instructions ---
    if (y + 50 > pageHeight - margin) {
      doc.addPage();
      addHeader();
    }

    y += 10;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);

    const instructions = [
      'IMPORTANT RECOVERY INSTRUCTIONS:',
      `1. This document contains ${title}.`,
      "2. To recover, you will need this 'Encrypted Payload' and your Encryption Password or Vault Key.",
      '3. Your Entropy/Master Password is NOT printed here.',
      '4. Keep this document in a physically secure location (e.g., fireproof safe).',
      '5. Do not share this document.',
    ];

    for (const line of instructions) {
      if (y + 5 > pageHeight - margin) {
        doc.addPage();
        addHeader();
      }
      doc.text(line, margin, y);
      y += 5;
    }

    // Save
    doc.save(filename);
  }
}
