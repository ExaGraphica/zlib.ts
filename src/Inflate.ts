import { Adler32 } from "./Adler32";
import { BufferType, RawInflate } from "./RawInflate";
import { DEFLATE_TOKEN } from "./Constants";
import { ByteStream } from "ByteStream";

export interface InflateOptions{
    index?: number,
    verify?: boolean,

    bufferSize?: number,
    bufferType?: BufferType,
    resize?: boolean
}

export class Inflate{
    input: Uint8Array;
    ip: number = 0;
    rawinflate: RawInflate;
    verify: boolean;
    
    adler32: number | null = null;

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
    constructor(input: Uint8Array, opts: InflateOptions = {}) {
        this.input = input;

        // option parameters
        this.ip = opts.index ?? 0;
        this.verify = opts.verify ?? false;

        // Compression Method and Flags
        var cmf = input[this.ip++];
        var flg = input[this.ip++];

        // compression method
        if((cmf & 0x0f) != DEFLATE_TOKEN){
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
        var input = this.input;//input buffer.
        var buffer;//inflated buffer.

        buffer = this.rawinflate.decompress();
        this.ip = this.rawinflate.ip;

        // verify adler-32
        if (this.verify) {
            var b = new ByteStream(input, this.ip);
            //adler-32 checksum
            var adler32 = Adler32.create(buffer);
            this.adler32 = adler32;

            if (adler32 !== b.readUintBE()) {
                throw new Error('invalid adler-32 checksum');
            }
        }

        return buffer;
    }
}