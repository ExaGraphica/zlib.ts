import { ByteStream } from "ByteStream";
import { CRC32 } from "./CRC32";
import { GZipFlagsMask, GZipMagicNumber } from "./GZip";
import { RawInflate } from "./RawInflate";

interface GUnzipMember{
    id1: number;//signature first byte.
    id2: number;//signature second byte.
    cm: number;//compression method.
    flg: GZipFlagsMask;//flags.
    mtime: Date;//modification time.
    xfl: number;//extra flags.
    os: number;//operating system number.
    crc16?: number;//CRC-16 value for FHCRC flag.
    xlen?: number;//extra length.
    crc32?: number;//CRC-32 value for verification.
    isize?: number;//input size modulo 32 value.
    name?: string;//filename.
    comment?: string;//comment.
    data: Uint8Array;
};

export class GUnzip {
    input: Uint8Array;//input buffer.
    ip: number = 0;//input buffer pointer.
    member: GUnzipMember[] = [];
    decompressed: boolean = false;
    /**
     * @constructor
     * @param {!Uint8Array} input input buffer.
     */
    constructor(input: Uint8Array) {
        this.input = input;
    }

    /**
     * @return {Array.<GUnzipMember>}
     */
    getMembers(): GUnzipMember[] {
        if (!this.decompressed) this.decompress();

        return this.member.slice();
    };

    /**
     * inflate gzip data.
     * @return {!Uint8Array} inflated buffer.
     */
    decompress(): Uint8Array {
        var il = this.input.length;//input length.

        while (this.ip < il) {
            this.decodeMember();
        }

        this.decompressed = true;

        return this.concatMember();
    };

    /** Decode gzip member. */
    decodeMember() {
        var member: any = {};

        var input = this.input;
        var b = new ByteStream(input, this.ip);

        member.id1 = b.readByte(),
        member.id2 = b.readByte();

        // check signature
        if ((member.id1 !== GZipMagicNumber[0]) || (member.id2 !== GZipMagicNumber[2])) {
            throw new Error('invalid file signature:' + member.id1 + ',' + member.id2);
        }

        // check compression method
        member.cm = b.readByte();
        if(member.cm != 8) throw new Error('unknown compression method: ' + member.cm);

        // flags
        var flg = b.readByte() as GZipFlagsMask;
        member.flg = flg;

        // modification time
        var mtime = b.readUint();
        member.mtime = new Date(mtime * 1000);

        // extra flags
        member.xfl = b.readByte();

        // operating system
        member.os = b.readByte();

        // extra
        if (Boolean(flg & GZipFlagsMask.FEXTRA)) {
            member.xlen = b.readShort();
            b.p = this.decodeSubField(b.p, member.xlen);
        }

        // fname
        if (Boolean(flg & GZipFlagsMask.FNAME)) {
            var str = '', c = 1;
            while (c != 0) {
                c = b.readByte();
                if(c == 0) break;
                str += String.fromCharCode(c);
            }
            member.name = str;
        }

        // fcomment
        if (Boolean(flg & GZipFlagsMask.FCOMMENT)) {
            var str = '', c = 1;
            while (c != 0) {
                c = b.readByte();
                if(c == 0) break;
                str += String.fromCharCode(c);
            }
            member.comment = str;
        }

        // fhcrc
        if ((flg & GZipFlagsMask.FHCRC) > 0) {
            member.crc16 = CRC32.create(input, 0, b.p) & 0xFFFF;
            if (member.crc16 !== b.readShort()) {
                throw new Error('invalid header crc16');
            }
        }

        // The buffer size for inflate processing is known in advance, making it faster
        var isize = (
            input[input.length - 4]
            | (input[input.length - 3] << 8)
            | (input[input.length - 2] << 16)
            | (input[input.length - 1] << 24)
        ) >>> 0;

        // Check the validity of isize
        // In Huffman coding, the minimum is 2 bits, so the maximum is 1/4
        // In LZ77 coding, the length and distance can be expressed in 258 bytes, so the maximum is 1/128.
        // If the remaining input buffer size is more 512 times isize, no buffer allocation is performed.
        var inflen = undefined;
        if (input.length - b.p - /* CRC-32 */4 - /* ISIZE */4 < isize * 512) {
            inflen = isize;
        }

        // compressed block
        var rawinflate = new RawInflate(input, { 'index': b.p, 'bufferSize': inflen });
        var inflated = rawinflate.decompress();
        member.data = inflated;

        b = new ByteStream(input, rawinflate.ip);

        // crc32
        var crc32 = b.readUint();
        if (CRC32.create(inflated) !== crc32) {
            throw new Error('invalid CRC-32 checksum: 0x' +
                CRC32.create(inflated).toString(16) + ' / 0x' + crc32.toString(16));
        }

        // input size
        var isize = b.readUint();
        if ((inflated.length & 0xFFFFFFFF) !== isize) {
            throw new Error('invalid input size: ' +
                (inflated.length & 0xFFFFFFFF) + ' / ' + isize);
        }

        this.member.push(member as GUnzipMember);
        this.ip = b.p;
    }

    /**
     * Decode Subfield
     * >>>: Skip to do nothing for now.
     */
    decodeSubField(ip: number, length: number) {
        return ip + length;
    };
    
    concatMember() {
        var member = this.member;
        
        var size = 0;
        for (var i = 0; i < member.length; ++i) {
            size += member[i].data.length;
        }
        
        var p = 0;
        var buffer = new Uint8Array(size);
        for (var i = 0; i < member.length; ++i) {
            buffer.set(member[i].data, p);
            p += member[i].data.length;
        }

        return buffer;
    };

}