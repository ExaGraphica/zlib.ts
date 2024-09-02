import { Adler32 } from "./Adler32.js";
import { RawInflateStream } from "./RawInflateStream.js";
import { DEFLATE_TOKEN, Z_ERR } from "./Constants.js";
export class InflateStream {
    /**
     * @param {!(Uint8Array|Array)} input deflated buffer.
     * @constructor
     */
    constructor(input) {
        this.ip = 0;
        this.verify = true;
        this.input = input;
        this.rawinflate = new RawInflateStream(this.input, this.ip);
        this.output = this.rawinflate.output;
    }
    ;
    /**
     * decompress.
     * @return {!Uint8Array} inflated buffer.
     */
    decompress(input) {
        /** @type {number} adler-32 checksum */
        var adler32;
        // Attaching a new input to the input buffer;
        if (input) {
            var tmp = new Uint8Array(this.input.length + input.length);
            tmp.set(this.input, 0);
            tmp.set(input, this.input.length);
            this.input = tmp;
        }
        if (this.readHeader() == Z_ERR) {
            return new Uint8Array();
        }
        var buffer = this.rawinflate.decompress(this.input, this.ip); //inflated buffer.
        if (this.rawinflate.ip !== 0) {
            this.input = this.input.subarray(this.rawinflate.ip);
            this.ip = 0;
        }
        // Verify adler-32
        if (this.verify) {
            adler32 = input[this.ip++] << 24 | input[this.ip++] << 16
                | input[this.ip++] << 8 | input[this.ip++];
            if (adler32 !== Adler32.create(buffer)) {
                throw new Error('invalid adler-32 checksum');
            }
        }
        return buffer;
    }
    readHeader() {
        var ip = this.ip;
        var input = this.input;
        // Compression Method and Flags
        var cmf = input[ip++];
        var flg = input[ip++];
        if (cmf === undefined || flg === undefined)
            return Z_ERR;
        // compression method
        if ((cmf & 0x0F) != DEFLATE_TOKEN) {
            throw new Error('unsupported compression method');
        }
        // fcheck
        if (((cmf << 8) + flg) % 31 !== 0) {
            throw new Error('invalid fcheck flag:' + ((cmf << 8) + flg) % 31);
        }
        // fdict (not supported)
        if (flg & 0x20) {
            throw new Error('fdict flag is not supported');
        }
        this.ip = ip;
    }
}
