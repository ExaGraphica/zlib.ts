/**
 * @fileoverview Bit Stream Implementation.
 */

export class BitStream {
    index: number;
    bitindex: number = 0;//bit index
    buffer: Uint8Array;

    /**
     * Bitstream
     * @constructor
     * @param {(Array|Uint8Array)=} buffer output buffer.
     * @param {number=} bufferPosition start buffer pointer.
     */
    constructor(buffer?: Uint8Array, bufferPosition: number = 0) {
        this.index = bufferPosition;
        this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(BitStream.DefaultBlockSize);

        // If the input index is outside the input buffer, we can double it.
        // Anything outside the doubled buffer length is invalid, though.
        if (this.buffer.length * 2 <= this.index) {
            throw new Error("invalid index");
        } else if (this.buffer.length <= this.index) {
            this.expandBuffer();
        }
    }

    /**
     * Default Block Size.
     * @const
     * @type {number}
     */
    static DefaultBlockSize: number = 0x8000;

    /**
     * Expand buffer.
     * @return {Uint8Array} new buffer.
     */
    expandBuffer(): Uint8Array {
        var oldbuf = this.buffer;//old buffer.
        var buffer = new Uint8Array(oldbuf.length << 1);//new buffer.
        buffer.set(oldbuf);

        this.buffer = buffer;
        return buffer;
    }

    /**
    * Reverse the bit order of a 32-bit integer
    * @param {number} n 32-bit integer.
    * @return {number} reversed 32-bit integer.
    * @private
    */
    private rev32_(n: number): number {
        return (BitStream.ReverseTable[n & 0xFF] << 24) |
            (BitStream.ReverseTable[n >>> 8 & 0xFF] << 16) |
            (BitStream.ReverseTable[n >>> 16 & 0xFF] << 8) |
            BitStream.ReverseTable[n >>> 24 & 0xFF];
    }

    /** Writes however many speficied bits.
     * @param {number} number Number to write.
     * @param {number} b Amount of bits in number (max 32)
     * @param {boolean=} reverse Bits mean to be written in reverse order?
     */
    writeBits(number: number, b: number, reverse: boolean = false) {
        var buffer = this.buffer;
        var index = this.index;
        var bitindex = this.bitindex;


        var current: number = buffer[index];// current octet.
        var i;//loop counter.

        // Reverse bits
        if (reverse && b > 1) {
            number = b > 8 ?
                this.rev32_(number) >> (32 - b) :
                BitStream.ReverseTable[number] >> (8 - b);
        }


        if (b + bitindex < 8) {
            // Doesn't cross the byte boundary
            current = (current << b) | number;
            bitindex += b;
        } else {
            // Crosses the byte boundary
            for (i = 0; i < b; ++i) {
                current = (current << 1) | ((number >> b - i - 1) & 1);

                // next byte
                if (++bitindex === 8) {
                    bitindex = 0;
                    buffer[index++] = BitStream.ReverseTable[current];
                    current = 0;

                    // expand
                    if (index === buffer.length) {
                        buffer = this.expandBuffer();
                    }
                }
            }
        }
        buffer[index] = current;

        this.buffer = buffer;
        this.bitindex = bitindex;
        this.index = index;
    }

    /**
     * Terminates the stream
     * @return {Uint8Array} Returns the terminated buffer;
     */
    finish(): Uint8Array {
        var buffer = this.buffer;
        var index = this.index;

        /** @type {!(Array|Uint8Array)} output buffer. */
        var output;

        // Index is advanced to the nearest '0th' bit.
        if (this.bitindex > 0) {
            buffer[index] <<= 8 - this.bitindex;
            buffer[index] = BitStream.ReverseTable[buffer[index]];
            index++;
        }

        // Truncate Array
        output = buffer.subarray(0, index);

        return output;
    };

    static ReverseTable = (function () {
        var table = new Uint8Array(256);
        // generate
        for (var i = 0; i < 256; ++i) {
            var r = i;
            var s = 7;

            for (i >>>= 1; i; i >>>= 1) {
                r <<= 1;
                r |= i & 1;
                --s;
            }

            table[i] = (r << s & 0xff)
        }

        return table;
    })();//Reverse table IIFE
}
