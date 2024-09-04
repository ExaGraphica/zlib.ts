
//-----------------------------------------------------------------------------

import { BlockType, DefaultInflateBufferSize, MaxBackwardLength, Z_ERR, Z_OK, Z_STATUS } from "./Constants";
import { DistCodeTable, DistExtraTable, FixedDistanceTable, FixedLiteralLengthTable, HuffmanOrder, LengthCodeTable, LengthExtraTable } from "./RawInflate";
import { buildHuffmanTable, HuffmanTable } from "./Huffman";

enum InflateStreamStatus {
    INITIALIZED = 0,
    BLOCK_HEADER_START = 1,
    BLOCK_HEADER_END = 2,
    BLOCK_BODY_START = 3,
    BLOCK_BODY_END = 4,
    DECODE_BLOCK_START = 5,
    DECODE_BLOCK_END = 6
};

export class RawInflateStream {
    block: number[] = [];
    bufferSize: number;
    totalpos: number = 0;//total output buffer pointer.

    ip: number;//input buffer pointer.
    bitsbuf: number = 0;//bit stream reader buffer.
    bitsbuflen: number = 0;//bit stream reader buffer size.

    input: Uint8Array;//input buffer.
    output: Uint8Array;//output buffer.
    op: number = 0;//output buffer pointer.
    bfinal: boolean = false;//is final block flag.
    currentBlockType: BlockType = BlockType.UNCOMPRESSED;
    blockLength: number = 0;//uncompressed block length.
    resize: boolean = false;//resize flag for memory size optimization.

    litlenTable: HuffmanTable | null = null;
    distTable: HuffmanTable | null = null;

    sp: number = 0;//stream pointer
    status: InflateStreamStatus = InflateStreamStatus.INITIALIZED;

    //
    // backup
    //
    ip_: number;
    bitsbuflen_: number = 0;
    bitsbuf_: number = 0;

    /**
     * @param {!(Uint8Array|Array.<number>)} input input buffer.
     * @param {number} ip input buffer pointer.
     * @param {number=} opt_buffersize buffer block size.
     * @constructor
     */
    constructor(input: number[] | Uint8Array, ip = 0, opt_buffersize = DefaultInflateBufferSize) {
        this.bufferSize = opt_buffersize;//block size.
        this.ip = ip;
        this.input = input instanceof Uint8Array ? input : new Uint8Array(input);
        this.output = new Uint8Array(this.bufferSize);

        this.ip_ = ip;
    };

    /**
     * decompress.
     * @return {!Uint8Array} inflated buffer.
     */
    decompress(newInput: Uint8Array, ip?: number): Uint8Array {
        var stop: boolean = false;

        if (newInput) this.input = newInput;
        this.ip = ip ?? this.ip;

        // decompress
        while (!stop) {
            switch (this.status) {
                // block header
                case InflateStreamStatus.INITIALIZED:
                case InflateStreamStatus.BLOCK_HEADER_START:
                    if (this.readBlockHeader() == Z_ERR) stop = true;
                    break;
                // block body
                case InflateStreamStatus.BLOCK_HEADER_END: /* FALLTHROUGH */
                case InflateStreamStatus.BLOCK_BODY_START:
                    switch (this.currentBlockType) {
                        case BlockType.UNCOMPRESSED:
                            if (this.readUncompressedBlockHeader() == Z_ERR) stop = true;
                            break;
                        case BlockType.FIXED:
                            this.parseFixedHuffmanBlock()
                            break;
                        case BlockType.DYNAMIC:
                            if (this.parseDynamicHuffmanBlock() == Z_ERR) stop = true;
                            break;
                    }
                    break;
                // decode data
                case InflateStreamStatus.BLOCK_BODY_END:
                case InflateStreamStatus.DECODE_BLOCK_START:
                    switch (this.currentBlockType) {
                        case BlockType.UNCOMPRESSED:
                            if (this.parseUncompressedBlock() == Z_ERR) stop = true;
                            break;
                        case BlockType.FIXED: /* FALLTHROUGH */
                        case BlockType.DYNAMIC:
                            if (this.decodeHuffman() == Z_ERR) stop = true;
                            break;
                    }
                    break;
                case InflateStreamStatus.DECODE_BLOCK_END:
                    if (this.bfinal) {
                        stop = true;
                    } else {
                        this.status = InflateStreamStatus.INITIALIZED;
                    }
                    break;
            }
        }

        return this.concatBuffer();
    }


    /** parse deflated block */
    readBlockHeader(): Z_STATUS {
        var header: number;

        this.status = InflateStreamStatus.BLOCK_HEADER_START;

        this.saveBackup();
        header = this.readBits(3);
        if (header < 0) {
            this.restoreBackup();
            return Z_ERR;
        }

        // BFINAL
        if (header & 0x1) {
            this.bfinal = true;
        }

        // BTYPE
        header >>>= 1;
        switch (header) {
            case 0: // uncompressed
                this.currentBlockType = BlockType.UNCOMPRESSED;
                break;
            case 1: // fixed huffman
                this.currentBlockType = BlockType.FIXED;
                break;
            case 2: // dynamic huffman
                this.currentBlockType = BlockType.DYNAMIC;
                break;
            default: // reserved or other
                throw new Error('unknown BTYPE: ' + header);
        }

        this.status = InflateStreamStatus.BLOCK_HEADER_END;

        return Z_OK;
    };

    /**
     * read inflate bits
     * @param {number} length bits length.
     * @return {number} read bits.
     */
    readBits(length: number): number {
        var bitsbuf = this.bitsbuf,
            bitsbuflen = this.bitsbuflen,
            input = this.input,
            ip = this.ip;

        /** @type {number} input and output byte. */
        var octet;

        // not enough buffer
        while (bitsbuflen < length) {
            // input byte
            if (input.length <= ip) {
                return Z_ERR;
            }
            octet = input[ip++];

            // concat octet
            bitsbuf |= octet << bitsbuflen;
            bitsbuflen += 8;
        }

        // output byte
        octet = bitsbuf & /* MASK */ ((1 << length) - 1);
        bitsbuf >>>= length;
        bitsbuflen -= length;

        this.bitsbuf = bitsbuf;
        this.bitsbuflen = bitsbuflen;
        this.ip = ip;

        return octet;
    }

    /**
     * read huffman code using table
     * @param {Array} table huffman code table.
     * @return {number} huffman code.
     */
    readCodeByTable(table: HuffmanTable): number {
        var bitsbuf = this.bitsbuf,
            bitsbuflen = this.bitsbuflen,
            input = this.input,
            ip = this.ip;

        /** @type {!(Array|Uint8Array)} huffman code table */
        var codeTable = table[0];
        /** @type {number} */
        var maxCodeLength = table[1];
        /** @type {number} input byte */
        var octet;
        /** @type {number} code length & code (16bit, 16bit) */
        var codeWithLength;
        /** @type {number} code bits length */
        var codeLength;

        // not enough buffer
        while (bitsbuflen < maxCodeLength) {
            if (input.length <= ip) {
                return Z_ERR;
            }
            octet = input[ip++];
            bitsbuf |= octet << bitsbuflen;
            bitsbuflen += 8;
        }

        // read max length
        codeWithLength = codeTable[bitsbuf & ((1 << maxCodeLength) - 1)];
        codeLength = codeWithLength >>> 16;

        if (codeLength > bitsbuflen) {
            throw new Error('invalid code length: ' + codeLength);
        }

        this.bitsbuf = bitsbuf >> codeLength;
        this.bitsbuflen = bitsbuflen - codeLength;
        this.ip = ip;

        return codeWithLength & 0xFFFF;
    };

    /**
     * read uncompressed block header
     */
    readUncompressedBlockHeader(): Z_STATUS {
        var len: number;//block length
        var nlen: number;//number for check block length

        var input = this.input;
        var ip = this.ip;

        this.status = InflateStreamStatus.BLOCK_BODY_START;

        if (ip + 4 >= input.length) {
            return Z_ERR;
        }

        len = input[ip++] | (input[ip++] << 8);
        nlen = input[ip++] | (input[ip++] << 8);

        // check len & nlen
        if (len === ~nlen) {
            throw new Error('invalid uncompressed block header: length verify');
        }

        // skip buffered header bits
        this.bitsbuf = 0;
        this.bitsbuflen = 0;

        this.ip = ip;
        this.blockLength = len;
        this.status = InflateStreamStatus.BLOCK_BODY_END;

        return Z_OK;
    };

    /** parse uncompressed block. */
    parseUncompressedBlock(): Z_STATUS {
        var input = this.input;
        var ip = this.ip;
        var output = this.output;
        var op = this.op;
        var len = this.blockLength;

        this.status = InflateStreamStatus.DECODE_BLOCK_START;

        // copy
        // >>>: For now, just copy
        while (len--) {
            if (op === output.length) {
                output = this.expandBuffer(0, 2);
            }

            // not enough input buffer
            if (ip >= input.length) {
                this.ip = ip;
                this.op = op;
                this.blockLength = len + 1; // Didn't copy, return ERR
                return Z_ERR;
            }

            output[op++] = input[ip++];
        }

        if (len < 0) {
            this.status = InflateStreamStatus.DECODE_BLOCK_END;
        }

        this.ip = ip;
        this.op = op;

        return Z_OK;
    };

    /** parse fixed huffman block. */
    parseFixedHuffmanBlock() {
        this.status = InflateStreamStatus.BLOCK_BODY_START;

        this.litlenTable = FixedLiteralLengthTable;
        this.distTable = FixedDistanceTable;

        this.status = InflateStreamStatus.BLOCK_BODY_END;
    };

    /**
     * Save the input pointer and bitfragment for backup purposes.
     * @private
     */
    private saveBackup() {
        this.ip_ = this.ip;
        this.bitsbuflen_ = this.bitsbuflen;
        this.bitsbuf_ = this.bitsbuf;
    };

    /**
     * Restore the input pointer and bitfragment for backup purposes
     * @private
     */
    private restoreBackup() {
        this.ip = this.ip_;
        this.bitsbuflen = this.bitsbuflen_;
        this.bitsbuf = this.bitsbuf_;
    };

    /** parse dynamic huffman block.*/
    parseDynamicHuffmanBlock(): Z_STATUS {
        var codeLengths = new Uint8Array(HuffmanOrder.length);//code lengths.

        var litlenLengths: Uint8Array;//literal and length code lengths.
        var distLengths: Uint8Array;//distance code lengths.

        this.status = InflateStreamStatus.BLOCK_BODY_START;

        this.saveBackup();

        var hlit = this.readBits(5) + 257;//number of literal and length codes.
        var hdist = this.readBits(5) + 1;//number of distance codes.
        var hclen = this.readBits(4) + 4;//number of code lengths.
        if (hlit < 0 || hdist < 0 || hclen < 0) {
            this.restoreBackup();
            return Z_ERR;
        }

        try {
            var NEI = new Error("not enough input");
            // decode code lengths
            for (var i = 0; i < hclen; ++i) {
                var bits = this.readBits(3);
                if (bits < 0) throw NEI;
                codeLengths[HuffmanOrder[i]] = bits;
            }

            var prev = 0;

            // decode length table
            var codeLengthsTable = buildHuffmanTable(codeLengths);
            var lengthTable = new Uint8Array(hlit + hdist);
            for (var i = 0; i < hlit + hdist;) {
                var code = this.readCodeByTable(codeLengthsTable);
                if (code == Z_ERR) throw NEI;

                switch (code) {
                    case 16:
                        bits = this.readBits(2);
                        if (bits == Z_ERR) throw NEI;
                        var repeat = 3 + bits;
                        while (repeat--) { lengthTable[i++] = prev; }
                        break;
                    case 17:
                        bits = this.readBits(3);
                        if (bits == Z_ERR) throw NEI;
                        var repeat = 3 + bits;
                        while (repeat--) { lengthTable[i++] = 0; }
                        prev = 0;
                        break;
                    case 18:
                        bits = this.readBits(7);
                        if (bits == Z_ERR) throw NEI;
                        var repeat = 11 + bits;
                        while (repeat--) { lengthTable[i++] = 0; }
                        prev = 0;
                        break;
                    default:
                        lengthTable[i++] = code;
                        prev = code;
                        break;
                }
            }

            // literal and length code
            litlenLengths = new Uint8Array(hlit);

            // distance code
            distLengths = new Uint8Array(hdist);

            this.litlenTable = buildHuffmanTable(lengthTable.subarray(0, hlit));
            this.distTable = buildHuffmanTable(lengthTable.subarray(hlit));
        } catch (e) {
            this.restoreBackup();
            return Z_ERR;
        }

        this.status = InflateStreamStatus.BLOCK_BODY_END;

        return Z_OK;
    }

    /**
     * decode huffman code (dynamic)
     * @return {Z_STATUS} -1 is error.
     */
    decodeHuffman(): Z_STATUS {
        var output = this.output,
            op = this.op;

        var litlen = this.litlenTable!;
        var dist = this.distTable!;

        var olength = output.length;
        var bits;

        this.status = InflateStreamStatus.DECODE_BLOCK_START;

        while (true) {
            this.saveBackup();

            var code = this.readCodeByTable(litlen);
            if (code == Z_ERR) {
                this.op = op;
                this.restoreBackup();
                return Z_ERR;
            }

            if (code === 256) {
                break;
            }

            // literal
            if (code < 256) {
                if (op === olength) {
                    output = this.expandBuffer();
                    olength = output.length;
                }
                output[op++] = code;

                continue;
            }

            // length code
            var ti = code - 257;
            var codeLength = LengthCodeTable[ti];
            if (LengthExtraTable[ti] > 0) {
                bits = this.readBits(LengthExtraTable[ti]);
                if (bits < 0) {
                    this.op = op;
                    this.restoreBackup();
                    return Z_ERR;
                }
                codeLength += bits;
            }

            // dist code
            code = this.readCodeByTable(dist);
            if (code < 0) {
                this.op = op;
                this.restoreBackup();
                return Z_ERR;
            }
            var codeDist = DistCodeTable[code];
            if (DistExtraTable[code] > 0) {
                bits = this.readBits(DistExtraTable[code]);
                if (bits < 0) {
                    this.op = op;
                    this.restoreBackup();
                    return Z_ERR;
                }
                codeDist += bits;
            }

            // LZ77 decode
            if (op + codeLength >= olength) {
                output = this.expandBuffer();
                olength = output.length;
            }

            while (codeLength--) {
                output[op] = output[(op++) - codeDist];
            }

            // break
            if (this.ip === this.input.length) {
                this.op = op;
                return Z_ERR;
            }
        }

        while (this.bitsbuflen >= 8) {
            this.bitsbuflen -= 8;
            this.ip--;
        }

        this.op = op;
        this.status = InflateStreamStatus.DECODE_BLOCK_END;

        return Z_OK;
    };

    /**
     * expand output buffer. (dynamic)
     * @param {number=} addRatio Add to expand ratio, default 0
     * @param {?fixRatio} fixRatio Set expand ratio
     * @return {!(Array|Uint8Array)} output buffer pointer.
     */
    expandBuffer(addRatio: number = 0, fixRatio?: number) {
        var ratio: number = Math.floor(this.input.length / this.ip + 1);

        var maxHuffCode: number;//maximum number of huffman code.
        var newSize: number;//new output buffer size.
        var maxInflateSize: number;//max inflate size.

        var input = this.input;
        var output = this.output;

        ratio = (fixRatio ?? ratio) + addRatio;

        // calculate new buffer size
        if (ratio < 2) {
            maxHuffCode =
                (input.length - this.ip) / this.litlenTable![2];
            // maxInflateSize = Math.floor(maxHuffCode / 2 * 258);
            maxInflateSize = Math.floor(maxHuffCode * 129);
            newSize = maxInflateSize < output.length ?
                output.length + maxInflateSize :
                output.length << 1;
        } else {
            newSize = output.length * ratio;
        }

        // buffer expantion
        var buffer = new Uint8Array(newSize);
        buffer.set(output);

        this.output = buffer;

        return this.output;
    };

    /**
     * concat output buffer. (dynamic)
     * @return {!Uint8Array} output buffer.
     */
    concatBuffer(): Uint8Array {
        var op = this.op;

        var buffer = this.resize
            ? new Uint8Array(this.output.subarray(this.sp, op))
            : this.output.subarray(this.sp, op);

        this.sp = op;

        // compaction
        if (op > MaxBackwardLength + this.bufferSize) {
            this.op = this.sp = MaxBackwardLength;

            var tmp = this.output;
            this.output = new Uint8Array(this.bufferSize + MaxBackwardLength);
            this.output.set(tmp.subarray(op - MaxBackwardLength, op));
        }

        return buffer;
    };

}