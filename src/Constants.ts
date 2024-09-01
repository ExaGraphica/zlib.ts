export const DEFLATE_TOKEN = 8;

export const DefaultBufferSize = 0x8000;

/** Defaulf buffer block size. */
export const DefaultDeflateBufferSize = 0x8000;

/** Default buffer block size. */
export const DefaultInflateBufferSize = 0x8000;

export const MaxBackwardLength = 32768;

export type Z_STATUS = 1 | -1;
export const Z_OK = 1;
export const Z_ERR = -1;

export enum BlockType {
    UNCOMPRESSED = 0,
    FIXED = 1,
    DYNAMIC = 2
};
