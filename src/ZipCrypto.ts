import { CRC32 } from "./CRC32";
import { stringToByteArray } from "./Util";

export const ZipCrypto = {
    /**
     * @param {(Array.<number>|Uint32Array)} key
     * @return {number}
     */
    getByte(key: Uint32Array): number {
        var tmp = ((key[2] & 0xFFFF) | 2);

        return ((tmp * (tmp ^ 1)) >> 8) & 0xFF;
    },
    
    /**
     * @param {(Array.<number>|Uint32Array)} key
     * @param {number} n
     */
    updateKeys(key: Uint32Array, n: number) {
        key[0] = CRC32.single(key[0], n);
        //key[1] = key[1] + (key[0] & 0xFF);
        //key[1] *= 20173
        //key[1] *= 6681;
        //key[1] += 1;
        key[1] = Number((BigInt(key[1] + (key[0] & 0xFF)) * BigInt(134775813)) & BigInt(0xFFFFFFFF));
        key[2] = CRC32.single(key[2], key[1] >>> 24);
    },

    /**
     * @param {(Array.<number>|Uint8Array)} password
     * @return {!Uint32Array}
     */
    createKey(password: number[] | Uint8Array | string): Uint32Array {
        if(typeof password == 'string') password = stringToByteArray(password);

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
    decode(key: Uint32Array, n: number): number {
        n ^= this.getByte(key);
        this.updateKeys(key, n);

        return n;
    },

    /**
     * @param {(Array.<number>|Uint32Array|Object)} key
     * @param {number} n
     * @return {number}
     */
    encode(key: Uint32Array, n: number): number {
        var tmp = this.getByte(key);

        this.updateKeys(key, n);

        return tmp ^ n;
    },
}