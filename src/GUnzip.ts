import { CRC32 } from "./CRC32";
import { FlagsMask, GZipMagicNumber } from "./GZip";
import { RawInflate } from "./RawInflate";

interface GUnzipMember{
    id1: number;//signature first byte.
    id2: number;//signature second byte.
    cm: number;//compression method.
    flg: FlagsMask;//flags.
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
     * @return {!(Array.<number>|Uint8Array)} inflated buffer.
     */
    decompress() {
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
        var ip = this.ip;

        member.id1 = input[ip++],
        member.id2 = input[ip++];

        // check signature
        if (member.id1 !== GZipMagicNumber[0] || member.id2 !== GZipMagicNumber[2]) {
            throw new Error('invalid file signature:' + member.id1 + ',' + member.id2);
        }

        // check compression method
        member.cm = input[ip++];
        if(member.cm != 8) throw new Error('unknown compression method: ' + member.cm);

        // flags
        var flg = input[ip++] as FlagsMask;
        member.flg = flg;

        // modification time
        var mtime = (input[ip++]) |
            (input[ip++] << 8) |
            (input[ip++] << 16) |
            (input[ip++] << 24);
        member.mtime = new Date(mtime * 1000);

        // extra flags
        member.xfl = input[ip++];

        // operating system
        member.os = input[ip++];

        // extra
        if ((flg & FlagsMask.FEXTRA) > 0) {
            member.xlen = input[ip++] | (input[ip++] << 8);
            ip = this.decodeSubField(ip, member.xlen);
        }

        // fname
        if ((flg & FlagsMask.FNAME) > 0) {
            var str = [], c, ci = 0;
            for (; (c = input[ip++]) > 0;) {
                str[ci++] = String.fromCharCode(c);
            }
            member.name = str.join('');
        }

        // fcomment
        if ((flg & FlagsMask.FCOMMENT) > 0) {
            var str = [], c, ci = 0;
            for (; (c = input[ip++]) > 0;) {
                str[ci++] = String.fromCharCode(c);
            }
            member.comment = str.join('');
        }

        // fhcrc
        if ((flg & FlagsMask.FHCRC) > 0) {
            member.crc16 = CRC32.create(input, 0, ip) & 0xffff;
            if (member.crc16 !== (input[ip++] | (input[ip++] << 8))) {
                throw new Error('invalid header crc16');
            }
        }

        // isize を事前に取得すると展開後のサイズが分かるため、
        // inflate処理のバッファサイズが事前に分かり、高速になる
        var isize = (input[input.length - 4]) | (input[input.length - 3] << 8) |
            (input[input.length - 2] << 16) | (input[input.length - 1] << 24);

        var inflen = undefined;
        // isize の妥当性チェック
        // ハフマン符号では最小 2-bit のため、最大で 1/4 になる
        // LZ77 符号では 長さと距離 2-Byte で最大 258-Byte を表現できるため、
        // 1/128 になるとする
        // ここから入力バッファの残りが isize の 512 倍以上だったら
        // サイズ指定のバッファ確保は行わない事とする
        if (input.length - ip - /* CRC-32 */4 - /* ISIZE */4 < isize * 512) {
            inflen = isize;
        }

        // compressed block
        var rawinflate = new RawInflate(input, { 'index': ip, 'bufferSize': inflen });
        var inflated = rawinflate.decompress();
        member.data = inflated;
        ip = rawinflate.ip;

        // crc32
        var crc32 =
            ((input[ip++]) | (input[ip++] << 8) |
                (input[ip++] << 16) | (input[ip++] << 24)) >>> 0;
        if (CRC32.create(inflated) !== crc32) {
            throw new Error('invalid CRC-32 checksum: 0x' +
                CRC32.create(inflated).toString(16) + ' / 0x' + crc32.toString(16));
        }

        // input size
        var isize =
            ((input[ip++]) | (input[ip++] << 8) |
                (input[ip++] << 16) | (input[ip++] << 24)) >>> 0;
        if ((inflated.length & 0xffffffff) !== isize) {
            throw new Error('invalid input size: ' +
                (inflated.length & 0xffffffff) + ' / ' + isize);
        }

        this.member.push(member as GUnzipMember);
        this.ip = ip;
    }

    /**
     * サブフィールドのデコード
     * XXX: 現在は何もせずスキップする
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