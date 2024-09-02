import { buildHuffmanTable } from "./Huffman.js";
import { BlockType, DefaultInflateBufferSize, MaxBackwardLength } from "./Constants.js";
export var BufferType;
(function (BufferType) {
    BufferType[BufferType["BLOCK"] = 0] = "BLOCK";
    BufferType[BufferType["ADAPTIVE"] = 1] = "ADAPTIVE";
})(BufferType || (BufferType = {}));
;
/** max copy length for LZ77. */
const MaxCopyLength = 258;
/** huffman order */
export const HuffmanOrder = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
/** huffman length code table. */
export const LengthCodeTable = new Uint16Array([
    0x0003, 0x0004, 0x0005, 0x0006, 0x0007, 0x0008, 0x0009, 0x000a, 0x000b,
    0x000d, 0x000f, 0x0011, 0x0013, 0x0017, 0x001b, 0x001f, 0x0023, 0x002b,
    0x0033, 0x003b, 0x0043, 0x0053, 0x0063, 0x0073, 0x0083, 0x00a3, 0x00c3,
    0x00e3, 0x0102, 0x0102, 0x0102
]);
/** huffman length extra-bits table. */
export const LengthExtraTable = new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
    5, 5, 0, 0, 0
]);
/** huffman dist code table. */
export const DistCodeTable = new Uint16Array([
    0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0007, 0x0009, 0x000d, 0x0011,
    0x0019, 0x0021, 0x0031, 0x0041, 0x0061, 0x0081, 0x00c1, 0x0101, 0x0181,
    0x0201, 0x0301, 0x0401, 0x0601, 0x0801, 0x0c01, 0x1001, 0x1801, 0x2001,
    0x3001, 0x4001, 0x6001
]);
/** huffman dist extra-bits table. */
export const DistExtraTable = new Uint8Array([
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
    11, 12, 12, 13, 13
]);
/** fixed huffman length code table */
export const FixedLiteralLengthTable = (function () {
    var lengths = new Uint8Array(288).map((_, i) => {
        if (i <= 143)
            return 8;
        else if (i <= 255)
            return 9;
        else if (i <= 279)
            return 7;
        else
            return 8;
    });
    return buildHuffmanTable(lengths);
})();
/** fixed huffman distance code table */
export const FixedDistanceTable = (function () {
    var lengths = new Uint8Array(30).map(n => 5);
    return buildHuffmanTable(lengths);
})();
export class RawInflate {
    /**
     * @constructor
     * @param {!(Uint8Array|Array.<number>)} input input buffer.
     * @param {Object} opts option parameter.
     *
     * Options for RawInflate
     *   - index: The start position of the deflate container in the input buffer
     *   - blockSize: The block size of the buffer
     *   - bufferType: Specify what BufferType is used.
     *   - resize: Truncate buffer after the algorithm is complete?
     */
    constructor(input, opts = {}) {
        var _a, _b, _c, _d;
        this.buffer = null; //inflated buffer
        this.block = [];
        this.blocks = [];
        this.bufferSize = DefaultInflateBufferSize; //block size.
        this.totalpos = 0; //total output buffer pointer.
        this.ip = 0; //input buffer pointer.
        this.op = 0; //output buffer pointer.
        this.bitsbuf = 0; //bit stream reader buffer.
        this.bitsbuflen = 0; //bit stream reader buffer size.
        this.bfinal = false; //is final block flag.
        this.bufferType = BufferType.ADAPTIVE; //buffer management.
        this.resize = false; //resize flag for memory size optimization.
        this.currentLitlenTable = null;
        this.input = input instanceof Uint8Array ? input : new Uint8Array(input);
        // option parameters
        this.ip = (_a = opts.index) !== null && _a !== void 0 ? _a : 0;
        this.bufferSize = (_b = opts.bufferSize) !== null && _b !== void 0 ? _b : DefaultInflateBufferSize;
        this.bufferType = (_c = opts.bufferType) !== null && _c !== void 0 ? _c : BufferType.ADAPTIVE;
        this.resize = (_d = opts.resize) !== null && _d !== void 0 ? _d : false;
        // initialize
        if (this.bufferType == BufferType.BLOCK) {
            this.op = MaxBackwardLength;
            this.output = new Uint8Array(MaxBackwardLength + this.bufferSize + MaxCopyLength);
        }
        else {
            this.op = 0;
            this.output = new Uint8Array(this.bufferSize);
        }
    }
    /**
     * decompress.
     * @return {!Uint8Array} inflated buffer.
     */
    decompress() {
        while (!this.bfinal) {
            this.parseBlock();
        }
        switch (this.bufferType) {
            case BufferType.BLOCK:
                return this.concatBufferBlock();
            case BufferType.ADAPTIVE:
                return this.concatBufferDynamic();
            default:
                throw new Error('invalid inflate mode');
        }
    }
    ;
    /**
     * parse deflated block.
     */
    parseBlock() {
        var header = this.readBits(3);
        // BFINAL
        if (header & 0x1)
            this.bfinal = true;
        // BTYPE
        header >>>= 1;
        switch (header) {
            // uncompressed
            case BlockType.UNCOMPRESSED:
                this.parseUncompressedBlock();
                break;
            // fixed huffman
            case BlockType.FIXED:
                this.parseFixedHuffmanBlock();
                break;
            // dynamic huffman
            case BlockType.DYNAMIC:
                this.parseDynamicHuffmanBlock();
                break;
            // reserved or other
            default:
                throw new Error('unknown BTYPE: ' + header);
        }
    }
    ;
    /**
     * read inflate bits
     * @param {number} length bits length.
     * @return {number} read bits.
     */
    readBits(length) {
        var bitsbuf = this.bitsbuf;
        var bitsbuflen = this.bitsbuflen;
        var input = this.input;
        var ip = this.ip;
        var inputLength = input.length;
        var octet; //input and output byte.
        // input byte
        if (ip + ((length - bitsbuflen + 7) >> 3) >= inputLength) {
            throw new Error('input buffer is broken');
        }
        // not enough buffer
        while (bitsbuflen < length) {
            bitsbuf |= input[ip++] << bitsbuflen;
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
    ;
    /**
     * read huffman code using table
     * @param {!HuffmanTable} table huffman code table.
     * @return {number} huffman code.
     */
    readCodeByTable(table) {
        var bitsbuf = this.bitsbuf;
        var bitsbuflen = this.bitsbuflen;
        var input = this.input;
        var ip = this.ip;
        var inputLength = input.length;
        var codeTable = table[0]; //huffman code table
        var maxCodeLength = table[1];
        // not enough buffer
        while (bitsbuflen < maxCodeLength) {
            if (ip >= inputLength) {
                break;
            }
            bitsbuf |= input[ip++] << bitsbuflen;
            bitsbuflen += 8;
        }
        // read max length
        var codeWithLength = codeTable[bitsbuf & ((1 << maxCodeLength) - 1)]; //code length & code (16bit, 16bit)
        var codeLength = codeWithLength >>> 16; //code bits length
        if (codeLength > bitsbuflen) {
            throw new Error('invalid code length: ' + codeLength);
        }
        this.bitsbuf = bitsbuf >> codeLength;
        this.bitsbuflen = bitsbuflen - codeLength;
        this.ip = ip;
        return codeWithLength & 0xFFFF;
    }
    /**
     * parse uncompressed block.
     */
    parseUncompressedBlock() {
        var input = this.input;
        var ip = this.ip;
        var output = this.output;
        var op = this.op;
        var inputLength = input.length;
        var olength = output.length; //output buffer length
        // skip buffered header bits
        this.bitsbuf = 0;
        this.bitsbuflen = 0;
        // len
        if (ip + 1 >= inputLength) {
            throw new Error('invalid uncompressed block header: LEN');
        }
        var len = input[ip++] | (input[ip++] << 8); //block length
        // nlen
        if (ip + 1 >= inputLength) {
            throw new Error('invalid uncompressed block header: NLEN');
        }
        var nlen = input[ip++] | (input[ip++] << 8); //number for check block length
        // check len & nlen
        if (len === ~nlen) {
            throw new Error('invalid uncompressed block header: length verify');
        }
        // check size
        if (ip + len > input.length)
            throw new Error('input buffer is broken');
        // expand buffer
        switch (this.bufferType) {
            case BufferType.BLOCK:
                // pre copy
                while (op + len > output.length) {
                    var preCopy = olength - op; //copy counter
                    len -= preCopy;
                    output.set(input.subarray(ip, ip + preCopy), op);
                    op += preCopy;
                    ip += preCopy;
                    this.op = op;
                    output = this.expandBufferBlock();
                    op = this.op;
                }
                break;
            case BufferType.ADAPTIVE:
                while (op + len > output.length) {
                    output = this.expandBufferAdaptive(0, 2);
                }
                break;
            default:
                throw new Error('invalid inflate mode');
        }
        // copy
        output.set(input.subarray(ip, ip + len), op);
        op += len;
        ip += len;
        this.ip = ip;
        this.op = op;
        this.output = output;
    }
    /**
     * parse fixed huffman block.
     */
    parseFixedHuffmanBlock() {
        switch (this.bufferType) {
            case BufferType.ADAPTIVE:
                this.decodeHuffmanAdaptive(FixedLiteralLengthTable, FixedDistanceTable);
                break;
            case BufferType.BLOCK:
                this.decodeHuffmanBlock(FixedLiteralLengthTable, FixedDistanceTable);
                break;
            default:
                throw new Error('invalid inflate mode');
        }
    }
    ;
    /**
     * parse dynamic huffman block.
     */
    parseDynamicHuffmanBlock() {
        var hlit = this.readBits(5) + 257; //number of literal and length codes.
        var hdist = this.readBits(5) + 1; //number of distance codes.
        var hclen = this.readBits(4) + 4; //number of code lengths.
        var codeLengths = new Uint8Array(HuffmanOrder.length); //code lengths.
        // decode code lengths
        for (var i = 0; i < hclen; ++i) {
            codeLengths[HuffmanOrder[i]] = this.readBits(3);
        }
        // decode length table
        var codeLengthsTable = buildHuffmanTable(codeLengths);
        var lengthTable = new Uint8Array(hlit + hdist);
        var prev = 0;
        for (var i = 0; i < hlit + hdist;) {
            var code = this.readCodeByTable(codeLengthsTable);
            switch (code) {
                case 16:
                    var repeat = 3 + this.readBits(2);
                    while (repeat--) {
                        lengthTable[i++] = prev;
                    }
                    break;
                case 17:
                    var repeat = 3 + this.readBits(3);
                    while (repeat--) {
                        lengthTable[i++] = 0;
                    }
                    prev = 0;
                    break;
                case 18:
                    var repeat = 11 + this.readBits(7);
                    while (repeat--) {
                        lengthTable[i++] = 0;
                    }
                    prev = 0;
                    break;
                default:
                    lengthTable[i++] = code;
                    prev = code;
                    break;
            }
        }
        //literal and length code table.
        var litlenTable = buildHuffmanTable(lengthTable.subarray(0, hlit));
        //distance code table.
        var distTable = buildHuffmanTable(lengthTable.subarray(hlit));
        switch (this.bufferType) {
            case BufferType.ADAPTIVE:
                this.decodeHuffmanAdaptive(litlenTable, distTable);
                break;
            case BufferType.BLOCK:
                this.decodeHuffmanBlock(litlenTable, distTable);
                break;
            default:
                throw new Error('invalid inflate mode');
        }
    }
    /**
     * decode huffman code
     * @param {!(Array.<number>|Uint16Array)} litlen literal and length code table.
     * @param {!(Array.<number>|Uint8Array)} dist distination code table.
     */
    decodeHuffmanBlock(litlen, dist) {
        var output = this.output;
        var op = this.op;
        this.currentLitlenTable = litlen;
        var olength = output.length - MaxCopyLength; //output position limit.
        var code; //huffman code.
        while ((code = this.readCodeByTable(litlen)) !== 256) {
            // literal
            if (code < 256) {
                if (op >= olength) {
                    this.op = op;
                    output = this.expandBufferBlock();
                    op = this.op;
                }
                output[op++] = code;
                continue;
            }
            // length code
            var ti = code - 257; //table index
            var codeLength = LengthCodeTable[ti]; //huffman code length.
            if (LengthExtraTable[ti] > 0) {
                codeLength += this.readBits(LengthExtraTable[ti]);
            }
            // dist code
            code = this.readCodeByTable(dist);
            var codeDist = DistCodeTable[code]; //huffman code distination.
            if (DistExtraTable[code] > 0) {
                codeDist += this.readBits(DistExtraTable[code]);
            }
            // LZ77 decode
            if (op >= olength) {
                this.op = op;
                output = this.expandBufferBlock();
                op = this.op;
            }
            while (codeLength--) {
                output[op] = output[(op++) - codeDist];
            }
        }
        while (this.bitsbuflen >= 8) {
            this.bitsbuflen -= 8;
            this.ip--;
        }
        this.op = op;
    }
    ;
    /**
     * decode huffman code (adaptive)
     * @param {!(Array.<number>|Uint16Array)} litlen literal and length code table.
     * @param {!(Array.<number>|Uint8Array)} dist distination code table.
     */
    decodeHuffmanAdaptive(litlen, dist) {
        var output = this.output;
        var op = this.op;
        this.currentLitlenTable = litlen;
        var olength = output.length; //output position limit
        var code; //huffman code.
        while ((code = this.readCodeByTable(litlen)) !== 256) {
            // literal
            if (code < 256) {
                if (op >= olength) {
                    output = this.expandBufferAdaptive();
                    olength = output.length;
                }
                output[op++] = code;
                continue;
            }
            // length code
            var ti = code - 257; //table index.
            var codeLength = LengthCodeTable[ti]; //huffman code length.
            if (LengthExtraTable[ti] > 0) {
                codeLength += this.readBits(LengthExtraTable[ti]);
            }
            // dist code
            code = this.readCodeByTable(dist);
            var codeDist = DistCodeTable[code]; //huffman code distination.
            if (DistExtraTable[code] > 0) {
                codeDist += this.readBits(DistExtraTable[code]);
            }
            // LZ77 decode
            if (op + codeLength > olength) {
                output = this.expandBufferAdaptive();
                olength = output.length;
            }
            while (codeLength--) {
                output[op] = output[(op++) - codeDist];
            }
        }
        while (this.bitsbuflen >= 8) {
            this.bitsbuflen -= 8;
            this.ip--;
        }
        this.op = op;
    }
    /**
     * expand output buffer.
     * @param {Object=} opt_param option parameters.
     * @return {!Uint8Array} output buffer.
     */
    expandBufferBlock() {
        var buffer = new Uint8Array(this.op - MaxBackwardLength); //store buffer.
        var backward = this.op - MaxBackwardLength; //backward base point
        var output = this.output;
        // copy to output buffer
        buffer.set(output.subarray(MaxBackwardLength, buffer.length));
        this.blocks.push(buffer);
        this.totalpos += buffer.length;
        // copy to backward buffer
        output.set(output.subarray(backward, backward + MaxBackwardLength));
        this.op = MaxBackwardLength;
        return output;
    }
    /**
     * expand output buffer. (adaptive)
     * @param {Object=} opt_param option parameters.
     * @return {!Uint8Array} output buffer pointer.
     */
    expandBufferAdaptive(addRatio = 0, fixRatio) {
        var ratio = Math.floor(this.input.length / this.ip + 1); //expantion ratio.
        /** @type {number}  */
        var newSize;
        var input = this.input;
        var output = this.output;
        ratio = (fixRatio !== null && fixRatio !== void 0 ? fixRatio : ratio) + addRatio;
        // calculate new buffer size
        if (ratio < 2) {
            //maximum number of huffman code.
            var maxHuffCode = (input.length - this.ip) / this.currentLitlenTable[2];
            var maxInflateSize = Math.floor(maxHuffCode / 2 * 258); //max inflate size.
            //new output buffer size.
            newSize = maxInflateSize < output.length ?
                output.length + maxInflateSize :
                output.length << 1;
        }
        else {
            newSize = output.length * ratio;
        }
        // buffer expantion
        var buffer = new Uint8Array(newSize); //store buffer.
        buffer.set(output);
        this.output = buffer;
        return this.output;
    }
    /**
     * concat output buffer.
     * @return {!Uint8Array} output buffer.
     */
    concatBufferBlock() {
        var pos = 0; //buffer pointer.
        var limit = this.totalpos + (this.op - MaxBackwardLength); //buffer pointer.
        var output = this.output; //output block array.
        var blocks = this.blocks; //blocks array.
        var buffer = new Uint8Array(limit); //output buffer.
        /** @type {number} loop counter. */
        var j;
        /** @type {number} loop limiter. */
        var jl;
        // single buffer
        if (blocks.length === 0) {
            return this.output.subarray(MaxBackwardLength, this.op);
        }
        // copy to buffer
        for (var i = 0; i < blocks.length; ++i) {
            var block = blocks[i];
            buffer.set(block, pos);
            pos += block.length;
        }
        // current buffer
        for (var i = MaxBackwardLength; i < this.op; ++i) {
            buffer[pos++] = output[i];
        }
        /*var outputSlice = output.subarray(MaxBackwardLength, this.op);
        buffer.set(outputSlice, pos);
        pos = outputSlice.length;*/
        this.blocks = [];
        this.buffer = buffer;
        return this.buffer;
    }
    /**
     * concat output buffer. (dynamic)
     * @return {!Uint8Array} output buffer.
     */
    concatBufferDynamic() {
        var op = this.op;
        var buffer;
        if (this.resize) {
            buffer = new Uint8Array(op);
            buffer.set(this.output.subarray(0, op));
        }
        else {
            buffer = this.output.subarray(0, op);
        }
        this.buffer = buffer;
        return this.buffer;
    }
}
