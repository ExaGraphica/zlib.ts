/**
 * @fileoverview Deflate (RFC 1951) Implementation.
 * The full Deflate algorithm itself is implemented in RawDeflate.
 */

import { Adler32 } from "./Adler32";
import { RawDeflateOptions, CompressionType, RawDeflate } from "./RawDeflate";
import { DefaultBufferSize, DEFLATE_TOKEN } from "./Constants";
import { ByteStream } from "ByteStream";

export interface DeflateOptions extends RawDeflateOptions{
    compressionType?: CompressionType
}
export class Deflate {
    input: Uint8Array | number[];
    output: Uint8Array;
    compressionType: CompressionType;
    rawDeflate: RawDeflate;
    
    adler32: number | null = null;
    
    /**
     * Zlib Deflate
     * @constructor
     * @param {!(Array<number>|Uint8Array)} input The byte array to encode
     * @param {Object=} opts option parameters.
     */
    constructor(input: Uint8Array | number[], opts: DeflateOptions = {}) {
        this.input = input;
        this.output = new Uint8Array(DefaultBufferSize);
        
        var rawDeflateOption: RawDeflateOptions = {};

        // option parameters
        this.compressionType = opts.compressionType ?? CompressionType.DYNAMIC;

        // copy options
        Object.assign(rawDeflateOption, opts)

        // set raw-deflate output buffer
        rawDeflateOption.outputBuffer = this.output;

        this.rawDeflate = new RawDeflate(this.input, rawDeflateOption);
    }

    /**
     * Static compression
     * @param {!(Array|Uint8Array)} input target buffer.
     * @param {Object=} opts option parameters.
     * @return {!Uint8Array} compressed data byte array.
     */
    static compress(input: number[] | Uint8Array, opts: DeflateOptions): Uint8Array {
        return (new Deflate(input, opts)).compress();
    };

    /**
     * Deflate Compression.
     * @return {!Uint8Array} compressed data byte array.
     */
    compress(): Uint8Array {
        var b = new ByteStream(this.output, 0);

        // Compression Method and Flags

        //cinfo = Math.LOG2E * Math.log(WindowSize) - 8;
        //var cmf = (cinfo << 4) | DEFLATE_TOKEN;
        var cmf = 120;
        //b.writeByte(cmf);
        b.writeByte(cmf);

        // Flags
        var fdict = 0;
        var flevel = this.compressionType as number;

        var flg = (flevel << 6) | (fdict << 5);
        var fcheck = 31 - ((cmf << 8) + flg) % 31;
        flg |= fcheck;
        b.writeByte(flg);

        // Adler-32 checksum
        var adler = Adler32.create(this.input);
        this.adler32 = adler;
        
        this.rawDeflate.op = b.p;
        var output = this.rawDeflate.compress();
        var pos = output.length;
        b.buffer = output;

        // Restore any subarray
        b.restoreBuffer();
        b.setLength(pos + 4);
        b.p = pos;

        // adler32
        b.writeUintBE(adler);

        this.output = b.buffer;
        return this.output;
    }
}