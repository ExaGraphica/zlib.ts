/**
 * @fileoverview Deflate (RFC 1951) Encoding algorithm implementation
 */
import { BitStream } from "./Bitstream.js";
import { Heap } from "./Heap.js";
import { HuffmanOrder } from "./RawInflate.js";
import { DefaultDeflateBufferSize } from "./Constants.js";
export var CompressionType;
(function (CompressionType) {
    CompressionType[CompressionType["NONE"] = 0] = "NONE";
    CompressionType[CompressionType["FIXED"] = 1] = "FIXED";
    CompressionType[CompressionType["DYNAMIC"] = 2] = "DYNAMIC";
    CompressionType[CompressionType["RESERVED"] = 3] = "RESERVED";
})(CompressionType || (CompressionType = {}));
;
/** LZ77 Minimum match length */
const LZ77MinLength = 3;
/** LZ77 Maximum match length */
const LZ77MaxLength = 258;
/** LZ77 window size */
export const WindowSize = 0x8000;
/** Longest code length */
const MaxCodeLength = 16;
/** Maximum Huffman code value */
const HUFMAX = 286;
/** Fixed Huffman Code table */
const FixedHuffmanTable = (function () {
    var table = [], i;
    for (i = 0; i < 288; i++) {
        switch (true) {
            case (i <= 143):
                table.push([i + 0x030, 8]);
                break;
            case (i <= 255):
                table.push([i - 144 + 0x190, 9]);
                break;
            case (i <= 279):
                table.push([i - 256 + 0x000, 7]);
                break;
            case (i <= 287):
                table.push([i - 280 + 0x0C0, 8]);
                break;
            default:
                throw 'invalid literal: ' + i;
        }
    }
    return table;
})();
export class LZ77Match {
    /**
     * Match Info
     * @param {!number} length Match length.
     * @param {!number} backwardDistance Backward Distance.
     * @constructor
     */
    constructor(length, backwardDistance) {
        this.length = length;
        this.backwardDistance = backwardDistance;
    }
    /**
     * Distance code table
     * @param {!number} dist Distance.
     * @return {!Array<number>} Array of [code, extension bit, extension bit length].
     * @private
     */
    getDistanceCode(dist) {
        var r;
        switch (true) {
            case (dist === 1):
                r = [0, dist - 1, 0];
                break;
            case (dist === 2):
                r = [1, dist - 2, 0];
                break;
            case (dist === 3):
                r = [2, dist - 3, 0];
                break;
            case (dist === 4):
                r = [3, dist - 4, 0];
                break;
            case (dist <= 6):
                r = [4, dist - 5, 1];
                break;
            case (dist <= 8):
                r = [5, dist - 7, 1];
                break;
            case (dist <= 12):
                r = [6, dist - 9, 2];
                break;
            case (dist <= 16):
                r = [7, dist - 13, 2];
                break;
            case (dist <= 24):
                r = [8, dist - 17, 3];
                break;
            case (dist <= 32):
                r = [9, dist - 25, 3];
                break;
            case (dist <= 48):
                r = [10, dist - 33, 4];
                break;
            case (dist <= 64):
                r = [11, dist - 49, 4];
                break;
            case (dist <= 96):
                r = [12, dist - 65, 5];
                break;
            case (dist <= 128):
                r = [13, dist - 97, 5];
                break;
            case (dist <= 192):
                r = [14, dist - 129, 6];
                break;
            case (dist <= 256):
                r = [15, dist - 193, 6];
                break;
            case (dist <= 384):
                r = [16, dist - 257, 7];
                break;
            case (dist <= 512):
                r = [17, dist - 385, 7];
                break;
            case (dist <= 768):
                r = [18, dist - 513, 8];
                break;
            case (dist <= 1024):
                r = [19, dist - 769, 8];
                break;
            case (dist <= 1536):
                r = [20, dist - 1025, 9];
                break;
            case (dist <= 2048):
                r = [21, dist - 1537, 9];
                break;
            case (dist <= 3072):
                r = [22, dist - 2049, 10];
                break;
            case (dist <= 4096):
                r = [23, dist - 3073, 10];
                break;
            case (dist <= 6144):
                r = [24, dist - 4097, 11];
                break;
            case (dist <= 8192):
                r = [25, dist - 6145, 11];
                break;
            case (dist <= 12288):
                r = [26, dist - 8193, 12];
                break;
            case (dist <= 16384):
                r = [27, dist - 12289, 12];
                break;
            case (dist <= 24576):
                r = [28, dist - 16385, 13];
                break;
            case (dist <= 32768):
                r = [29, dist - 24577, 13];
                break;
            default: throw 'invalid distance';
        }
        return r;
    }
    /**
     * Returns match info as an array encoded in LZ77
     * An LZ77 Array is as follows:
     * [
     *    CODE, EXTRA-BIT-LEN, EXTRA, //Length code
     *    CODE, EXTRA-BIT-LEN, EXTRA //Distance code
     * ]
     * @return {!Array<number>} LZ77 array.
     */
    toLZ77Array() {
        var codeArray = [];
        var pos = 0;
        // length
        var code1 = LZ77Match.LengthCodeTable[this.length];
        codeArray[pos++] = code1 & 0xffff;
        codeArray[pos++] = (code1 >> 16) & 0xff;
        codeArray[pos++] = code1 >> 24;
        // distance
        var code2 = this.getDistanceCode(this.backwardDistance);
        codeArray[pos++] = code2[0];
        codeArray[pos++] = code2[1];
        codeArray[pos++] = code2[2];
        return codeArray;
    }
}
/**
 * Length code table.
 * Array in the form of [code, extension bit, extension bit length]
 */
LZ77Match.LengthCodeTable = (function () {
    var table = [];
    var i;
    var c;
    for (i = 3; i <= 258; i++) {
        c = code(i);
        table[i] = (c[2] << 24) | (c[1] << 16) | c[0];
    }
    /**
     * @param {number} length LZ77 length.
     * @return {!Array<number>} LZ77 codes.
     */
    function code(length) {
        switch (true) {
            case (length === 3):
                return [257, length - 3, 0];
                break;
            case (length === 4):
                return [258, length - 4, 0];
                break;
            case (length === 5):
                return [259, length - 5, 0];
                break;
            case (length === 6):
                return [260, length - 6, 0];
                break;
            case (length === 7):
                return [261, length - 7, 0];
                break;
            case (length === 8):
                return [262, length - 8, 0];
                break;
            case (length === 9):
                return [263, length - 9, 0];
                break;
            case (length === 10):
                return [264, length - 10, 0];
                break;
            case (length <= 12):
                return [265, length - 11, 1];
                break;
            case (length <= 14):
                return [266, length - 13, 1];
                break;
            case (length <= 16):
                return [267, length - 15, 1];
                break;
            case (length <= 18):
                return [268, length - 17, 1];
                break;
            case (length <= 22):
                return [269, length - 19, 2];
                break;
            case (length <= 26):
                return [270, length - 23, 2];
                break;
            case (length <= 30):
                return [271, length - 27, 2];
                break;
            case (length <= 34):
                return [272, length - 31, 2];
                break;
            case (length <= 42):
                return [273, length - 35, 3];
                break;
            case (length <= 50):
                return [274, length - 43, 3];
                break;
            case (length <= 58):
                return [275, length - 51, 3];
                break;
            case (length <= 66):
                return [276, length - 59, 3];
                break;
            case (length <= 82):
                return [277, length - 67, 4];
                break;
            case (length <= 98):
                return [278, length - 83, 4];
                break;
            case (length <= 114):
                return [279, length - 99, 4];
                break;
            case (length <= 130):
                return [280, length - 115, 4];
                break;
            case (length <= 162):
                return [281, length - 131, 5];
                break;
            case (length <= 194):
                return [282, length - 163, 5];
                break;
            case (length <= 226):
                return [283, length - 195, 5];
                break;
            case (length <= 257):
                return [284, length - 227, 5];
                break;
            case (length === 258):
                return [285, length - 258, 0];
                break;
            default: throw 'invalid length: ' + length;
        }
    }
    return new Uint32Array(table);
})();
export class RawDeflate {
    /**
     * Raw Deflate Implementation
     *
     * @constructor
     * @param {!(Array<number>|Uint8Array)} input Buffer to encode
     * @param {Object=} opts option parameters.
     *
     * The output buffer is converted to Uint8Array if needed.
     * Any variables referencing the given output buffer will have to be updated after compression or conversion.
     */
    constructor(input, opts = {}) {
        var _a, _b, _c;
        this.freqsLitLen = null;
        this.freqsDist = null;
        this.op = 0; //pos output buffer position.
        this.input = input instanceof Uint8Array ? input : new Uint8Array(input);
        // option parameters
        this.lazy = (_a = opts.lazy) !== null && _a !== void 0 ? _a : 0;
        this.compressionType = (_b = opts.compressionType) !== null && _b !== void 0 ? _b : CompressionType.DYNAMIC;
        if (opts.outputBuffer) {
            this.output = (opts.outputBuffer instanceof Uint8Array)
                ? opts.outputBuffer : new Uint8Array(opts.outputBuffer);
        }
        else {
            this.output = new Uint8Array(DefaultDeflateBufferSize);
        }
        this.op = (_c = opts.outputIndex) !== null && _c !== void 0 ? _c : 0;
    }
    /**
     * DEFLATE block creation
     * @return {!Uint8Array} Compressed byte array.
     */
    compress() {
        var input = this.input;
        var length = input.length;
        // compression
        switch (this.compressionType) {
            case CompressionType.NONE:
                // each 65535-Byte (length header: 16-bit)
                for (var position = 0, length = input.length; position < length;) {
                    var blockArray = input.subarray(position, position + 0xffff);
                    position += blockArray.length;
                    this.makeNocompressBlock(blockArray, (position === length));
                }
                break;
            case CompressionType.FIXED:
                this.output = this.makeFixedHuffmanBlock(input, true);
                this.op = this.output.length;
                break;
            case CompressionType.DYNAMIC:
                this.output = this.makeDynamicHuffmanBlock(input, true);
                this.op = this.output.length;
                break;
            default:
                throw 'invalid compression type';
        }
        return this.output;
    }
    ;
    /**
     * Create uncompressed block
     * @param {!(Array<number>|Uint8Array)} blockArray Block data
     * @param {!boolean} isFinalBlock Is this the last block?
     * @return {!Uint8Array} Uncompressed block
     */
    makeNocompressBlock(blockArray, isFinalBlock) {
        var output = this.output;
        var op = this.op;
        // expand buffer
        output = new Uint8Array(this.output.buffer);
        while (output.length <= op + blockArray.length + 5) {
            output = new Uint8Array(output.length << 1);
        }
        output.set(this.output);
        // header
        var btype = CompressionType.NONE;
        output[op++] = (isFinalBlock ? 1 : 0) | (btype << 1);
        // length
        var len = blockArray.length;
        var nlen = (~len + 0x10000) & 0xffff;
        output[op++] = len & 0xff;
        output[op++] = (len >>> 8) & 0xff;
        output[op++] = nlen & 0xff;
        output[op++] = (nlen >>> 8) & 0xff;
        // copy buffer
        output.set(blockArray, op);
        op += blockArray.length;
        output = output.subarray(0, op);
        this.op = op;
        this.output = output;
        return output;
    }
    ;
    /**
     * Create fixed huffman block
     * @param {!(Array<number>|Uint8Array)} blockArray Block data
     * @param {!boolean} isFinalBlock Is this the last block?
     * @return {!Uint8Array} Fixed Huffman-coded block
     */
    makeFixedHuffmanBlock(blockArray, isFinalBlock) {
        var stream = new BitStream(new Uint8Array(this.output.buffer), this.op);
        // header
        stream.writeBits(isFinalBlock ? 1 : 0, 1, true); //bfinal
        stream.writeBits(CompressionType.FIXED, 2, true); //btype
        var data = this.LZ77(blockArray);
        this.fixedHuffman(data, stream);
        return stream.finish();
    }
    ;
    /**
     * Create Dynamic Huffman Block
     * @param {!(Array<number>|Uint8Array)} blockArray Block data
     * @param {!boolean} isFinalBlock Is this the final block?
     * @return {!(Uint8Array} Dynamic Huffman-coded block
     */
    makeDynamicHuffmanBlock(blockArray, isFinalBlock) {
        var stream = new BitStream(new Uint8Array(this.output.buffer), this.op);
        // header
        stream.writeBits(isFinalBlock ? 1 : 0, 1, true); //bfinal
        stream.writeBits(CompressionType.DYNAMIC, 2, true); //btype
        var data = this.LZ77(blockArray);
        // Calculating huffman codes for the literals+lengths and the distances
        var litLenLengths = this.getLengths(this.freqsLitLen, 15);
        var litLenCodes = this.getCodesFromLengths(litLenLengths);
        var distLengths = this.getLengths(this.freqsDist, 7);
        var distCodes = this.getCodesFromLengths(distLengths);
        // get HLIT, HDIST
        var hlit, hdist;
        for (hlit = 286; hlit > 257 && litLenLengths[hlit - 1] === 0; hlit--) { }
        for (hdist = 30; hdist > 1 && distLengths[hdist - 1] === 0; hdist--) { }
        // HCLEN
        var treeSymbols = this.getTreeSymbols(hlit, litLenLengths, hdist, distLengths);
        var treeLengths = this.getLengths(treeSymbols.freqs, 7);
        var transLengths = new Array(19);
        for (i = 0; i < 19; i++) {
            transLengths[i] = treeLengths[HuffmanOrder[i]];
        }
        for (var hclen = 19; hclen > 4 && transLengths[hclen - 1] === 0; hclen--) { }
        var treeCodes = this.getCodesFromLengths(treeLengths);
        // Output header
        stream.writeBits(hlit - 257, 5, true);
        stream.writeBits(hdist - 1, 5, true);
        stream.writeBits(hclen - 4, 4, true);
        for (i = 0; i < hclen; i++) {
            stream.writeBits(transLengths[i], 3, true);
        }
        // Output tree
        for (var i = 0; i < treeSymbols.codes.length; i++) {
            var code = treeSymbols.codes[i];
            var bitlen;
            stream.writeBits(treeCodes[code], treeLengths[code], true);
            // extra bits
            if (code >= 16) {
                i++;
                switch (code) {
                    case 16:
                        bitlen = 2;
                        break;
                    case 17:
                        bitlen = 3;
                        break;
                    case 18:
                        bitlen = 7;
                        break;
                    default:
                        throw 'invalid code: ' + code;
                }
                stream.writeBits(treeSymbols.codes[i], bitlen, true);
            }
        }
        this.dynamicHuffman(data, [litLenCodes, litLenLengths], [distCodes, distLengths], stream);
        return stream.finish();
    }
    /**
     * Dynamic Huffman Coding (Custom Huffman Tables)
     * @param {!(Array<number>|Uint16Array)} dataArray LZ77-Encoded byte array.
     * @param {Array<Uint16Array, Uint8Array>} litLen Literals/lengths [codes, lengths] tuple
     * @param {Array<Uint16Array,Uint8Array>} dist Distance [codes, lengths] tuple
     * @param {!BitStream} stream Write to Bitstream.
     * @return {!BitStream} Huffman encoded Bitstream object.
     */
    dynamicHuffman(dataArray, litLen, dist, stream) {
        var litLenCodes = litLen[0];
        var litLenLengths = litLen[1];
        var distCodes = dist[0];
        var distLengths = dist[1];
        // Write codes to the BitStream
        for (var index = 0; index < dataArray.length; ++index) {
            var literal = dataArray[index];
            var code;
            // literal or length
            stream.writeBits(litLenCodes[literal], litLenLengths[literal], true);
            // Length/distnance code
            if (literal > 256) {
                // length extra
                stream.writeBits(dataArray[++index], dataArray[++index], true);
                // distance
                code = dataArray[++index];
                stream.writeBits(distCodes[code], distLengths[code], true);
                // distance extra
                stream.writeBits(dataArray[++index], dataArray[++index], true);
            }
            else if (literal === 256) {
                // Terminate if literal==256
                break;
            }
        }
        return stream;
    }
    ;
    /**
     * Fixed Huffman Coding
     * @param {!(Array<number>|Uint16Array)} dataArray LZ77-encoded byte array.
     * @param {!BitStream} stream Write to BitStream.
     * @return {!BitStream} Huffman-encoded BitStream object.
     */
    fixedHuffman(dataArray, stream) {
        // Write the code to the Bitstream.
        for (var index = 0; index < dataArray.length; index++) {
            var literal = dataArray[index];
            // Write the code
            BitStream.prototype.writeBits.apply(stream, FixedHuffmanTable[literal]);
            // Length / distance code
            if (literal > 0x100) {
                // length extra
                stream.writeBits(dataArray[++index], dataArray[++index], true);
                // distance
                stream.writeBits(dataArray[++index], 5);
                // distance extra
                stream.writeBits(dataArray[++index], dataArray[++index], true);
            }
            else if (literal === 0x100) {
                //Terminate if literal equals 256
                break;
            }
        }
        return stream;
    }
    /**
     * LZ77 Implementation
     * @param {!(Array<number>|Uint8Array)} dataArray LZ77 data to encode
     * @return {!Uint16Array} LZ77-encoded sequence
     */
    LZ77(dataArray) {
        var table = {}; //chained-hash-table
        var prevMatch = null; //previous longest match
        var LZ77buf = new Uint16Array(dataArray.length * 2); //LZ77 buffer
        var pos = 0; //LZ77 output buffer pointer
        var skipLength = 0; //LZ77 skip length
        var freqsDist = new Uint32Array(30);
        var lazy = this.lazy;
        var tmp;
        var freqsLitLen = new Uint32Array(286);
        freqsLitLen[256] = 1; // Only one End-of-block code
        /**
         * Write match data
         * @param {LZ77Match} match LZ77 Match data.
         * @param {!number} offset Relative offset
         * @private
        */
        function writeMatch(match, offset) {
            var LZ77Array = match.toLZ77Array();
            for (var i = 0; i < LZ77Array.length; ++i) {
                LZ77buf[pos++] = LZ77Array[i];
            }
            freqsLitLen[LZ77Array[0]]++;
            freqsDist[LZ77Array[3]]++;
            skipLength = match.length + offset - 1;
            prevMatch = null;
        }
        // LZ77 符号化
        var position; //input position
        var length = dataArray.length; //input length
        for (position = 0; position < length; ++position) {
            // Creating a hash key
            var matchKey = 0; //chained-hash-table key
            for (var i = 0; i < LZ77MinLength; ++i) {
                if (position + i === length)
                    break;
                matchKey = (matchKey << 8) | dataArray[position + i];
            }
            // Create a table if not already defined
            if (table[matchKey] === undefined) {
                table[matchKey] = [];
            }
            var matchList = table[matchKey];
            // skip
            if (skipLength-- > 0) {
                matchList.push(position);
                continue;
            }
            // Update match table (Remove anything exceeding the max return distance)
            while (matchList.length > 0 && position - matchList[0] > WindowSize) {
                matchList.shift();
            }
            i;
            // If there is no match at the end of the data, just pass through
            if (position + LZ77MinLength >= length) {
                if (prevMatch) {
                    writeMatch(prevMatch, -1);
                }
                for (var i = 0, il = length - position; i < il; ++i) {
                    tmp = dataArray[position + i];
                    LZ77buf[pos++] = tmp;
                    ++freqsLitLen[tmp];
                }
                break;
            }
            // Find the longest possible match
            if (matchList.length > 0) {
                var longestMatch = this.searchLongestMatch(dataArray, position, matchList);
                if (prevMatch) {
                    // Current match longer than previous?
                    if (prevMatch.length < longestMatch.length) {
                        // write previous literal
                        tmp = dataArray[position - 1];
                        LZ77buf[pos++] = tmp;
                        ++freqsLitLen[tmp];
                        // write current match
                        writeMatch(longestMatch, 0);
                    }
                    else {
                        // write previous match
                        writeMatch(prevMatch, -1);
                    }
                }
                else if (longestMatch.length < lazy) {
                    prevMatch = longestMatch;
                }
                else {
                    writeMatch(longestMatch, 0);
                }
            }
            else if (prevMatch) {
                // If there was a match previously but not this time, use the previous match
                writeMatch(prevMatch, -1);
            }
            else {
                tmp = dataArray[position];
                LZ77buf[pos++] = tmp;
                ++freqsLitLen[tmp];
            }
            matchList.push(position); // Save current position in match list
        }
        // Terminate
        LZ77buf[pos++] = 256;
        freqsLitLen[256]++;
        this.freqsLitLen = freqsLitLen;
        this.freqsDist = freqsDist;
        return LZ77buf.subarray(0, pos);
    }
    /**
     * Find the longest match among match candidates
     * @param {!Object} data plain data byte array.
     * @param {!number} position plain data byte array position.
     * @param {!Array<number>} matchList Array of candidate matches.
     * @return {!LZ77Match} The longest and shortest match options
     * @private
     */
    searchLongestMatch(data, position, matchList) {
        var currentMatch, matchMax = 0, dl = data.length;
        // Narrow down candidates one by one from behind
        permatch: for (var i = 0; i < matchList.length; i++) {
            var match = matchList[matchList.length - i - 1];
            var matchLength = LZ77MinLength;
            // Search or the longest match from the end
            if (matchMax > LZ77MinLength) {
                for (var j = matchMax; j > LZ77MinLength; j--) {
                    if (data[match + j - 1] !== data[position + j - 1]) {
                        continue permatch;
                    }
                }
                matchLength = matchMax;
            }
            // Longest match search
            while (matchLength < LZ77MaxLength &&
                position + matchLength < dl &&
                data[match + matchLength] === data[position + matchLength]) {
                ++matchLength;
            }
            // If the match length is the same, the latter is used
            if (matchLength > matchMax) {
                currentMatch = match;
                matchMax = matchLength;
            }
            // If the maximum length possible is found, break
            if (matchLength === LZ77MaxLength) {
                break;
            }
        }
        return new LZ77Match(matchMax, position - currentMatch);
    }
    /**
     * Create Tree-Transmit Symbols
     * reference: PuTTY Deflate implementation
     * @param {number} hlit HLIT.
     * @param {!(Array<number>|Uint8Array)} litlenLengths Code length arrays for literals/lengths
     * @param {number} hdist HDIST.
     * @param {!(Array<number>|Uint8Array)} distLengths Code length arrays for literals/lengths.
     * @return {{codes: !Uint32Array,freqs: !Uint8Array}} Tree-Transmit Symbols.
     */
    getTreeSymbols(hlit, litlenLengths, hdist, distLengths) {
        var src = new Uint32Array(hlit + hdist);
        var i, j;
        var l = hlit + hdist; //src length
        var result = new Uint32Array(286 + 30), freqs = new Uint8Array(19);
        // Add litlen Lengths and distlengths
        j = 0;
        for (i = 0; i < hlit; i++) {
            src[j++] = litlenLengths[i];
        }
        for (i = 0; i < hdist; i++) {
            src[j++] = distLengths[i];
        }
        // Encode
        var nResult = 0;
        for (i = 0, l = src.length; i < l; i += j) {
            // Run Length Encoding
            for (j = 1; i + j < l && src[i + j] === src[i]; ++j) { }
            var runLength = j;
            if (src[i] === 0) {
                // 0 の繰り返しが 3 回未満ならばそのまま
                if (runLength < 3) {
                    while (runLength-- > 0) {
                        result[nResult++] = 0;
                        freqs[0]++;
                    }
                }
                else {
                    while (runLength > 0) {
                        // 繰り返しは最大 138 までなので切り詰める
                        var rpt = (runLength < 138 ? runLength : 138);
                        if (rpt > runLength - 3 && rpt < runLength) {
                            rpt = runLength - 3;
                        }
                        // 3-10 回 -> 17
                        if (rpt <= 10) {
                            result[nResult++] = 17;
                            result[nResult++] = rpt - 3;
                            freqs[17]++;
                            // 11-138 回 -> 18
                        }
                        else {
                            result[nResult++] = 18;
                            result[nResult++] = rpt - 11;
                            freqs[18]++;
                        }
                        runLength -= rpt;
                    }
                }
            }
            else {
                result[nResult++] = src[i];
                freqs[src[i]]++;
                runLength--;
                // If the number of repetitions is less than 3, no runlength code is used.
                if (runLength < 3) {
                    while (runLength-- > 0) {
                        result[nResult++] = src[i];
                        freqs[src[i]]++;
                    }
                }
                else {
                    // Use RLE if there are more than  3 repetitions
                    while (runLength > 0) {
                        // Seperate runLength in to groups of 3-6
                        var rpt = (runLength < 6 ? runLength : 6);
                        if (rpt > runLength - 3 && rpt < runLength) {
                            rpt = runLength - 3;
                        }
                        result[nResult++] = 16;
                        result[nResult++] = rpt - 3;
                        freqs[16]++;
                        runLength -= rpt;
                    }
                }
            }
        }
        return {
            codes: result.subarray(0, nResult),
            freqs: freqs
        };
    }
    /**
     * Get the lengths of a Huffman Code
     * @param {!(Uint8Array|Uint32Array)} freqs Frequency count array (histogram).
     * @param {number} limit Code length limit.
     * @return {!Uint8Array} Code length array.
     * @private
     */
    getLengths(freqs, limit) {
        var nSymbols = freqs.length;
        var heap = new Heap(2 * HUFMAX);
        var length = new Uint8Array(nSymbols);
        // Build heap
        for (var i = 0; i < nSymbols; ++i) {
            if (freqs[i] > 0) {
                heap.push(i, freqs[i]);
            }
        }
        var nodes = new Array(heap.length / 2);
        var values = new Uint32Array(heap.length / 2);
        // If there is only one non-zero element, assign it a code length of 1 and exit
        if (nodes.length === 1) {
            length[heap.pop().index] = 1;
            return length;
        }
        // Determine the code length of a Canonical Huffman Code by using the Reverse Package Merge Algorithm
        var heapLength = heap.length / 2;
        for (var i = 0; i < heapLength; ++i) {
            nodes[i] = heap.pop();
            values[i] = nodes[i].value;
        }
        var codeLength = this.reversePackageMerge(values, values.length, limit);
        for (i = 0; i < nodes.length; ++i) {
            length[nodes[i].index] = codeLength[i];
        }
        return length;
    }
    /**
     * Reverse Package Merge Algorithm.
     * @param {!Uint32Array} freqs sorted probability.
     * @param {number} symbols number of symbols.
     * @param {number} limit code length limit.
     * @return {!Uint8Array} code lengths.
     */
    reversePackageMerge(freqs, symbols, limit) {
        var minimumCost = new Uint16Array(limit);
        var flag = new Uint8Array(limit);
        var codeLength = new Uint8Array(symbols);
        var value = new Array(limit);
        var type = new Array(limit);
        var currentPosition = new Array(limit);
        /**
         * Recursive Take Package
         * @param {number} j
         */
        function takePackage(j) {
            var x = type[j][currentPosition[j]];
            if (x === symbols) {
                takePackage(j + 1);
                takePackage(j + 1);
            }
            else {
                --codeLength[x];
            }
            ++currentPosition[j];
        }
        minimumCost[limit - 1] = symbols;
        var excess = (1 << limit) - symbols;
        var half = (1 << (limit - 1));
        for (var j = 0; j < limit; ++j) {
            if (excess < half) {
                flag[j] = 0;
            }
            else {
                flag[j] = 1;
                excess -= half;
            }
            excess <<= 1;
            minimumCost[limit - 2 - j] = (minimumCost[limit - 1 - j] / 2 | 0) + symbols;
        }
        minimumCost[0] = flag[0];
        value[0] = new Array(minimumCost[0]);
        type[0] = new Array(minimumCost[0]);
        for (var j = 1; j < limit; ++j) {
            if (minimumCost[j] > 2 * minimumCost[j - 1] + flag[j]) {
                minimumCost[j] = 2 * minimumCost[j - 1] + flag[j];
            }
            value[j] = new Array(minimumCost[j]);
            type[j] = new Array(minimumCost[j]);
        }
        for (var i = 0; i < symbols; ++i) {
            codeLength[i] = limit;
        }
        for (var t = 0; t < minimumCost[limit - 1]; ++t) {
            value[limit - 1][t] = freqs[t];
            type[limit - 1][t] = t;
        }
        for (var i = 0; i < limit; ++i) {
            currentPosition[i] = 0;
        }
        if (flag[limit - 1] === 1) {
            --codeLength[0];
            ++currentPosition[limit - 1];
        }
        for (var j = limit - 2; j >= 0; --j) {
            var i = 0;
            var weight = 0;
            var next = currentPosition[j + 1];
            for (var t = 0; t < minimumCost[j]; t++) {
                weight = value[j + 1][next] + value[j + 1][next + 1];
                if (weight > freqs[i]) {
                    value[j][t] = weight;
                    type[j][t] = symbols;
                    next += 2;
                }
                else {
                    value[j][t] = freqs[i];
                    type[j][t] = i;
                    ++i;
                }
            }
            currentPosition[j] = 0;
            if (flag[j] === 1) {
                takePackage(j);
            }
        }
        return codeLength;
    }
    ;
    /**
     * Get Huffman code from code length array
     * reference: PuTTY Deflate implementation
     * @param {!Uint8Array} lengths Code lengths
     * @return {!Uint16Array} Huffman code sequence
     * @private
     */
    getCodesFromLengths(lengths) {
        var codes = new Uint16Array(lengths.length), count = [], startCode = [], code = 0, il, j, m;
        // Count the codes of each length.
        for (var i = 0; i < lengths.length; i++) {
            count[lengths[i]] = (count[lengths[i]] | 0) + 1;
        }
        // Determine the starting code for each length block.
        for (var i = 1; i <= MaxCodeLength; i++) {
            startCode[i] = code;
            code += count[i] | 0;
            code <<= 1;
        }
        // Determine the code for each symbol. Mirrored, of course.
        for (var i = 0; i < lengths.length; i++) {
            code = startCode[lengths[i]];
            startCode[lengths[i]] += 1;
            codes[i] = 0;
            for (j = 0, m = lengths[i]; j < m; j++) {
                codes[i] = (codes[i] << 1) | (code & 1);
                code >>>= 1;
            }
        }
        return codes;
    }
    ;
}
