import { ByteStream } from "ByteStream";
import { CRC32 } from "./CRC32";
import { RawDeflate, RawDeflateOptions } from "./RawDeflate";
import { stringToByteArray } from "./Util";
import { ZipCrypto } from "./ZipCrypto";

export enum ZipCompressionMethod{
    STORE = 0,
    DEFLATE = 8
};

export enum ZipOperatingSystem{
    MSDOS = 0,
    UNIX = 3,
    MACINTOSH = 7
};

export enum ZipFlags{
    ENCRYPT = 0x0001,
    DESCRIPTOR = 0x0008,
    UTF8 = 0x0800
};

export const FileHeaderSignature = new Uint8Array([0x50, 0x4b, 0x01, 0x02]);

export const LocalFileHeaderSignature = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

export const CentralDirectorySignature = new Uint8Array([0x50, 0x4b, 0x05, 0x06]);

export interface FileObjectOptions{
    compressionMethod?: ZipCompressionMethod,
    compress?: boolean,
    extraField?: Uint8Array,
    comment?: string,
    password?: Uint8Array | number[] | string,
    os?: ZipOperatingSystem,
    date?: Date,
    mtime?: Uint8Array,

    deflateOptions?: RawDeflateOptions,
}

/** @type {Array.<{
 *   buffer: !(Array.<number>|Uint8Array),
 *   option: Object,
 *   compressed: boolean,
 *   encrypted: boolean,
 *   size: number,
 *   crc32: number
 * }>} */
export interface FileObject{
    filename: string,
    buffer: Uint8Array,
    option: FileObjectOptions,
    compressed: boolean,
    compressionMethod: ZipCompressionMethod,
    encrypted: boolean,
    size: number,
    crc32: number
}

export class Zip {
    files: FileObject[] = [];
    comment: Uint8Array;
    password: number[] | Uint8Array | string | null = null;

    /**
     * @param {string} comment
     * @constructor
     */
    constructor(comment: number[] | Uint8Array = []){
        this.comment = comment instanceof Uint8Array ? comment : new Uint8Array(comment);
    }


    /**
     * @param {Array.<number>|Uint8Array} input
     * @param {Object=} opts options.
     */
    addFile(input:  number[] | Uint8Array, filename: string = '', opts: FileObjectOptions = {}) {
        /** @type {number} */
        var size = input.length;
        
        input = input instanceof Uint8Array ? input : new Uint8Array(input);
        
        // default
        var compressionMethod = opts.compressionMethod ?? ZipCompressionMethod.DEFLATE;
        
        // In-place compression
        var crc32 = 0;
        var compressed = false;
        if(opts.compress != false && compressionMethod == ZipCompressionMethod.DEFLATE){
            crc32 = CRC32.create(input);
            input = this.deflateWithOption(input, opts);
            compressed = true;
        }

        this.files.push({
            filename,
            buffer: input,
            compressionMethod,
            option: opts,
            compressed,
            encrypted: false,
            size,
            crc32
        });
    }

    /**
     * @param {(Array.<number>|Uint8Array|string)} password
     */
    setPassword(password: number[] | Uint8Array | string) {
        this.password = password;
    };

    compress(): Uint8Array {
        var files = this.files;
        
        var localFileSize = 0
        var centralDirectorySize = 0;
        // Compress all files
        for (var i = 0; i < files.length; ++i) {
            var file = files[i];
            var filenameLength = file.filename.length;
            var extraFieldLength = (file.option.extraField) ? file.option.extraField.length : 0;
            var commentLength = (file.option.comment) ? file.option.comment.length : 0;
            
            var date = file.option.date ?? new Date();
            file.option.mtime = new Uint8Array([
                ((date.getMinutes() & 0x7) << 5) |
                (date.getSeconds() >>> 1),
                (date.getHours() << 3) |
                (date.getMinutes() >> 3),
                ((date.getMonth() + 1 & 0x7) << 5) |
                (date.getDate()),
                ((date.getFullYear() - 1980 & 0x7f) << 1) |
                (date.getMonth() + 1 >> 3)
            ]);

            // If not compressed already, compress it
            if (!file.compressed) {
                // Calculate CRC32 before compressing
                file.crc32 = CRC32.create(file.buffer);

                if(file.compressionMethod == ZipCompressionMethod.DEFLATE){
                    file.buffer = this.deflateWithOption(file.buffer, file.option);
                    file.compressed = true;
                }
            }

            // encryption
            if (file.option.password != undefined || this.password != undefined) {
                // init encryption
                var key = ZipCrypto.createKey((file.option.password ?? this.password)!);
                console.log(key);

                // add header
                var buffer = file.buffer;
                
                // Shift 12 bytes
                var tmp = new Uint8Array(buffer.length + 12);
                tmp.set(buffer, 12);
                buffer = tmp;

                var b = new ByteStream(buffer, 0);
                //b.writeUint(key[0]);b.writeUint(key[1]);b.writeUint(key[2]);
                //b.writeUint(key[2]);b.writeUint(key[1]);b.writeUint(key[0]);
                for (var j = 0; j < 12; ++j) {
                    var C = buffer[j];
                    //var C = Math.floor(Math.random() * 256);
                    if(j == 10) C = (file.crc32 >>> 8) & 0xFF;
                    if(j == 11) C = (file.crc32 >>> 0) & 0xFF;
                    buffer[j] = ZipCrypto.encode(key,C);
                    /*var C = (j == 11) ? file.crc32 & 0xFF : Math.floor(Math.random() * 256);
                    C ^= ZipCrypto.getByte(key);
                    ZipCrypto.updateKeys(key, C);
                    buffer[j] = C;*/
                    console.log(C);
                }

                // data encryption
                for (; j < buffer.length; ++j) {
                    buffer[j] = ZipCrypto.encode(key, buffer[j]);
                }
                file.buffer = buffer;
            }

            // Calculate the required buffer size
            localFileSize +=
                // local file header
                30 + filenameLength +
                // file data
                file.buffer.length;

            centralDirectorySize +=
                // file header
                46 + filenameLength + commentLength;
        }

        // end of central directory
        var endOfCentralDirectorySize = 22 + (this.comment ? this.comment.length : 0);

        var output = new Uint8Array(
            localFileSize + centralDirectorySize + endOfCentralDirectorySize
        );

        var b1 = new ByteStream(output, 0);
        var b2 = new ByteStream(output, localFileSize);
        
        // Compress Files
        for (i = 0; i < files.length; ++i) {
            var file = files[i];
            var filenameLength = file.filename.length;
            var extraFieldLength = 0; // TODO
            var commentLength = file.option.comment ? file.option.comment.length : 0;
            
            // local file header & file header

            var offset = b1.p;

            // signature
            // local file header
            // output[op1++] = LocalFileHeaderSignature[0];
            // output[op1++] = LocalFileHeaderSignature[1];
            // output[op1++] = LocalFileHeaderSignature[2];
            // output[op1++] = LocalFileHeaderSignature[3];
            b1.writeArray(LocalFileHeaderSignature)
            // file header
            // output[op2++] = FileHeaderSignature[0];
            // output[op2++] = FileHeaderSignature[1];
            // output[op2++] = FileHeaderSignature[2];
            // output[op2++] = FileHeaderSignature[3];
            b2.writeArray(FileHeaderSignature);
            
            // compressor info
            var needVersion = 20;
            b2.writeByte(needVersion & 0xFF);
            b2.writeByte((file.option.os) ?? ZipOperatingSystem.MSDOS);
            
            // need version
            b1.writeShort(needVersion);
            b2.writeShort(needVersion);
            
            // general purpose bit flag
            var flags = 0;
            if (file.option.password != undefined || this.password != undefined) {
                flags |= ZipFlags.ENCRYPT;
            }
            b1.writeShort(flags);
            b2.writeShort(flags);
            
            // compression method
            var compressionMethod = file.compressionMethod;
            b1.writeShort(compressionMethod);
            b2.writeShort(compressionMethod);
            
            // date
            b1.writeArray(file.option.mtime!);
            b2.writeArray(file.option.mtime!);
            
            
            // CRC-32
            var crc32 = file.crc32;
            b1.writeUint(crc32);
            b2.writeUint(crc32);
            
            // compressed size
            var size = file.buffer.length;
            b1.writeUint(size);
            b2.writeUint(size);
            
            // uncompressed size
            var plainSize = file.size;
            b1.writeUint(plainSize);
            b2.writeUint(plainSize);
            
            // filename length
            b1.writeShort(filenameLength);
            b2.writeShort(filenameLength);
            
            // extra field length
            b1.writeShort(extraFieldLength);
            b2.writeShort(extraFieldLength);
            
            // file comment length
            b2.writeShort(commentLength);
            
            // disk number start
            b2.writeByte(0);
            b2.writeByte(0);
            
            // internal file attributes
            b2.writeByte(0);
            b2.writeByte(0);
            
            // external file attributes
            b2.writeByte(0);
            b2.writeByte(0);
            b2.writeByte(0);
            b2.writeByte(0);
            
            // relative offset of local header
            b2.writeUint(offset);
            
            // filename
            var filename = file.filename;
            if (filename) {
                var filenameArr = stringToByteArray(filename);
                b1.writeArray(filenameArr);
                b2.writeArray(filenameArr);
            }
            
            // extra field
            var extraField = file.option.extraField;
            if (extraField) {
                b1.writeArray(extraField);
                b2.writeArray(extraField);
            }
            
            // comment
            var comment = file.option.comment;
            if (comment) {
                var commentArr = stringToByteArray(comment);
                b2.writeArray(commentArr);
            }
            
            // file data
            
            b1.writeArray(file.buffer);
        }
        
        // end of central directory

        var b3 = new ByteStream(output, localFileSize + centralDirectorySize);
        //var op3 = localFileSize + centralDirectorySize;

        
        // signature
        b3.writeArray(CentralDirectorySignature);

        // number of this disk
        b3.writeByte(0);
        b3.writeByte(0);

        // number of the disk with the start of the central directory
        b3.writeByte(0);
        b3.writeByte(0);

        // total number of entries in the central directory on this disk
        b3.writeShort(files.length);

        // total number of entries in the central directory
        b3.writeShort(files.length);

        // size of the central directory
        b3.writeUint(centralDirectorySize);

        // offset of start of central directory with respect to the starting disk number
        b3.writeUint(localFileSize);

        // .ZIP file comment length
        commentLength = this.comment ? this.comment.length : 0;
        b3.writeShort(commentLength);

        // .ZIP file comment
        if (this.comment) {
            b3.writeArray(this.comment);
        }

        return output;
    };

    /**
     * @param {!(Array.<number>|Uint8Array)} input
     * @param {Object=} opts options.
     * @return {!Uint8Array}
     */
    deflateWithOption(input: Uint8Array, opts: FileObjectOptions): Uint8Array {
        var deflator = new RawDeflate(input, opts.deflateOptions);

        return deflator.compress();
    };
}