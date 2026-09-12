interface BiometricResponse {
  success: boolean;
  data?: {
    rawId: number[];
    [key: string]: unknown;
  };
  error?: string;
}

interface ElectronAPI {
  minimize(): void;
  maximize(): void;
  close(): void;
  onUpdateStatus(callback: (status: { status: string; error?: string }) => void): void;
  onInitiateUpdateCheck(callback: () => void): void;
  checkForUpdates(): void;
  restartAndInstall(): void;
  setVersionLock(locked: boolean): void;
  createShortcut(target: 'desktop' | 'start-menu'): Promise<{ success: boolean; message: string }>;
  resetApp(): Promise<void>;
  safeStorageEncrypt(text: string): Promise<string>;
  safeStorageDecrypt(base64: string): Promise<string>;
  safeStorageAvailable(): Promise<boolean>;
  dArxEncrypt(payload: string, keyHex: string, engine: string, hwid?: string): Promise<unknown>;
  dArxDecrypt(data: string, rk: string, keyOrPass: string, engine: string, hwid?: string): Promise<unknown>;
  dArxCheckEngine(): Promise<{ operational: boolean; binaryPath?: string; name?: string; error?: string }>;
  dArxFetchEngine(): Promise<{ success: boolean; binaryPath?: string; error?: string }>;

  vaultEnsureDir(): Promise<boolean>;
  vaultSaveFile(filename: string, buffer: Uint8Array): Promise<boolean>;
  vaultReadFile(filename: string): Promise<Uint8Array>;
  vaultDeleteFile(filename: string): Promise<boolean>;
  vaultListFiles(): Promise<string[]>;
  vaultVerifyTotp(token: string, secret: string): Promise<boolean>;
  vaultGenerateTotp(): Promise<{ secret: string; uri: string }>;
  getDefaultBackupPath(): Promise<string>;
  saveBackup(dir: string, filename: string, data: string): Promise<boolean>;
  showDirectoryPicker(): Promise<string | null>;
  showFilePicker(): Promise<string | null>;
  openBackup(filePath: string): Promise<string | null>;
  checkIntegrity(): Promise<boolean>;
  getMachineId(): Promise<string | null>;
  biometricHandshake(options: { action: 'create' | 'get'; publicKey: unknown }): Promise<BiometricResponse>;
  getPlatform(): NodeJS.Platform;
}

interface Window {
  electronAPI: ElectronAPI;
}
