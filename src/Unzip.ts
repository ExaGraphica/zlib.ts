import { CRC32 } from "./CRC32";
import { RawInflate } from "./RawInflate";
import { stringToByteArray } from "./Util";
import { CentralDirectorySignature, FileHeaderSignature, LocalFileHeaderSignature, ZipCompressionMethod, ZipFlags, ZipOperatingSystem } from "./Zip";
import { ZipEncryption } from "./ZipEncryption";

export interface LocalFileHeader {
    input: Uint8Array;
    offset: number;
    length: number;
    
    
    needVersion: number;
    flags: number;
    compression: number;
    time: number;
    date: number;
    crc32: number;

    compressedSize: number;
    plainSize: number;

    filename: string;
    filenameLength: number;
    extraField: Uint8Array;
    extraFieldLenggth: number;
}
function parseLocalFileHeader(input: Uint8Array, ip: number = 0) {
    var fh: {[key: string]: any} = {};//File header build gradually

    // local file header signature
    if (input[ip++] !== LocalFileHeaderSignature[0] ||
        input[ip++] !== LocalFileHeaderSignature[1] ||
        input[ip++] !== LocalFileHeaderSignature[2] ||
        input[ip++] !== LocalFileHeaderSignature[3]) {
        throw new Error('invalid local file header signature');
    }

    // version needed to extract
    fh.needVersion = input[ip++] | (input[ip++] << 8);

    // general purpose bit flag
    fh.flags = input[ip++] | (input[ip++] << 8);

    // compression method
    fh.compression = input[ip++] | (input[ip++] << 8);

    // last mod file time
    fh.time = input[ip++] | (input[ip++] << 8);

    //last mod file date
    fh.date = input[ip++] | (input[ip++] << 8);

    // crc-32
    fh.crc32 = (
        (input[ip++]) | (input[ip++] << 8) |
        (input[ip++] << 16) | (input[ip++] << 24)
    ) >>> 0;

    // compressed size
    fh.compressedSize = (
        (input[ip++]) | (input[ip++] << 8) |
        (input[ip++] << 16) | (input[ip++] << 24)
    ) >>> 0;

    // uncompressed size
    fh.plainSize = (
        (input[ip++]) | (input[ip++] << 8) |
        (input[ip++] << 16) | (input[ip++] << 24)
    ) >>> 0;

    // file name length
    fh.fileNameLength = input[ip++] | (input[ip++] << 8);

    // extra field length
    fh.extraFieldLength = input[ip++] | (input[ip++] << 8);

    // file name
    fh.filename = String.fromCharCode.apply(null, Array.from(input.subarray(ip, ip += fh.fileNameLength)));

    // extra field
    fh.extraField = input.subarray(ip, ip += fh.extraFieldLength);

    fh.length = ip - fh.offset;

    return fh as LocalFileHeader;
};

export interface FileHeader extends LocalFileHeader {
    version: number;
    relativeOffset: number;

    os: ZipOperatingSystem;

    comment: Uint8Array;
    fileCommentLength: number;

    diskNumberStart: number;

    internalFileAttributes: number;
    externalFileAttributes: number;
}
function parseFileHeader(input: Uint8Array, ip: number = 0): FileHeader {
    var fh: {[key: string]: any} = {};
    var ip = ip ?? 0;
    // central file header signature
    if (input[ip++] !== FileHeaderSignature[0] ||
        input[ip++] !== FileHeaderSignature[1] ||
        input[ip++] !== FileHeaderSignature[2] ||
        input[ip++] !== FileHeaderSignature[3]) {
        throw new Error('invalid file header signature');
    }

    // version made by
    fh.version = input[ip++];
    fh.os = input[ip++];

    // version needed to extract
    fh.needVersion = input[ip++] | (input[ip++] << 8);

    // general purpose bit flag
    fh.flags = input[ip++] | (input[ip++] << 8);

    // compression method
    fh.compression = input[ip++] | (input[ip++] << 8);

    // last mod file time
    fh.time = input[ip++] | (input[ip++] << 8);

    //last mod file date
    fh.date = input[ip++] | (input[ip++] << 8);

    // crc-32
    fh.crc32 = (
        (input[ip++]) | (input[ip++] << 8) |
        (input[ip++] << 16) | (input[ip++] << 24)
    ) >>> 0;

    // compressed size
    fh.compressedSize = (
        (input[ip++]) | (input[ip++] << 8) |
        (input[ip++] << 16) | (input[ip++] << 24)
    ) >>> 0;

    // uncompressed size
    fh.plainSize = (
        (input[ip++]) | (input[ip++] << 8) |
        (input[ip++] << 16) | (input[ip++] << 24)
    ) >>> 0;

    // file name length
    fh.fileNameLength = input[ip++] | (input[ip++] << 8);

    // extra field length
    fh.extraFieldLength = input[ip++] | (input[ip++] << 8);

    // file comment length
    fh.fileCommentLength = input[ip++] | (input[ip++] << 8);

    // disk number start
    fh.diskNumberStart = input[ip++] | (input[ip++] << 8);

    // internal file attributes
    fh.internalFileAttributes = input[ip++] | (input[ip++] << 8);

    // external file attributes
    fh.externalFileAttributes =
        (input[ip++]) | (input[ip++] << 8) |
        (input[ip++] << 16) | (input[ip++] << 24);

    // relative offset of local header
    fh.relativeOffset = (
        (input[ip++]) | (input[ip++] << 8) |
        (input[ip++] << 16) | (input[ip++] << 24)
    ) >>> 0;

    // file name
    fh.filename = String.fromCharCode.apply(null, Array.from(input.subarray(ip, ip += fh.fileNameLength)));

    // extra field
    fh.extraField = input.subarray(ip, ip += fh.extraFieldLength);

    // file comment
    fh.comment = input.subarray(ip, ip + fh.fileCommentLength);

    fh.length = ip - fh.offset;

    return fh as FileHeader;
}

export interface UnzipOptions{
    verify?: boolean;
    password?: string | Uint8Array | number[];
}

export class Unzip {
    input: Uint8Array;
    ip: number = 0;

    eocdrOffset?: number;
    numberOfThisDisk?: number;
    startDisk?: number;
    totalEntriesThisDisk?: number;
    totalEntries?: number;
    centralDirectorySize?: number;
    centralDirectoryOffset?: number;
    commentLength?: number;
    comment?: Uint8Array;

    fileHeaderList?: FileHeader[];
    filenameToIndex?: {[key: string]: number};

    verify: boolean;
    password?: Uint8Array;

    /**
     * @param {!(Array.<number>|Uint8Array)} input input buffer.
     * @param {Object=} opts options.
     * @constructor
     */
    constructor(input: Uint8Array | number[], opts: UnzipOptions) {
        this.input = input instanceof Uint8Array ? input : new Uint8Array(input);
        this.verify = opts.verify ?? false;

        if(opts.password) this.password = typeof opts.password == 'string' ? stringToByteArray(opts.password) : (opts.password instanceof Uint8Array) ? opts.password : new Uint8Array(opts.password);
    }

    searchEOCD() {
        var input = this.input;

        for (var ip = input.length - 12; ip > 0; --ip) {
            if (input[ip] === CentralDirectorySignature[0] &&
                input[ip + 1] === CentralDirectorySignature[1] &&
                input[ip + 2] === CentralDirectorySignature[2] &&
                input[ip + 3] === CentralDirectorySignature[3]) {
                this.eocdrOffset = ip;
                return;
            }
        }
        throw new Error('End of Central Directory Record not found');
    };

    parseEOCD() {
        var input = this.input;

        if (!this.eocdrOffset) {
            this.searchEOCD();
        }
        var ip = this.eocdrOffset!;

        // signature
        if (input[ip++] !== CentralDirectorySignature[0] ||
            input[ip++] !== CentralDirectorySignature[1] ||
            input[ip++] !== CentralDirectorySignature[2] ||
            input[ip++] !== CentralDirectorySignature[3]) {
            throw new Error('invalid signature');
        }

        // number of this disk
        this.numberOfThisDisk = input[ip++] | (input[ip++] << 8);

        // number of the disk with the start of the central directory
        this.startDisk = input[ip++] | (input[ip++] << 8);

        // total number of entries in the central directory on this disk
        this.totalEntriesThisDisk = input[ip++] | (input[ip++] << 8);

        // total number of entries in the central directory
        this.totalEntries = input[ip++] | (input[ip++] << 8);

        // size of the central directory
        this.centralDirectorySize = (
            (input[ip++]) | (input[ip++] << 8) |
            (input[ip++] << 16) | (input[ip++] << 24)
        ) >>> 0;

        // offset of start of central directory with respect to the starting disk number
        this.centralDirectoryOffset = (
            (input[ip++]) | (input[ip++] << 8) |
            (input[ip++] << 16) | (input[ip++] << 24)
        ) >>> 0;

        // .ZIP file comment length
        this.commentLength = input[ip++] | (input[ip++] << 8);

        // .ZIP file comment
        this.comment = input.subarray(ip, ip + this.commentLength);
    };

    parseFileHeader() {
        var filelist: FileHeader[] = [];
        var filetable: {[key: string]: number} = {};

        if (this.fileHeaderList) return;

        if (this.centralDirectoryOffset == undefined) this.parseEOCD();
        var ip = this.centralDirectoryOffset!;

        for (var i = 0; i < this.totalEntries!; ++i) {
            var fileHeader = parseFileHeader(this.input, ip);
            ip += fileHeader.length;
            filelist[i] = fileHeader;
            filetable[fileHeader.filename] = i;
        }

        if (this.centralDirectorySize! < ip - this.centralDirectoryOffset!) throw new Error('invalid file header size');

        this.fileHeaderList = filelist;
        this.filenameToIndex = filetable;
    }

    /**
     * @param {number} index file header index.
     * @param {Object=} opts
     * @return {!Uint8Array} file data.
     */
    getFileData(index: number, opts: UnzipOptions = {}): Uint8Array {
        var input = this.input
        var fileHeaderList = this.fileHeaderList;
        var buffer;

        if (!fileHeaderList) this.parseFileHeader();
        if (fileHeaderList![index] == undefined) throw new Error('wrong index');

        var offset = fileHeaderList![index].relativeOffset;
        var localFileHeader = parseLocalFileHeader(this.input, offset);
        offset += localFileHeader.length;
        var length = localFileHeader.compressedSize;

        // decryption
        if ((localFileHeader.flags & ZipFlags.ENCRYPT) !== 0) {
            var password = opts.password ?? this.password;
            if (!password) throw new Error('encrypted: please set password');
            var key = ZipEncryption.createKey(password);
            
            // encryption header
            for (var i = offset; i < offset + 12; ++i) {
                ZipEncryption.decode(key, input[i]);
            }
            offset += 12;
            length -= 12;

            // decryption
            for (var i = offset; i < offset + length; ++i) {
                input[i] = ZipEncryption.decode(key, input[i]);
            }
        }

        if(localFileHeader.compression == ZipCompressionMethod.DEFLATE){
            buffer = new RawInflate(this.input, {
                index: offset,
                bufferSize: localFileHeader.plainSize
            }).decompress();
        }else{
            buffer = this.input.subarray(offset, offset + length);
        }

        if (this.verify) {
            var crc32 = CRC32.create(buffer);
            if (localFileHeader.crc32 !== crc32) {
                throw new Error(
                    'Incorrect crc: file=0x' + localFileHeader.crc32.toString(16) +
                    ', data=0x' + crc32.toString(16)
                );
            }
        }

        return buffer;
    };

    /**
     * @return {Array.<string>}
     */
    getFilenames(): string[] {
        var filenameList: string[] = [];

        if (!this.fileHeaderList) this.parseFileHeader();
        var fileHeaderList = this.fileHeaderList!;

        for (var i = 0; i < fileHeaderList.length; ++i) {
            filenameList[i] = fileHeaderList[i].filename;
        }

        return filenameList;
    }

    /**
     * @param {string} filename extract filename.
     * @param {Object=} opts
     * @return {!Uint8Array} decompressed data.
     */
    decompress(filename: string, opts: UnzipOptions = {}): Uint8Array {
        if (!this.filenameToIndex) this.parseFileHeader();
        var index = this.filenameToIndex![filename];

        if (index == undefined) throw new Error(filename + ' not found');

        return this.getFileData(index, opts);
    }

    /**
     * @param {(Array.<number>|Uint8Array)} password
     */
    setPassword(password: Uint8Array | number[] | string) {
        if(typeof password == 'string') this.password = stringToByteArray(password);
        else this.password = password instanceof Uint8Array ? password : new Uint8Array(password);
    }
}