/**
 * @fileoverview GZip (RFC 1952) Implementation.
 */

import { CRC32 } from "./CRC32";
import { DeflateOptions } from "./Deflate";
import { RawDeflate } from "./RawDeflate";
import { DefaultBufferSize } from "./Constants";

export const GZipMagicNumber = [0x1F, 0x8B];

export enum GZipOperatingSystem{
    FAT = 0,
    AMIGA = 1,
    VMS = 2,
    UNIX = 3,
    VM_CMS = 4,
    ATARI_TOS = 5,
    HPFS = 6,
    MACINTOSH = 7,
    Z_SYSTEM = 8,
    CP_M = 9,
    TOPS_20 = 10,
    NTFS = 11,
    QDOS = 12,
    ACORN_RISCOS = 13,
    UNKNOWN = 255
};


export enum GZipFlagsMask{
    FTEXT = 0x01,
    FHCRC = 0x02,
    FEXTRA = 0x04,
    FNAME = 0x08,
    FCOMMENT = 0x10
};

export interface GZipFlags{
    fname?: boolean,
    fcomment?: boolean,
    fhcrc?: boolean
}

export interface GZipOptions{
    filename?: string,
    comment?: string,
    hcrc?: boolean,
    deflateOptions?: DeflateOptions
}

export class GZip {
    input: number[] | Uint8Array;//input buffer.
    ip: number = 0;//input buffer pointer.

    output: number[] | Uint8Array | null = null;//output buffer.
    op: number = 0;//output buffer pointer.

    flags: GZipFlags;
    filename: string = '';
    comment: string = '';
    deflateOptions: DeflateOptions;

    /**
     * @constructor
     * @param {!(Array|Uint8Array)} input input buffer.
     * @param {Object=} opts option parameters.
     */
    constructor(input: number[] | Uint8Array, opts: GZipOptions = {}) {
        this.input = input;
        this.flags = {};

        // option parameters
        if(opts.filename){
            this.filename = opts.filename;
            this.flags.fname = true;
        }
        if(opts.comment){
            this.comment = opts.comment ?? '';
            this.flags.fcomment = true;
        }
        if(opts.hcrc){
            this.flags.fhcrc = true;
        }
        this.deflateOptions = opts.deflateOptions ?? {};
    }


    /**
     * Encode gzip members.
     * @return {!Uint8Array} gzip binary array.
     */
    compress(): Uint8Array {
        var output = new Uint8Array(DefaultBufferSize);//output buffer
        var op = 0;//output buffer pointer

        var input = this.input;
        var ip = this.ip;
        var filename = this.filename;
        var comment = this.comment;

        // check signature
        output[op++] = GZipMagicNumber[0];
        output[op++] = GZipMagicNumber[1];

        // check compression method
        output[op++] = 8; /* use Zlib const */

        // flags
        var flg = 0;
        if (this.flags.fname) flg |= GZipFlagsMask.FNAME;
        if (this.flags.fcomment) flg |= GZipFlagsMask.FCOMMENT;
        if (this.flags.fhcrc) flg |= GZipFlagsMask.FHCRC;
        // >>>: FTEXT
        // >>>: FEXTRA
        output[op++] = flg;

        // modification time
        var mtime = Math.floor(Date.now() / 1000);
        output[op++] = mtime & 0xff;
        output[op++] = mtime >>> 8 & 0xff;
        output[op++] = mtime >>> 16 & 0xff;
        output[op++] = mtime >>> 24 & 0xff;
        
        // extra flags
        output[op++] = 0;

        // operating system
        output[op++] = GZipOperatingSystem.UNIX;// Default is Unix.

        // no extra

        // fname
        if (this.flags.fname) {
            for (var i = 0; i < comment.length; ++i) {
                var c = filename.charCodeAt(i);
                if (c > 0xff) { output[op++] = (c >>> 8) & 0xff; }
                output[op++] = c & 0xff;
            }
            output[op++] = 0; // null termination
        }

        // fcomment
        if (this.flags.fcomment) {
            for (var i = 0; i < comment.length; ++i) {
                var c = comment.charCodeAt(i);
                if (c > 0xff) { output[op++] = (c >>> 8) & 0xff; }
                output[op++] = c & 0xff;
            }
            output[op++] = 0; // null termination
        }

        // fhcrc
        if (this.flags.fhcrc) {
            var crc16 = CRC32.create(output, 0, op) & 0xffff;
            output[op++] = (crc16) & 0xff;
            output[op++] = (crc16 >>> 8) & 0xff;
        }

        // add compress option
        this.deflateOptions.outputBuffer = output;
        this.deflateOptions.outputIndex = op;

        // compress
        var rawdeflate = new RawDeflate(input, this.deflateOptions);
        output = rawdeflate.compress();
        op = rawdeflate.op;

        // expand buffer
        if (op + 8 > output.buffer.byteLength) {
            this.output = new Uint8Array(op + 8);
            this.output.set(new Uint8Array(output.buffer));
            output = this.output;
        } else {
            output = new Uint8Array(output.buffer);
        }

        // crc32
        var crc32 = CRC32.create(input);
        output[op++] = (crc32) & 0xff;
        output[op++] = (crc32 >>> 8) & 0xff;
        output[op++] = (crc32 >>> 16) & 0xff;
        output[op++] = (crc32 >>> 24) & 0xff;

        // input size
        var il = input.length;
        output[op++] = (il) & 0xff;
        output[op++] = (il >>> 8) & 0xff;
        output[op++] = (il >>> 16) & 0xff;
        output[op++] = (il >>> 24) & 0xff;

        this.ip = ip;

        if (op < output.length) {
            this.output = output = output.subarray(0, op);
        }

        return output;
    };
}