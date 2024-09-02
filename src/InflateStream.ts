import { Adler32 } from "./Adler32";
import { RawInflateStream } from "./RawInflateStream";
import { DEFLATE_TOKEN, Z_ERR, Z_OK, Z_STATUS } from "./Constants";
import { ByteStream } from "ByteStream";

export class InflateStream {
    input: Uint8Array;
    ip: number;
    rawinflate: RawInflateStream;
    output: Uint8Array;
    verify: boolean = true;

    /**
     * @param {!(Uint8Array|Array)} input deflated buffer.
     * @constructor
     */
    constructor(input: Uint8Array, ip: number = 0) {
        this.input = input;
        this.ip = ip;
        this.rawinflate = new RawInflateStream(this.input, this.ip);
        this.output = this.rawinflate.output;
    };

    /**
     * decompress.
     * @return {!Uint8Array} inflated buffer.
     */
    decompress(input: Uint8Array): Uint8Array {

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

        var buffer = this.rawinflate.decompress(this.input, this.ip);//inflated buffer.
        if (this.rawinflate.ip !== 0) {
            this.input = this.input.subarray(this.rawinflate.ip);
            this.ip = 0;
        }

        var b = new ByteStream(input, this.ip);

        // Verify adler-32
        if (this.verify) {
            var adler32 = b.readUintBE();

            if (adler32 !== Adler32.create(buffer)) {
                throw new Error('invalid adler-32 checksum');
            }
        }
        
        return buffer;
    }

    readHeader(): Z_STATUS {
        var ip = this.ip;
        var input = this.input;

        // Compression Method and Flags
        var cmf = input[ip++];
        var flg = input[ip++];

        if (cmf === undefined || flg === undefined) return Z_ERR;

        // compression method
        if((cmf & 0x0F) != DEFLATE_TOKEN){
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

        return Z_OK;
    }
}