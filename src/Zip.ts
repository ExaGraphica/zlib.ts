import { CRC32 } from "./CRC32";
import { RawDeflate, RawDeflateOptions } from "./RawDeflate";
import { stringToByteArray } from "./Util";
import { ZipEncryption } from "./ZipEncryption";

/**
 * @enum {number}
 */
export enum ZipCompressionMethod{
    STORE = 0,
    DEFLATE = 8
};

/**
 * @enum {number}
 */
export enum ZipOperatingSystem{
    MSDOS = 0,
    UNIX = 3,
    MACINTOSH = 7
};

/**
 * @enum {number}
 */
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
    comment: number[] | Uint8Array;
    password: number[] | Uint8Array | string | null = null;

    /**
     * @param {string} comment
     * @constructor
     */
    constructor(comment: number[] | Uint8Array = []){
        this.comment = comment;
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
                var key = ZipEncryption.createKey((file.option.password ?? this.password)!);

                // add header
                var buffer = file.buffer;
                
                // Shift 12 bytes
                var tmp = new Uint8Array(buffer.length + 12);
                tmp.set(buffer, 12);
                buffer = tmp;

                var j = 0;
                for (j = 0; j < 12; ++j) {
                    buffer[j] = ZipEncryption.encode(
                        key,
                        i === 11 ? (file.crc32! & 0xff) : (Math.random() * 256 | 0)
                    );
                }

                // data encryption
                for (; j < buffer.length; ++j) {
                    buffer[j] = ZipEncryption.encode(key, buffer[j]);
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

        var op1 = 0;
        var op2 = localFileSize;
        var op3 = op2 + centralDirectorySize;

        // Compress Files
        for (i = 0; i < files.length; ++i) {
            var file = files[i];
            var filenameLength = file.filename.length;
            var extraFieldLength = 0; // TODO
            var commentLength = file.option.comment ? file.option.comment.length : 0;

            //-------------------------------------------------------------------------
            // local file header & file header
            //-------------------------------------------------------------------------

            var offset = op1;

            // signature
            // local file header
            output[op1++] = LocalFileHeaderSignature[0];
            output[op1++] = LocalFileHeaderSignature[1];
            output[op1++] = LocalFileHeaderSignature[2];
            output[op1++] = LocalFileHeaderSignature[3];
            // file header
            output[op2++] = FileHeaderSignature[0];
            output[op2++] = FileHeaderSignature[1];
            output[op2++] = FileHeaderSignature[2];
            output[op2++] = FileHeaderSignature[3];

            // compressor info
            var needVersion = 20;
            output[op2++] = needVersion & 0xff;
            output[op2++] = (file.option.os) ?? ZipOperatingSystem.MSDOS;

            // need version
            output[op1++] = output[op2++] = needVersion & 0xff;
            output[op1++] = output[op2++] = (needVersion >> 8) & 0xff;

            // general purpose bit flag
            var flags = 0;
            if (file.option.password != undefined || this.password != undefined) {
                flags |= ZipFlags.ENCRYPT;
            }
            output[op1++] = output[op2++] = flags & 0xff;
            output[op1++] = output[op2++] = (flags >> 8) & 0xff;

            // compression method
            var compressionMethod = file.compressionMethod;
            output[op1++] = output[op2++] = compressionMethod & 0xff;
            output[op1++] = output[op2++] = (compressionMethod >> 8) & 0xff;

            // date
            var date = file.option.date ?? new Date();
            output[op1++] = output[op2++] =
                ((date.getMinutes() & 0x7) << 5) |
                (date.getSeconds() / 2 | 0);
            output[op1++] = output[op2++] =
                (date.getHours() << 3) |
                (date.getMinutes() >> 3);
            //
            output[op1++] = output[op2++] =
                ((date.getMonth() + 1 & 0x7) << 5) |
                (date.getDate());
            output[op1++] = output[op2++] =
                ((date.getFullYear() - 1980 & 0x7f) << 1) |
                (date.getMonth() + 1 >> 3);

            // CRC-32
            var crc32 = file.crc32!;
            output[op1++] = output[op2++] = crc32 & 0xff;
            output[op1++] = output[op2++] = (crc32 >> 8) & 0xff;
            output[op1++] = output[op2++] = (crc32 >> 16) & 0xff;
            output[op1++] = output[op2++] = (crc32 >> 24) & 0xff;

            // compressed size
            var size = file.buffer.length;
            output[op1++] = output[op2++] = size & 0xff;
            output[op1++] = output[op2++] = (size >> 8) & 0xff;
            output[op1++] = output[op2++] = (size >> 16) & 0xff;
            output[op1++] = output[op2++] = (size >> 24) & 0xff;

            // uncompressed size
            var plainSize = file.size;
            output[op1++] = output[op2++] = plainSize & 0xff;
            output[op1++] = output[op2++] = (plainSize >> 8) & 0xff;
            output[op1++] = output[op2++] = (plainSize >> 16) & 0xff;
            output[op1++] = output[op2++] = (plainSize >> 24) & 0xff;

            // filename length
            output[op1++] = output[op2++] = filenameLength & 0xff;
            output[op1++] = output[op2++] = (filenameLength >> 8) & 0xff;

            // extra field length
            output[op1++] = output[op2++] = extraFieldLength & 0xff;
            output[op1++] = output[op2++] = (extraFieldLength >> 8) & 0xff;

            // file comment length
            output[op2++] = commentLength & 0xff;
            output[op2++] = (commentLength >> 8) & 0xff;

            // disk number start
            output[op2++] = 0;
            output[op2++] = 0;

            // internal file attributes
            output[op2++] = 0;
            output[op2++] = 0;

            // external file attributes
            output[op2++] = 0;
            output[op2++] = 0;
            output[op2++] = 0;
            output[op2++] = 0;

            // relative offset of local header
            output[op2++] = offset & 0xff;
            output[op2++] = (offset >> 8) & 0xff;
            output[op2++] = (offset >> 16) & 0xff;
            output[op2++] = (offset >> 24) & 0xff;

            // filename
            var filename = file.filename;
            if (filename) {
                var filenameArr = stringToByteArray(filename);
                output.set(filenameArr, op1);
                output.set(filenameArr, op2);
                op1 += filenameLength;
                op2 += filenameLength;
            }

            // extra field
            var extraField = file.option.extraField;
            if (extraField) {
                output.set(extraField, op1);
                output.set(extraField, op2);
                op1 += extraFieldLength;
                op2 += extraFieldLength;
            }

            // comment
            var comment = file.option.comment;
            if (comment) {
                var commentArr = stringToByteArray(comment);
                output.set(commentArr, op2);
                op2 += commentLength;
            }

            //-------------------------------------------------------------------------
            // file data
            //-------------------------------------------------------------------------

            output.set(file.buffer, op1);
            op1 += file.buffer.length;
            
        }

        //-------------------------------------------------------------------------
        // end of central directory
        //-------------------------------------------------------------------------

        // signature
        output[op3++] = CentralDirectorySignature[0];
        output[op3++] = CentralDirectorySignature[1];
        output[op3++] = CentralDirectorySignature[2];
        output[op3++] = CentralDirectorySignature[3];

        // number of this disk
        output[op3++] = 0;
        output[op3++] = 0;

        // number of the disk with the start of the central directory
        output[op3++] = 0;
        output[op3++] = 0;

        // total number of entries in the central directory on this disk
        output[op3++] = files.length & 0xff;
        output[op3++] = (files.length >> 8) & 0xff;

        // total number of entries in the central directory
        output[op3++] = files.length & 0xff;
        output[op3++] = (files.length >> 8) & 0xff;

        // size of the central directory
        output[op3++] = centralDirectorySize & 0xff;
        output[op3++] = (centralDirectorySize >> 8) & 0xff;
        output[op3++] = (centralDirectorySize >> 16) & 0xff;
        output[op3++] = (centralDirectorySize >> 24) & 0xff;

        // offset of start of central directory with respect to the starting disk number
        output[op3++] = localFileSize & 0xff;
        output[op3++] = (localFileSize >> 8) & 0xff;
        output[op3++] = (localFileSize >> 16) & 0xff;
        output[op3++] = (localFileSize >> 24) & 0xff;

        // .ZIP file comment length
        commentLength = this.comment ? this.comment.length : 0;
        output[op3++] = commentLength & 0xff;
        output[op3++] = (commentLength >> 8) & 0xff;

        // .ZIP file comment
        if (this.comment) {
            output.set(this.comment, op3);
            op3 += commentLength;
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