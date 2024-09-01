/**
 * @fileoverview Adler32 checksum Implementation.
 */

import { stringToByteArray } from "./Util";

export const Adler32 = {
    /**
     * Adler32 checksum creation
     * @param {!(string|Array<number>|Uint8Array)} array Byte array used in creation
     * @return {number} Adler32 checksum
     */
    create(array: string | number[] | Uint8Array): number {
        if (typeof array == 'string') {
            array = stringToByteArray(array);
        }
        return this.update(1, array);
    },

    /**
     * Adler32 checksum creation
     * @param {number} adler Current hash value.
     * @param {!(Array<number>|Uint8Array)} array Byte array used in updating
     * @return {number} Adler32 checksum.
     */
    update(adler: number, array: number[] | Uint8Array): number {
        var s1: number = adler & 0xFFFF,
            s2: number = (adler >> 16) & 0xFFFF,
            len: number = array.length;
        var i: number = 0;

        while (len > 0) {
            var tlen = len > this.OptimizationParameter ?
                this.OptimizationParameter : len;//loop length (don't overflow)
            len -= tlen;
            do {
                s1 += array[i++];
                s2 += s1;
            } while (--tlen);

            s1 %= 65521;
            s2 %= 65521;
        }

        return ((s2 << 16) | s1) >>> 0;
    },

    /**
     * Adler32 Optimization parameter
     * Currently 1024 is most optimal.
     * Max 5552
     * @see http://jsperf.com/adler-32-simple-vs-optimized/3
     * @define {number}
     */
    OptimizationParameter: 1024
};