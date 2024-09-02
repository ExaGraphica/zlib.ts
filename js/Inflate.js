import { Adler32 } from "./Adler32.js";
import { RawInflate } from "./RawInflate.js";
import { DEFLATE_TOKEN } from "./Constants.js";
import { ByteStream } from "./ByteStream.js";
export class Inflate {
    /**
     * @constructor
     * @param {!(Uint8Array|Array)} input deflated buffer.
     * @param {Object=} opts option parameters.
     *
     * In opts, you can specify the following:
     *   - index: The starting index of the deflate container
     *   - blockSize: The block size of the buffer.
     *   - verify: Should the adler32 checksum be verified?
     *   - bufferType: BufferType that specifies how the buffer is managed
     */
    constructor(input, opts = {}) {
        var _a, _b;
        this.ip = 0;
        this.input = input;
        // option parameters
        this.ip = (_a = opts.index) !== null && _a !== void 0 ? _a : 0;
        this.verify = (_b = opts.verify) !== null && _b !== void 0 ? _b : false;
        // Compression Method and Flags
        var cmf = input[this.ip++];
        var flg = input[this.ip++];
        // compression method
        if ((cmf & 0x0f) != DEFLATE_TOKEN) {
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
        // RawInflate
        this.rawinflate = new RawInflate(input, {
            index: this.ip,
            bufferSize: opts.bufferSize,
            bufferType: opts.bufferType,
            resize: opts.resize
        });
    }
    /**
     * decompress.
     * @return {!Uint8Array} inflated buffer.
     */
    decompress() {
        var input = this.input; //input buffer.
        var buffer; //inflated buffer.
        buffer = this.rawinflate.decompress();
        this.ip = this.rawinflate.ip;
        var b = new ByteStream(buffer, this.ip);
        // verify adler-32
        if (this.verify) {
            //adler-32 checksum
            var adler32 = b.readUintBE();
            if (adler32 !== Adler32.create(buffer)) {
                throw new Error('invalid adler-32 checksum');
            }
        }
        return buffer;
    }
}
