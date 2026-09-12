import { Component, ElementRef, ViewChild, Output, EventEmitter, inject, OnInit, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CryptService } from '../../../services/crypt';
import { VaultService } from '../../../services/vault';
import { MatIconModule } from '@angular/material/icon';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { ZorkEngine } from './zork-engine';
import packageJson from '../../../../../package.json';
import { Capacitor } from '@capacitor/core';

interface TerminalLine {
  text: string;
  isCommand: boolean;
  isError?: boolean;
  isSuccess?: boolean;
}

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, DragDropModule],
  templateUrl: './terminal.html',
  styleUrls: ['./terminal.scss'],
})
export class TerminalComponent implements OnInit, AfterViewChecked {
  @Output() terminalClosed = new EventEmitter<void>();
  @ViewChild('terminalInput') terminalInput!: ElementRef<HTMLInputElement>;
  @ViewChild('terminalBody') terminalBody!: ElementRef<HTMLDivElement>;

  cryptService = inject(CryptService);
  vaultService = inject(VaultService);

  version = packageJson.version;
  isVisible = false;
  isMaximized = true; // start maximized as requested
  currentInput = '';
  history: TerminalLine[] = [];
  commandHistory: string[] = [];
  historyIndex = -1;

  isGameActive = false;
  zorkEngine: ZorkEngine | null = null;
  readonly isNative = Capacitor.isNativePlatform();

  ngOnInit() {
    this.isVisible = true;
    if (this.isNative) {
      this.isMaximized = true;
    }
    setTimeout(() => this.focusInput(), 100);
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  closeTerminal() {
    this.isVisible = false;
    setTimeout(() => {
      this.terminalClosed.emit();
    }, 300); // Wait for transition
  }

  toggleMaximize() {
    this.isMaximized = !this.isMaximized;
    setTimeout(() => this.focusInput(), 50);
  }

  minimizeTerminal() {
    // Treat minimize as close to simply hide the console from the screen
    this.closeTerminal();
  }

  focusInput(event?: Event) {
    if (event) event.stopPropagation();
    if (this.terminalInput) {
      this.terminalInput.nativeElement.focus();
    }
  }

  private scrollToBottom() {
    if (this.terminalBody) {
      try {
        this.terminalBody.nativeElement.scrollTop = this.terminalBody.nativeElement.scrollHeight;
      } catch {
        // ignore scroll errors
      }
    }
  }

  async handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const command = this.currentInput.trim();
      this.currentInput = '';

      if (command) {
        this.history.push({ text: command, isCommand: true });

        if (this.isGameActive) {
          await this.handleGameCommand(command);
        } else {
          this.commandHistory.push(command);
          this.historyIndex = this.commandHistory.length;
          await this.processCommand(command);
        }
      }
    } else if (event.key === 'ArrowUp') {
      if (this.isGameActive) return;
      event.preventDefault();
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this.currentInput = this.commandHistory[this.historyIndex];
      }
    } else if (event.key === 'ArrowDown') {
      if (this.isGameActive) return;
      event.preventDefault();
      if (this.historyIndex < this.commandHistory.length - 1) {
        this.historyIndex++;
        this.currentInput = this.commandHistory[this.historyIndex];
      } else {
        this.historyIndex = this.commandHistory.length;
        this.currentInput = '';
      }
    } else if (event.key === 'c' && event.ctrlKey) {
      // Ctrl+C cancellation
      this.history.push({ text: this.currentInput + '^C', isCommand: true });
      this.currentInput = '';
      if (this.isGameActive) {
        this.isGameActive = false;
        this.history.push({ text: 'Exiting ZORK session...', isCommand: false });
      }
    }
  }

  private async handleGameCommand(input: string) {
    if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') {
      this.isGameActive = false;
      this.history.push({ text: 'You step out of the shadows. Exiting ZORK...', isCommand: false });
      return;
    }

    const results = this.zorkEngine!.processInput(input);
    results.forEach((line) => {
      this.history.push({ text: line, isCommand: false });
    });
  }

  private async processCommand(commandLine: string) {
    const args = commandLine.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    switch (cmd) {
      case 'help':
        this.history.push({ text: 'Available commands:', isCommand: false });
        this.history.push({ text: '  help      - Show this message', isCommand: false });
        this.history.push({ text: '  clear     - Clear terminal screen', isCommand: false });
        this.history.push({ text: '  whoami    - Display current user context', isCommand: false });
        this.history.push({ text: '  identity  - Display loaded cryptographic identity', isCommand: false });
        this.history.push({ text: '  encrypt   - Obfuscate text (encrypt <message> [--hardware-id | -hw])', isCommand: false });
        this.history.push({ text: '  decrypt   - De-obfuscate text (decrypt <payload> <reverseKey> [--hardware-id | -hw])', isCommand: false });
        this.history.push({ text: '  zork      - Enter the Darkstar Text Adventure', isCommand: false });
        this.history.push({ text: '  exit/quit - Close terminal', isCommand: false });
        break;

      case 'clear':
        this.history = [];
        break;

      case 'zork':
        this.isGameActive = true;
        this.zorkEngine = new ZorkEngine();
        this.history.push({ text: 'Initializing ZORK Engine [Darkstar Variant]...', isCommand: false });
        this.handleGameCommand('look');
        break;

      case 'whoami':
        this.history.push({ text: 'guest', isCommand: false });
        break;

      case 'identity':
        if (!this.vaultService.hasVault()) {
          this.history.push({ text: 'Status: NO_IDENTITY_LOADED', isCommand: false, isError: true });
          this.history.push({ text: 'Please unlock the Secure Vault to load identity.', isCommand: false });
        } else {
          try {
            const vaultId = this.vaultService.identity();
            let fingerprint = 'unknown';
            if (vaultId && vaultId.publicKey && vaultId.publicKey.x) {
              fingerprint = vaultId.publicKey.x.substring(0, 32);
            }
            this.history.push({ text: 'Status: IDENTITY_LOADED', isCommand: false, isSuccess: true });
            this.history.push({ text: `Vault Fingerprint: ${fingerprint}...`, isCommand: false });
          } catch (e) {
            const err = e as Error;
            this.history.push({ text: 'Error retrieving public fingerprint: ' + err.message, isCommand: false, isError: true });
          }
        }
        break;

      case 'encrypt':
        await this.handleEncrypt(args);
        break;

      case 'decrypt':
        await this.handleDecrypt(args);
        break;

      case 'exit':
      case 'quit':
        this.closeTerminal();
        break;

      default:
        this.history.push({ text: `darkstar: ${cmd}: command not found`, isCommand: false, isError: true });
    }
  }

  private async handleEncrypt(args: string[]) {
    if (!this.vaultService.hasVault()) {
      this.history.push({ text: 'Error: Secure Vault must be unlocked to encrypt.', isCommand: false, isError: true });
      return;
    }

    if (args.length < 2) {
      this.history.push({ text: 'Usage: encrypt <message> [--hardware-id | -hw]', isCommand: false });
      return;
    }

    let useHardwareId = false;
    let messageArgs = args.slice(1);

    // Look for hardware ID flags (remove them from the message body)
    const hwFlags = ['--hardware-id', '-hw'];
    messageArgs = messageArgs.filter((arg) => {
      if (hwFlags.includes(arg.toLowerCase())) {
        useHardwareId = true;
        return false;
      }
      return true;
    });

    if (messageArgs.length === 0) {
      this.history.push({ text: 'Usage: encrypt <message> [--hardware-id | -hw]', isCommand: false });
      return;
    }

    const message = messageArgs.join(' ');
    try {
      this.history.push({ text: 'Encrypting payload with Master Identity Obfuscation Engine...', isCommand: false });

      let password = this.vaultService.getMasterKey()!;
      const id = this.vaultService.identity();
      if (id && id.privateKey && id.privateKey.d) {
        password += id.privateKey.d;
      } else {
        throw new Error('Vault identity missing. Cannot generate bound signature.');
      }

      if (useHardwareId) {
        this.history.push({ text: 'Applying Machine Hardware ID binding...', isCommand: false });
        const hwId = await this.vaultService.getHardwareId();
        if (hwId) {
          password += hwId;
        } else {
          throw new Error('Failed to retrieve Machine Hardware ID');
        }
      }

      const { encryptedData, reverseKey } = await this.cryptService.encrypt(message, password);

      this.history.push({ text: '--- OBFUSCATED PAYLOAD ---', isCommand: false, isSuccess: true });
      this.history.push({ text: encryptedData, isCommand: false });
      this.history.push({ text: '--- REVERSE KEY (REQUIRED FOR DECRYPTION) ---', isCommand: false, isSuccess: true });
      this.history.push({ text: reverseKey, isCommand: false });
      this.history.push({ text: '-------------------------', isCommand: false, isSuccess: true });
    } catch (e) {
      const err = e as Error;
      this.history.push({ text: 'Encryption failed: ' + err.message, isCommand: false, isError: true });
    }
  }

  private async handleDecrypt(args: string[]) {
    if (!this.vaultService.hasVault()) {
      this.history.push({ text: 'Error: Secure Vault must be unlocked to decrypt.', isCommand: false, isError: true });
      return;
    }

    if (args.length < 3) {
      this.history.push({ text: 'Usage: decrypt <payload> <reverseKey> [--hardware-id | -hw]', isCommand: false });
      return;
    }

    let useHardwareId = false;
    let cmdArgs = args.slice(1);

    // Look for hardware ID flags (remove them from the arg array)
    const hwFlags = ['--hardware-id', '-hw'];
    cmdArgs = cmdArgs.filter((arg) => {
      if (hwFlags.includes(arg.toLowerCase())) {
        useHardwareId = true;
        return false;
      }
      return true;
    });

    if (cmdArgs.length < 2) {
      this.history.push({ text: 'Usage: decrypt <payload> <reverseKey> [--hardware-id | -hw]', isCommand: false });
      return;
    }

    const reverseKey = cmdArgs.pop()!;
    const payload = cmdArgs.join(' ');

    try {
      this.history.push({ text: 'Attempting de-obfuscation with loaded identities...', isCommand: false });

      let password = this.vaultService.getMasterKey()!;
      const id = this.vaultService.identity();
      if (id && id.privateKey && id.privateKey.d) {
        password += id.privateKey.d;
      } else {
        throw new Error('Vault identity missing. Cannot generate bound signature.');
      }

      if (useHardwareId) {
        this.history.push({ text: 'Verifying Machine Hardware ID binding...', isCommand: false });
        const hwId = await this.vaultService.getHardwareId();
        if (hwId) {
          password += hwId;
        } else {
          throw new Error('Failed to retrieve Machine Hardware ID');
        }
      }

      const decryptedResult = await this.cryptService.decrypt(payload, reverseKey, password);

      this.history.push({ text: '--- DECRYPTED MESSAGE ---', isCommand: false, isSuccess: true });
      this.history.push({ text: decryptedResult.decrypted, isCommand: false });
      this.history.push({ text: '-------------------------', isCommand: false, isSuccess: true });
    } catch (e) {
      const err = e as Error;
      this.history.push({ text: 'Decryption failed: ' + err.message, isCommand: false, isError: true });
    }
  }
}
