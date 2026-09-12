export interface P2PMessage {
  id: string;
  type?: 'TEXT' | 'FILE_START' | 'FILE_CHUNK' | 'FILE_END';
  sender: string;
  content: string;
  timestamp: number;
  signature?: string;
  publicKey?: JsonWebKey;
  // Frontend Meta
  verified?: boolean;
  isSelf?: boolean;
  // File Fields
  fileId?: string;
  fileName?: string;
  chunkIndex?: number;
  totalChunks?: number;
  chunkData?: string;
}
