/**
 * Compression Method
 * @enum {number}
 */
export const DEFLATE_TOKEN = 8;

export const Z_OK = 1;
export const Z_ERR = -1;

export const DefaultBufferSize = 0x8000;

/** @define {number} buffer block size. */
export const DefaultDeflateBufferSize = 0x8000;

/** @define {number} buffer block size. */
export const DefaultInflateBufferSize = 0x8000;

/**
 * @const
 * @type {number} max backward length for LZ77.
 */
export const MaxBackwardLength = 32768;

/**
 * @enum {number}
 */
export enum BlockType {
    UNCOMPRESSED = 0,
    FIXED = 1,
    DYNAMIC = 2
};
