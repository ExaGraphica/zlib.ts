/**
 * @fileoverview GZip (RFC 1952) Implementation.
 */
import { CRC32 } from "./CRC32.js";
import { RawDeflate } from "./RawDeflate.js";
import { DefaultBufferSize } from "./Constants.js";
export const GZipMagicNumber = [0x1F, 0x8B];
export var GZipOperatingSystem;
(function (GZipOperatingSystem) {
    GZipOperatingSystem[GZipOperatingSystem["FAT"] = 0] = "FAT";
    GZipOperatingSystem[GZipOperatingSystem["AMIGA"] = 1] = "AMIGA";
    GZipOperatingSystem[GZipOperatingSystem["VMS"] = 2] = "VMS";
    GZipOperatingSystem[GZipOperatingSystem["UNIX"] = 3] = "UNIX";
    GZipOperatingSystem[GZipOperatingSystem["VM_CMS"] = 4] = "VM_CMS";
    GZipOperatingSystem[GZipOperatingSystem["ATARI_TOS"] = 5] = "ATARI_TOS";
    GZipOperatingSystem[GZipOperatingSystem["HPFS"] = 6] = "HPFS";
    GZipOperatingSystem[GZipOperatingSystem["MACINTOSH"] = 7] = "MACINTOSH";
    GZipOperatingSystem[GZipOperatingSystem["Z_SYSTEM"] = 8] = "Z_SYSTEM";
    GZipOperatingSystem[GZipOperatingSystem["CP_M"] = 9] = "CP_M";
    GZipOperatingSystem[GZipOperatingSystem["TOPS_20"] = 10] = "TOPS_20";
    GZipOperatingSystem[GZipOperatingSystem["NTFS"] = 11] = "NTFS";
    GZipOperatingSystem[GZipOperatingSystem["QDOS"] = 12] = "QDOS";
    GZipOperatingSystem[GZipOperatingSystem["ACORN_RISCOS"] = 13] = "ACORN_RISCOS";
    GZipOperatingSystem[GZipOperatingSystem["UNKNOWN"] = 255] = "UNKNOWN";
})(GZipOperatingSystem || (GZipOperatingSystem = {}));
;
export var GZipFlagsMask;
(function (GZipFlagsMask) {
    GZipFlagsMask[GZipFlagsMask["FTEXT"] = 1] = "FTEXT";
    GZipFlagsMask[GZipFlagsMask["FHCRC"] = 2] = "FHCRC";
    GZipFlagsMask[GZipFlagsMask["FEXTRA"] = 4] = "FEXTRA";
    GZipFlagsMask[GZipFlagsMask["FNAME"] = 8] = "FNAME";
    GZipFlagsMask[GZipFlagsMask["FCOMMENT"] = 16] = "FCOMMENT";
})(GZipFlagsMask || (GZipFlagsMask = {}));
;
export class GZip {
    /**
     * @constructor
     * @param {!(Array|Uint8Array)} input input buffer.
     * @param {Object=} opts option parameters.
     */
    constructor(input, opts = {}) {
        var _a, _b;
        this.ip = 0; //input buffer pointer.
        this.output = null; //output buffer.
        this.op = 0; //output buffer pointer.
        this.filename = '';
        this.comment = '';
        this.input = input;
        this.flags = {};
        // option parameters
        if (opts.filename) {
            this.filename = opts.filename;
            this.flags.fname = true;
        }
        if (opts.comment) {
            this.comment = (_a = opts.comment) !== null && _a !== void 0 ? _a : '';
            this.flags.fcomment = true;
        }
        if (opts.hcrc) {
            this.flags.fhcrc = true;
        }
        this.deflateOptions = (_b = opts.deflateOptions) !== null && _b !== void 0 ? _b : {};
    }
    /**
     * Encode gzip members.
     * @return {!Uint8Array} gzip binary array.
     */
    compress() {
        var output = new Uint8Array(DefaultBufferSize); //output buffer
        var op = 0; //output buffer pointer
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
        if (this.flags.fname)
            flg |= GZipFlagsMask.FNAME;
        if (this.flags.fcomment)
            flg |= GZipFlagsMask.FCOMMENT;
        if (this.flags.fhcrc)
            flg |= GZipFlagsMask.FHCRC;
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
        output[op++] = GZipOperatingSystem.UNIX; // Default is Unix.
        // no extra
        // fname
        if (this.flags.fname) {
            for (var i = 0; i < comment.length; ++i) {
                var c = filename.charCodeAt(i);
                if (c > 0xff) {
                    output[op++] = (c >>> 8) & 0xff;
                }
                output[op++] = c & 0xff;
            }
            output[op++] = 0; // null termination
        }
        // fcomment
        if (this.flags.fcomment) {
            for (var i = 0; i < comment.length; ++i) {
                var c = comment.charCodeAt(i);
                if (c > 0xff) {
                    output[op++] = (c >>> 8) & 0xff;
                }
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
        }
        else {
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
    }
    ;
}
