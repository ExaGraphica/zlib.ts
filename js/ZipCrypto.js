import { CRC32 } from "./CRC32.js";
import { stringToByteArray } from "./Util.js";
// https://github.com/artem-karpenko/archiver-zip-encrypted/blob/master/lib/zip20/CryptoCipher.js
export const ZipCrypto = {
    /**
     * @param {(Array.<number>|Uint32Array)} key
     * @return {number}
     */
    getByte(key) {
        var tmp = ((key[2] & 0xFFFF) | 2);
        return ((tmp * (tmp ^ 1)) >> 8) & 0xFF;
    },
    /**
     * @param {(Array.<number>|Uint32Array)} key
     * @param {number} n
     * Factors of 134775813: 20173 * 6681
     */
    updateKeys(key, n) {
        key[0] = CRC32.single(n, key[0]);
        key[1] = key[1] + (key[0] & 0xFF);
        key[1] = Number((Math.imul(key[1], 134775813) + 1) & 0xFFFFFFFF);
        key[2] = CRC32.single(key[1] >>> 24, key[2]);
    },
    /**
     * @param {(Array.<number>|Uint8Array)} password
     * @return {!Uint32Array}
     */
    createKey(password) {
        if (typeof password == 'string')
            password = stringToByteArray(password);
        var key = new Uint32Array([305419896, 591751049, 878082192]);
        for (var i = 0; i < password.length; ++i) {
            this.updateKeys(key, password[i] & 0xFF);
        }
        return key;
    },
    /**
     * @param {(Array.<number>|Uint32Array|Object)} key
     * @param {number} n
     * @return {number}
     */
    decode(key, n) {
        n ^= this.getByte(key);
        this.updateKeys(key, n);
        return n;
    },
    /**
     * @param {(Array.<number>|Uint32Array|Object)} key
     * @param {number} n
     * @return {number}
     */
    encode(key, n) {
        var tmp = this.getByte(key);
        this.updateKeys(key, n);
        return tmp ^ n;
    },
};
