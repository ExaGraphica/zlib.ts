/**
 * @fileoverview CRC32 Implementation.
 */
const CRC32_COMPACT = false;
export const CRC32 = {
    /**
     * CRC32 checksum creation
     * @param {!(Array.<number>|Uint8Array)} data data byte array.
     * @param {number=} pos data position
     * @param {number=} length data length
     * @return {number} CRC32.
     */
    create(data, pos, length) {
        return this.update(data, 0, pos, length);
    },
    /**
     * CRC32 checksum updating
     * @param {!(Array.<number>|Uint8Array)} data data byte array.
     * @param {number} crc CRC32.
     * @param {number=} pos data position.
     * @param {number=} length data length.
     * @return {number} CRC32.
     */
    update(data, crc, pos = 0, length) {
        var table = CRC32.Table;
        var il = length !== null && length !== void 0 ? length : data.length;
        crc ^= 0xFFFFFFFF;
        // loop unrolling for performance
        for (var i = il & 7; i--; ++pos) {
            crc = (crc >>> 8) ^ table[(crc ^ data[pos]) & 0xFF];
        }
        for (var i = il >> 3; i--; pos += 8) {
            crc = (crc >>> 8) ^ table[(crc ^ data[pos]) & 0xFF];
            crc = (crc >>> 8) ^ table[(crc ^ data[pos + 1]) & 0xFF];
            crc = (crc >>> 8) ^ table[(crc ^ data[pos + 2]) & 0xFF];
            crc = (crc >>> 8) ^ table[(crc ^ data[pos + 3]) & 0xFF];
            crc = (crc >>> 8) ^ table[(crc ^ data[pos + 4]) & 0xFF];
            crc = (crc >>> 8) ^ table[(crc ^ data[pos + 5]) & 0xFF];
            crc = (crc >>> 8) ^ table[(crc ^ data[pos + 6]) & 0xFF];
            crc = (crc >>> 8) ^ table[(crc ^ data[pos + 7]) & 0xFF];
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    },
    /**
     * @param {number} num
     * @param {number} crc
     * @return {number} CRC32
     */
    single(num, crc) {
        return CRC32.Table[(num ^ crc) & 0xFF] ^ (crc >>> 8);
    },
    /** CRC-32 Table. */
    Table: new Uint32Array(256),
    init() {
        for (var i = 0; i < 256; ++i) {
            var c = i;
            for (var j = 0; j < 8; ++j) {
                c = (c & 1) ? (0xedB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            this.Table[i] = c >>> 0;
        }
    },
};
CRC32.init();
//
