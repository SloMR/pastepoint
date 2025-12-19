/**
 * Binary Chunk Protocol for reliable file transfers with integrity checking
 *
 * Each chunk is self-contained with embedded metadata and CRC32 checksum,
 * eliminating chunk mismatching and detecting corruption.
 *
 * Binary format:
 * [2 bytes: fileId length (Uint16)]
 * [N bytes: fileId (UTF-8)]
 * [4 bytes: chunk index (Uint32)]
 * [4 bytes: total chunks (Uint32)]
 * [4 bytes: CRC32 checksum of chunk data (Uint32)]
 * [remaining bytes: chunk data]
 */

// CRC32 lookup table (pre-computed for performance)
const CRC32_TABLE = new Uint32Array(256);
(function initCRC32Table() {
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    CRC32_TABLE[i] = crc >>> 0;
  }
})();

/**
 * Calculates CRC32 checksum for data integrity verification
 */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Calculates SHA-256 hash of a file for full integrity verification
 */
export async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calculates SHA-256 hash of an ArrayBuffer
 */
export async function calculateBufferHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ChunkMetadata {
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  checksum: number;
}

export interface ParsedChunk {
  metadata: ChunkMetadata;
  data: ArrayBuffer;
  isValid: boolean; // Whether checksum verification passed
}

/**
 * Encodes a chunk with embedded metadata and CRC32 checksum
 */
export function encodeChunk(
  fileId: string,
  chunkIndex: number,
  totalChunks: number,
  chunkData: ArrayBuffer
): ArrayBuffer {
  const encoder = new TextEncoder();
  const fileIdBytes = encoder.encode(fileId);
  const fileIdLength = fileIdBytes.length;
  const chunkDataArray = new Uint8Array(chunkData);

  // Calculate CRC32 checksum of chunk data
  const checksum = crc32(chunkDataArray);

  // Header: 2 (fileId length) + fileIdLength + 4 (index) + 4 (total) + 4 (crc) = 14 + fileIdLength
  const headerSize = 2 + fileIdLength + 4 + 4 + 4;
  const totalSize = headerSize + chunkData.byteLength;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8View = new Uint8Array(buffer);

  let offset = 0;

  // Write fileId length (2 bytes)
  view.setUint16(offset, fileIdLength, true);
  offset += 2;

  // Write fileId bytes
  uint8View.set(fileIdBytes, offset);
  offset += fileIdLength;

  // Write chunk index (4 bytes)
  view.setUint32(offset, chunkIndex, true);
  offset += 4;

  // Write total chunks (4 bytes)
  view.setUint32(offset, totalChunks, true);
  offset += 4;

  // Write CRC32 checksum (4 bytes)
  view.setUint32(offset, checksum, true);
  offset += 4;

  // Write chunk data
  uint8View.set(chunkDataArray, offset);

  return buffer;
}

/**
 * Decodes a chunk, extracting metadata and verifying checksum
 */
export function decodeChunk(buffer: ArrayBuffer): ParsedChunk | null {
  try {
    if (buffer.byteLength < 14) {
      // Minimum: 2 (fileId len) + 0 (empty fileId) + 4 (index) + 4 (total) + 4 (crc)
      return null;
    }

    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);
    let offset = 0;

    // Read fileId length
    const fileIdLength = view.getUint16(offset, true);
    offset += 2;

    if (buffer.byteLength < 2 + fileIdLength + 12) {
      return null;
    }

    // Read fileId
    const fileIdBytes = uint8View.slice(offset, offset + fileIdLength);
    const decoder = new TextDecoder();
    const fileId = decoder.decode(fileIdBytes);
    offset += fileIdLength;

    // Read chunk index
    const chunkIndex = view.getUint32(offset, true);
    offset += 4;

    // Read total chunks
    const totalChunks = view.getUint32(offset, true);
    offset += 4;

    // Read expected checksum
    const expectedChecksum = view.getUint32(offset, true);
    offset += 4;

    // Extract chunk data
    const data = buffer.slice(offset);
    const dataArray = new Uint8Array(data);

    // Verify checksum
    const actualChecksum = crc32(dataArray);
    const isValid = actualChecksum === expectedChecksum;

    return {
      metadata: {
        fileId,
        chunkIndex,
        totalChunks,
        checksum: expectedChecksum,
      },
      data,
      isValid,
    };
  } catch {
    return null;
  }
}

/**
 * Calculates the total number of chunks needed for a file
 */
export function calculateTotalChunks(fileSize: number, chunkSize: number): number {
  return Math.ceil(fileSize / chunkSize);
}

/**
 * Validates that all chunks have been received for a file
 */
export function validateChunkSequence(
  receivedChunks: Map<number, ArrayBuffer>,
  totalChunks: number
): { isComplete: boolean; missingChunks: number[] } {
  const missingChunks: number[] = [];

  for (let i = 0; i < totalChunks; i++) {
    if (!receivedChunks.has(i)) {
      missingChunks.push(i);
    }
  }

  return {
    isComplete: missingChunks.length === 0,
    missingChunks,
  };
}
