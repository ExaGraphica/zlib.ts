import { CRC32 } from "./CRC32.js";
import { RawInflate } from "./RawInflate.js";
import { stringToByteArray } from "./Util.js";
import { CentralDirectorySignature, FileHeaderSignature, LocalFileHeaderSignature, ZipCompressionMethod, ZipFlags } from "./Zip.js";
import { ZipCrypto } from "./ZipCrypto.js";
import { ByteStream } from "./ByteStream.js";
function parseLocalFileHeader(b) {
    var fh = {}; //File header build gradually
    fh.offset = b.p;
    // local file header signature
    if (b.readByte() != LocalFileHeaderSignature[0] ||
        b.readByte() != LocalFileHeaderSignature[1] ||
        b.readByte() != LocalFileHeaderSignature[2] ||
        b.readByte() != LocalFileHeaderSignature[3]) {
        throw new Error('invalid local file header signature');
    }
    fh.needVersion = b.readShort(); // version needed to extract
    fh.flags = b.readShort(); // general purpose bit flag
    fh.compression = b.readShort(); // compression method
    fh.time = b.readShort(); // last mod file time
    fh.date = b.readShort(); //last mod file date
    fh.crc32 = b.readUint(); // crc-32
    fh.compressedSize = b.readUint(); // compressed size
    fh.plainSize = b.readUint(); // uncompressed size
    fh.fileNameLength = b.readShort(); // file name length
    fh.extraFieldLength = b.readShort(); // extra field length
    fh.filename = b.readString(fh.fileNameLength); // file name
    fh.extraField = b.readArray(fh.extraFieldLength); // extra field
    fh.length = b.p - fh.offset;
    return fh;
}
;
function parseFileHeader(b) {
    var fh = {};
    fh.offset = b.p;
    // central file header signature
    if (b.readByte() != FileHeaderSignature[0] ||
        b.readByte() != FileHeaderSignature[1] ||
        b.readByte() != FileHeaderSignature[2] ||
        b.readByte() != FileHeaderSignature[3]) { //FileHeaderSignature
        throw new Error('invalid file header signature');
    }
    fh.version = b.readByte(); // version made by
    fh.os = b.readByte();
    fh.needVersion = b.readShort(); // version needed to extract
    fh.flags = b.readShort(); // general purpose bit flag
    fh.compression = b.readShort(); // compression method
    fh.time = b.readShort(); // last mod file time
    fh.date = b.readShort(); //last mod file date
    fh.crc32 = b.readUint(); // crc-32
    fh.compressedSize = b.readUint(); // compressed size
    fh.plainSize = b.readUint(); // uncompressed size
    fh.fileNameLength = b.readShort(); // file name length
    fh.extraFieldLength = b.readShort(); // extra field length
    fh.fileCommentLength = b.readShort(); // file comment length
    fh.diskNumberStart = b.readShort(); // disk number start
    fh.internalFileAttributes = b.readShort(); // internal file attributes
    fh.externalFileAttributes = b.readUint(); // external file attributes
    // relative offset of local header
    fh.relativeOffset = b.readUint();
    fh.filename = b.readString(fh.fileNameLength); // file name
    fh.extraField = b.readArray(fh.extraFieldLength); // extra field
    fh.comment = b.readArray(fh.fileCommentLength); // file comment
    fh.length = b.p - fh.offset;
    return fh;
}
function searchEOCD(input) {
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
function parseEOCD(input) {
    var EOCD = {};
    const eocdOffset = searchEOCD(input);
    const b = new ByteStream(input, eocdOffset);
    // signature
    if (b.readByte() !== CentralDirectorySignature[0] ||
        b.readByte() !== CentralDirectorySignature[1] ||
        b.readByte() !== CentralDirectorySignature[2] ||
        b.readByte() !== CentralDirectorySignature[3])
        throw new Error('invalid signature');
    EOCD.numberOfThisDisk = b.readShort();
    EOCD.startDisk = b.readShort();
    EOCD.totalEntriesThisDisk = b.readShort();
    EOCD.totalEntries = b.readShort();
    EOCD.centralDirectorySize = b.readUint();
    EOCD.centralDirectoryOffset = b.readUint();
    EOCD.commentLength = b.readShort();
    EOCD.comment = b.readArray(EOCD.commentLength);
    return EOCD;
}
;
export class Unzip {
    /**
     * @param {!(Array.<number>|Uint8Array)} input input buffer.
     * @param {Object=} opts options.
     * @constructor
     */
    constructor(input, opts = {}) {
        var _a;
        this.ip = 0;
        this.EOCD = null;
        this.input = input instanceof Uint8Array ? input : new Uint8Array(input);
        this.verify = (_a = opts.verify) !== null && _a !== void 0 ? _a : false;
        if (opts.password)
            this.password = typeof opts.password == 'string' ? stringToByteArray(opts.password) : (opts.password instanceof Uint8Array) ? opts.password : new Uint8Array(opts.password);
    }
    parseFileHeader() {
        var filelist = [];
        var filetable = {};
        if (this.fileHeaderList)
            return;
        var EOCD = parseEOCD(this.input);
        var b = new ByteStream(this.input, EOCD.centralDirectoryOffset);
        for (var i = 0; i < EOCD.totalEntries; ++i) {
            var fileHeader = parseFileHeader(b);
            filelist[i] = fileHeader;
            filetable[fileHeader.filename] = i;
        }
        if (EOCD.centralDirectorySize < b.p - EOCD.centralDirectoryOffset)
            throw new Error('invalid file header size');
        this.EOCD = EOCD;
        this.fileHeaderList = filelist;
        this.filenameToIndex = filetable;
    }
    /**
     * @param {number} index file header index.
     * @param {Object=} opts
     * @return {!Uint8Array} file data.
     */
    getFileData(index, opts = {}) {
        var _a;
        var input = this.input;
        var fileHeaderList = this.fileHeaderList;
        var buffer;
        if (!fileHeaderList)
            this.parseFileHeader();
        if (fileHeaderList[index] == undefined)
            throw new Error('wrong index');
        var offset = fileHeaderList[index].relativeOffset;
        var stream = new ByteStream(this.input, offset);
        var localFileHeader = parseLocalFileHeader(stream);
        offset += localFileHeader.length;
        var length = localFileHeader.compressedSize;
        // decryption
        if ((localFileHeader.flags & ZipFlags.ENCRYPT) !== 0) {
            var password = (_a = opts.password) !== null && _a !== void 0 ? _a : this.password;
            if (!password)
                throw new Error('encrypted: please set password');
            var key = ZipCrypto.createKey(password);
            // encryption header
            for (var i = offset; i < offset + 12; ++i) {
                ZipCrypto.decode(key, input[i]);
                console.log(input[i]);
            }
            console.log(localFileHeader.crc32);
            offset += 12;
            length -= 12;
            // decryption
            for (var i = offset; i < offset + length; ++i) {
                input[i] = ZipCrypto.decode(key, input[i]);
            }
        }
        if (localFileHeader.compression == ZipCompressionMethod.DEFLATE) {
            buffer = new RawInflate(this.input, {
                index: offset,
                bufferSize: localFileHeader.plainSize
            }).decompress();
        }
        else {
            buffer = this.input.subarray(offset, offset + length);
        }
        if (this.verify) {
            var crc32 = CRC32.create(buffer);
            if (localFileHeader.crc32 !== crc32) {
                throw new Error('Incorrect crc: file=0x' + localFileHeader.crc32.toString(16) +
                    ', data=0x' + crc32.toString(16));
            }
        }
        return buffer;
    }
    ;
    /**
     * @return {Array.<string>}
     */
    getFilenames() {
        var filenameList = [];
        if (!this.fileHeaderList)
            this.parseFileHeader();
        var fileHeaderList = this.fileHeaderList;
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
    decompress(filename, opts = {}) {
        if (!this.filenameToIndex)
            this.parseFileHeader();
        var index = this.filenameToIndex[filename];
        if (index == undefined)
            throw new Error(filename + ' not found');
        return this.getFileData(index, opts);
    }
    /**
     * @param {(Array.<number>|Uint8Array)} password
     */
    setPassword(password) {
        if (typeof password == 'string')
            this.password = stringToByteArray(password);
        else
            this.password = password instanceof Uint8Array ? password : new Uint8Array(password);
    }
}
