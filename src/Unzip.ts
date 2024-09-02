import { CRC32 } from "./CRC32";
import { RawInflate } from "./RawInflate";
import { stringToByteArray } from "./Util";
import { CentralDirectorySignature, FileHeaderSignature, LocalFileHeaderSignature, ZipCompressionMethod, ZipFlags, ZipOperatingSystem } from "./Zip";
import { ZipEncryption } from "./ZipEncryption";
import { ByteStream } from "ByteStream";

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
function parseLocalFileHeader(b: ByteStream): LocalFileHeader {
    var fh: {[key: string]: any} = {};//File header build gradually
    fh.offset = b.p;

    // local file header signature
    if(
        b.readByte() != LocalFileHeaderSignature[0] ||
        b.readByte() != LocalFileHeaderSignature[1] ||
        b.readByte() != LocalFileHeaderSignature[2] ||
        b.readByte() != LocalFileHeaderSignature[3]
    ){
        throw new Error('invalid local file header signature');
    }

    
    fh.needVersion = b.readWord();// version needed to extract
    fh.flags = b.readWord();// general purpose bit flag
    fh.compression = b.readWord();// compression method
    fh.time = b.readWord();// last mod file time
    fh.date = b.readWord();//last mod file date
    fh.crc32 = b.readUint();// crc-32
    fh.compressedSize = b.readUint();// compressed size
    fh.plainSize = b.readUint();// uncompressed size

    fh.fileNameLength = b.readWord();// file name length
    fh.extraFieldLength = b.readWord();// extra field length

    
    fh.filename = b.readString(fh.fileNameLength);// file name
    fh.extraField = b.readArray(fh.extraFieldLength);// extra field

    fh.length = b.p - fh.offset;

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
function parseFileHeader(b: ByteStream): FileHeader {
    var fh: {[key: string]: any} = {};
    fh.offset = b.p;

    // central file header signature
    if (
        b.readByte() != FileHeaderSignature[0] ||
        b.readByte() != FileHeaderSignature[1] ||
        b.readByte() != FileHeaderSignature[2] ||
        b.readByte() != FileHeaderSignature[3]
    ) {//FileHeaderSignature
        throw new Error('invalid file header signature');
    }

    
    fh.version = b.readByte();// version made by
    fh.os = b.readByte();

    
    fh.needVersion = b.readWord();// version needed to extract

    
    fh.flags = b.readWord();// general purpose bit flag
    fh.compression = b.readWord();// compression method
    fh.time = b.readWord();// last mod file time
    fh.date = b.readWord();//last mod file date
    fh.crc32 = b.readUint();// crc-32

    fh.compressedSize = b.readUint();// compressed size
    fh.plainSize = b.readUint();// uncompressed size

    
    fh.fileNameLength = b.readWord();// file name length
    fh.extraFieldLength = b.readWord();// extra field length
    fh.fileCommentLength = b.readWord();// file comment length

    
    fh.diskNumberStart = b.readWord();// disk number start

    fh.internalFileAttributes = b.readWord();// internal file attributes
    fh.externalFileAttributes = b.readUint();// external file attributes

    // relative offset of local header
    fh.relativeOffset = b.readUint();

    fh.filename = b.readString(fh.fileNameLength);// file name
    fh.extraField = b.readArray(fh.extraFieldLength);// extra field
    fh.comment = b.readArray(fh.fileCommentLength);// file comment

    fh.length = b.p - fh.offset;

    return fh as FileHeader;
}

export interface EOCD{
    // number of this disk
    numberOfThisDisk: number;
    // number of the disk with the start of the central directory
    startDisk: number;
    // total number of entries in the central directory on this disk
    totalEntriesThisDisk: number;
    // total number of entries in the central directory
    totalEntries: number;
    // size of the central directory
    centralDirectorySize: number;
    // offset of start of central directory with respect to the starting disk number
    centralDirectoryOffset: number;
    // .ZIP file comment length
    commentLength: number;
    // .ZIP file comment
    comment: Uint8Array;
}
function searchEOCD(input: Uint8Array){

    for (var ip = input.length - 12; ip > 0; --ip) {
        if (input[ip] === CentralDirectorySignature[0] &&
            input[ip + 1] === CentralDirectorySignature[1] &&
            input[ip + 2] === CentralDirectorySignature[2] &&
            input[ip + 3] === CentralDirectorySignature[3]) {
            return ip;
        }
    }
    throw new Error('End of Central Directory Record not found');
}
function parseEOCD(input: Uint8Array) {
    var EOCD: {[key: string]: any} = {};

    const eocdOffset = searchEOCD(input);
    const b = new ByteStream(input, eocdOffset);

    // signature
    if (
        b.readByte() !== CentralDirectorySignature[0] ||
        b.readByte() !== CentralDirectorySignature[1] ||
        b.readByte() !== CentralDirectorySignature[2] ||
        b.readByte() !== CentralDirectorySignature[3]
    ) throw new Error('invalid signature');

    EOCD.numberOfThisDisk = b.readWord();

    
    EOCD.startDisk = b.readWord();
    EOCD.totalEntriesThisDisk = b.readWord();
    EOCD.totalEntries = b.readWord();
    EOCD.centralDirectorySize = b.readUint();
    EOCD.centralDirectoryOffset = b.readUint();
    EOCD.commentLength = b.readWord();
    EOCD.comment = b.readArray(EOCD.commentLength);

    return EOCD as EOCD;
};


export interface UnzipOptions{
    verify?: boolean;
    password?: string | Uint8Array | number[];
}

export class Unzip {
    input: Uint8Array;
    ip: number = 0;

    EOCD: EOCD | null = null;

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

    parseFileHeader() {
        var filelist: FileHeader[] = [];
        var filetable: {[key: string]: number} = {};

        if (this.fileHeaderList) return;

        var EOCD = parseEOCD(this.input);

        var b = new ByteStream(this.input, EOCD.centralDirectoryOffset);

        for (var i = 0; i < EOCD.totalEntries; ++i) {
            var fileHeader = parseFileHeader(b);
            filelist[i] = fileHeader;
            filetable[fileHeader.filename] = i;
        }

        if (EOCD.centralDirectorySize < b.p - EOCD.centralDirectoryOffset) throw new Error('invalid file header size');

        this.EOCD = EOCD;
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
        var stream = new ByteStream(this.input, offset);
        var localFileHeader = parseLocalFileHeader(stream);
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