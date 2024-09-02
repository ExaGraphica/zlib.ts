export const DEFLATE_TOKEN = 8;
export const DefaultBufferSize = 0x8000;
/** Defaulf buffer block size. */
export const DefaultDeflateBufferSize = 0x8000;
/** Default buffer block size. */
export const DefaultInflateBufferSize = 0x8000;
export const MaxBackwardLength = 32768;
export const Z_OK = 1;
export const Z_ERR = -1;
export var BlockType;
(function (BlockType) {
    BlockType[BlockType["UNCOMPRESSED"] = 0] = "UNCOMPRESSED";
    BlockType[BlockType["FIXED"] = 1] = "FIXED";
    BlockType[BlockType["DYNAMIC"] = 2] = "DYNAMIC";
})(BlockType || (BlockType = {}));
;
