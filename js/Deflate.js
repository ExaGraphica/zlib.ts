/**
 * @fileoverview Deflate (RFC 1951) Implementation.
 * The full Deflate algorithm itself is implemented in RawDeflate.
 */
import { Adler32 } from "./Adler32.js";
import { CompressionType, RawDeflate } from "./RawDeflate.js";
import { DefaultBufferSize, DEFLATE_TOKEN } from "./Constants.js";
import { ByteStream } from "./ByteStream.js";
export class Deflate {
    /**
     * Zlib Deflate
     * @constructor
     * @param {!(Array<number>|Uint8Array)} input The byte array to encode
     * @param {Object=} opts option parameters.
     */
    constructor(input, opts = {}) {
        var _a;
        this.adler32 = null;
        this.input = input;
        this.output = new Uint8Array(DefaultBufferSize);
        var rawDeflateOption = {};
        // option parameters
        this.compressionType = (_a = opts.compressionType) !== null && _a !== void 0 ? _a : CompressionType.DYNAMIC;
        // copy options
        Object.assign(rawDeflateOption, opts);
        // set raw-deflate output buffer
        rawDeflateOption['outputBuffer'] = this.output;
        this.rawDeflate = new RawDeflate(this.input, rawDeflateOption);
    }
    /**
     * Static compression
     * @param {!(Array|Uint8Array)} input target buffer.
     * @param {Object=} opts option parameters.
     * @return {!Uint8Array} compressed data byte array.
     */
    static compress(input, opts) {
        return (new Deflate(input, opts)).compress();
    }
    ;
    /**
     * Deflate Compression.
     * @return {!Uint8Array} compressed data byte array.
     */
    compress() {
        var output = this.output;
        var b = new ByteStream(output, 0);
        // Compression Method and Flags
        //cinfo = Math.LOG2E * Math.log(WindowSize) - 8;
        var cinfo = 7;
        var cmf = (cinfo << 4) | DEFLATE_TOKEN;
        b.writeByte(cmf);
        // Flags
        var fdict = 0;
        var flevel = this.compressionType;
        var flg = (flevel << 6) | (fdict << 5);
        var fcheck = 31 - ((cmf << 8) + flg) % 31;
        flg |= fcheck;
        b.writeByte(flg);
        // Adler-32 checksum
        var adler = Adler32.create(this.input);
        this.adler32 = adler;
        this.rawDeflate.op = b.p;
        output = this.rawDeflate.compress();
        var pos = output.length;
        // subarray 分を元にもどす
        output = new Uint8Array(output.buffer);
        // expand buffer
        if (output.length <= pos + 4) {
            this.output = new Uint8Array(output.length + 4);
            this.output.set(output);
            output = this.output;
        }
        output = output.subarray(0, pos + 4);
        b = new ByteStream(output, pos);
        // adler32
        b.writeUintBE(adler);
        return output;
    }
}
