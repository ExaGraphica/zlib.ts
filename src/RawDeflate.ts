/**
 * @fileoverview Deflate (RFC 1951) Encoding algorithm implementation
 */

import { BitStream } from "./BitStream";
import { Heap } from "./Heap";
import { HuffmanOrder } from "./RawInflate";
import { DefaultDeflateBufferSize } from "./Constants";
import { LZ77 } from "LZ77";
import { ByteStream } from "ByteStream";

export enum CompressionType {
    NONE = 0,
    FIXED = 1,
    DYNAMIC = 2,
    RESERVED = 3
};

/** Longest code length */
const MaxCodeLength = 16;

/** Maximum Huffman code value */
const HUFMAX = 286;

/** Fixed Huffman Code table */
const FixedHuffmanTable: [number, number][] = (function () {
    var table: [number, number][] = [], i;

    for (i = 0; i < 288; i++) {
        switch (true) {
            case (i <= 143): table.push([i + 0x030, 8]); break;
            case (i <= 255): table.push([i - 144 + 0x190, 9]); break;
            case (i <= 279): table.push([i - 256 + 0x000, 7]); break;
            case (i <= 287): table.push([i - 280 + 0x0C0, 8]); break;
            default:
                throw 'invalid literal: ' + i;
        }
    }

    return table;
})();

export interface RawDeflateOptions{
    lazy?: number,
    compressionType?: CompressionType,
    outputBuffer?: number[] | Uint8Array,
    outputIndex?: number,
}

export class RawDeflate{
    compressionType: CompressionType;
    lazy: number;
    input: Uint8Array;
    output: Uint8Array;//output output buffer.
    op: number = 0;//pos output buffer position.

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
    constructor(input: number[] | Uint8Array, opts: RawDeflateOptions = {}) {
        this.input = input instanceof Uint8Array ? input : new Uint8Array(input);

        // option parameters
        this.lazy = opts.lazy ?? 0;
        this.compressionType = opts.compressionType ?? CompressionType.DYNAMIC;
        if (opts.outputBuffer) {
            this.output = (opts.outputBuffer instanceof Uint8Array) 
                ? opts.outputBuffer : new Uint8Array(opts.outputBuffer);
        }else{
            this.output = new Uint8Array(DefaultDeflateBufferSize);
        }

        this.op = opts.outputIndex ?? 0;
    }

    /**
     * DEFLATE block creation
     * @return {!Uint8Array} Compressed byte array.
     */
    compress(): Uint8Array {
        var input = this.input;
        var length = input.length;

        // compression
        switch (this.compressionType) {
            case CompressionType.NONE:
                // each 65535-Byte (length header: 16-bit)
                for (var position = 0, length = input.length; position < length;) {
                    var blockArray = input.subarray(position, position + 0xFFFF);
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
    };

    /**
     * Create uncompressed block
     * @param {!Uint8Array} blockArray Block data
     * @param {!boolean} isFinalBlock Is this the last block?
     * @return {!Uint8Array} Uncompressed block
     */
    makeNocompressBlock(blockArray: Uint8Array, isFinalBlock: boolean): Uint8Array {
        var output = this.output;

        // expand buffer
        output = new Uint8Array(this.output.buffer);
        var b = new ByteStream(output, this.op);
        
        var len = output.length;
        while (len <= this.op + blockArray.length + 5) {
            len = len << 1;
        }
        b.expandLength(len);

        // header
        var btype = CompressionType.NONE;
        b.writeByte((isFinalBlock ? 1 : 0) | (btype << 1));

        // length
        var len = blockArray.length;
        //var nlen = (~len + 0x10000) & 0xFFFF;
        var nlen = len ^ 0xFFFF;
        b.writeShort(len);
        b.writeShort(nlen);

        // copy buffer
        b.writeArray(blockArray);
        b.truncateBuffer(b.p);

        this.output = b.buffer, this.op = b.p;
        
        return output;
    };

    /**
     * Create fixed huffman block
     * @param {!(Array<number>|Uint8Array)} blockArray Block data
     * @param {!boolean} isFinalBlock Is this the last block?
     * @return {!Uint8Array} Fixed Huffman-coded block
     */
    makeFixedHuffmanBlock(blockArray: Uint8Array, isFinalBlock: boolean): Uint8Array {
        var stream: BitStream = new BitStream(new Uint8Array(this.output.buffer), this.op);

        // header
        stream.writeBits(isFinalBlock ? 1 : 0, 1, true);//bfinal
        stream.writeBits(CompressionType.FIXED, 2, true);//btype

        var lz = new LZ77(blockArray, this.lazy);
        lz.encode();
        this.fixedHuffman(lz, stream);

        return stream.finish();
    };

    /**
     * Create Dynamic Huffman Block
     * @param {!(Array<number>|Uint8Array)} blockArray Block data
     * @param {!boolean} isFinalBlock Is this the final block?
     * @return {!(Uint8Array} Dynamic Huffman-coded block
     */
    makeDynamicHuffmanBlock(blockArray: Uint8Array, isFinalBlock: boolean): Uint8Array {
        var stream = new BitStream(new Uint8Array(this.output.buffer), this.op);
        
        // header
        stream.writeBits(isFinalBlock ? 1 : 0, 1, true);//bfinal
        stream.writeBits(CompressionType.DYNAMIC, 2, true);//btype
        
        var lz = new LZ77(blockArray, this.lazy);
        var lzBuffer = lz.encode();
        
        // Calculating huffman codes for the literals+lengths and the distances
        var litLenLengths = this.getLengths(lz.freqsLitLen, 15);
        var litLenCodes = this.getCodesFromLengths(litLenLengths);
        var distLengths = this.getLengths(lz.freqsDist, 7);
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
            var bitlen: number;

            stream.writeBits(treeCodes[code], treeLengths[code], true);

            // extra bits
            if (code >= 16) {
                i++;
                switch (code) {
                    case 16: bitlen = 2; break;
                    case 17: bitlen = 3; break;
                    case 18: bitlen = 7; break;
                    default:
                        throw 'invalid code: ' + code;
                }

                stream.writeBits(treeSymbols.codes[i], bitlen, true);
            }
        }

        this.dynamicHuffman(
            lzBuffer,
            [litLenCodes, litLenLengths],
            [distCodes, distLengths],
            stream
        );

        return stream.finish();
    }


    /**
     * Dynamic Huffman Coding (Custom Huffman Tables)
     * @param {!(Array<number>|Uint16Array)} dataArray LZ77-Encoded byte array.
     * @param {Array<Uint16Array, Uint8Array>} litLen Literals/lengths [codes, lengths] tuple
     * @param {Array<Uint16Array,Uint8Array>} dist Distance [codes, lengths] tuple
     * @param {!BitStream} stream Write to BitStream.
     * @return {!BitStream} Huffman encoded BitStream object.
     */
    dynamicHuffman(
        dataArray: number[] | Uint16Array, 
        litLen: [Uint16Array, Uint8Array], 
        dist: [Uint16Array, Uint8Array], 
        stream: BitStream
    ): BitStream {
        var litLenCodes = litLen[0];
        var litLenLengths = litLen[1];
        var distCodes = dist[0];
        var distLengths = dist[1];

        // Write codes to the BitStream
        for (var index = 0; index < dataArray.length; ++index) {
            var literal = dataArray[index];
            var code: number;

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
            } else if (literal === 256) {
                // Terminate if literal==256
                break;
            }
        }

        return stream;
    };

    /**
     * Fixed Huffman Coding
     * @param {!(Array<number>|Uint16Array)} dataArray LZ77-encoded byte array.
     * @param {!BitStream} stream Write to BitStream.
     * @return {!BitStream} Huffman-encoded BitStream object.
     */
    fixedHuffman(lz: LZ77, stream: BitStream): BitStream {
        // Write the code to the BitStream.
        var lzOutput = lz.output;
        for (var index = 0; index < lzOutput.length; index++) {
            var literal = lzOutput[index];

            // Write the code
            var huffCode = FixedHuffmanTable[literal];
            stream.writeBits(huffCode[0], huffCode[1]);

            // Length / distance code
            if (literal > 0x100) {
                // length extra
                stream.writeBits(lzOutput[++index], lzOutput[++index], true);
                // distance
                stream.writeBits(lzOutput[++index], 5);
                // distance extra
                stream.writeBits(lzOutput[++index], lzOutput[++index], true);
            } else if (literal === 0x100) {
                //Terminate if literal equals 256
                break;
            }
        }

        return stream;
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
    getTreeSymbols(hlit: number, litlenLengths: Uint8Array, hdist: number, distLengths: Uint8Array): {codes: Uint32Array, freqs: Uint8Array} {
        var src = new Uint32Array(hlit + hdist);
        var i, j; 
        var l = hlit + hdist;//src length
        var result = new Uint32Array(286 + 30),
            freqs = new Uint8Array(19);

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
                } else {
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
                        } else {
                            result[nResult++] = 18;
                            result[nResult++] = rpt - 11;
                            freqs[18]++;
                        }

                        runLength -= rpt;
                    }
                }
            } else {
                result[nResult++] = src[i];
                freqs[src[i]]++;
                runLength--;

                // If the number of repetitions is less than 3, no runlength code is used.
                if (runLength < 3) {
                    while (runLength-- > 0) {
                        result[nResult++] = src[i];
                        freqs[src[i]]++;
                    }
                } else {
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
    private getLengths(freqs: Uint8Array | Uint32Array, limit: number): Uint8Array {
        var nSymbols = freqs.length;
        var heap = new Heap(2 * HUFMAX);
        var length = new Uint8Array(nSymbols);

        // Build heap
        for (var i = 0; i < nSymbols; ++i) {
            if (freqs[i] > 0) {
                heap.push(i, freqs[i]);
            }
        }
        var nodes = new Array(heap.nodes);
        var values = new Uint32Array(heap.nodes);

        // If there is only one non-zero element, assign it a code length of 1 and exit
        if (nodes.length === 1) {
            length[heap.pop().index] = 1;
            return length;
        }

        // Determine the code length of a Canonical Huffman Code by using the Reverse Package Merge Algorithm
        var heapNodes = heap.nodes;
        for (var i = 0; i < heapNodes; ++i) {
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
     * https://gist.github.com/imaya/3985581
     * @param {!Uint32Array} freqs sorted probability.
     * @param {number} symbols number of symbols.
     * @param {number} limit code length limit.
     * @return {!Uint8Array} code lengths.
     */
    reversePackageMerge(freqs: Uint32Array, symbols: number, limit: number): Uint8Array {
        var minimumCost = new Uint16Array(limit);
        var flag: boolean[] = new Array(limit);
        var codeLength = new Uint8Array(symbols).fill(limit);
        var value: number[][] = new Array(limit);
        var type = new Array(limit);
        var currentPosition = new Array(limit).fill(0);
        
        /**
         * Recursive Take Package
         * @param {number} j
         */
        function takePackage(j: number) {
            var x: number = type[j][currentPosition[j]];
           
            if (x === symbols) {
                takePackage(j + 1);
                takePackage(j + 1);
            } else {
                codeLength[x]--;
            }
            
            currentPosition[j]++;
        }
        
        minimumCost[limit - 1] = symbols;
        
        var excess = (1 << limit) - symbols;
        var half = (1 << (limit - 1));
        
        for (var j = 0; j < limit; ++j) {
            if (excess < half) {
                flag[j] = false;
            } else {
                flag[j] = true;
                excess -= half;
            }
            excess <<= 1;
            minimumCost[limit - 2 - j] = (minimumCost[limit - 1 - j] >>> 1) + symbols;
        }
        
        minimumCost[0] = Number(flag[0]);

        value[0] = new Array(minimumCost[0]);//aka flag[0]
        type[0] = new Array(minimumCost[0]);
        for (var j = 1; j < limit; ++j) {
            if (minimumCost[j] > 2 * minimumCost[j - 1] + Number(flag[j])) {
                minimumCost[j] = 2 * minimumCost[j - 1] + Number(flag[j]);
            }
            value[j] = new Array(minimumCost[j]);
            type[j] = new Array(minimumCost[j]);
        }
        

        for (var t = 0; t < minimumCost[limit - 1]; ++t) {
            value[limit - 1][t] = freqs[t];
            type[limit - 1][t] = t;
        }
        
        if (flag[limit - 1]) {
            codeLength[0]--;
            currentPosition[limit - 1]++;
        }

        for (var j = limit - 2; j >= 0; j--) {
            var i = 0;
            var next = currentPosition[j + 1];

            for (var t = 0; t < minimumCost[j]; t++) {
                var weight = value[j + 1][next] + value[j + 1][next + 1];

                if (weight > freqs[i]) {
                    value[j][t] = weight;
                    type[j][t] = symbols;
                    next += 2;
                } else {
                    value[j][t] = freqs[i];
                    type[j][t] = i;
                    i++;
                }
            }

            currentPosition[j] = 0;
            if (flag[j]) takePackage(j);
        }

        return codeLength;
    };

    /**
     * Get Huffman code from code length array
     * reference: PuTTY Deflate implementation
     * @param {!Uint8Array} lengths Code lengths
     * @return {!Uint16Array} Huffman code sequence
     * @private
     */
    private getCodesFromLengths(lengths: Uint8Array): Uint16Array {
        var codes = new Uint16Array(lengths.length),
            count: number[] = [],
            startCode: number[] = [],
            code = 0, j, m;

        // Count the codes of each length.
        for (var i = 0; i < lengths.length; i++) {
            count[lengths[i]] = (count[lengths[i]] ?? 0) + 1;
        }

        // Determine the starting code for each length block.
        for (var i = 1; i <= MaxCodeLength; i++) {
            startCode[i] = code;
            code += count[i] ?? 0;
            code <<= 1;
        }

        // Determine the code for each symbol. Mirrored, of course.
        for (var i = 0; i < lengths.length; i++) {
            code = startCode[lengths[i]];
            startCode[lengths[i]] += 1;
            codes[i] = 0;

            for (j = 0; j < lengths[i]; j++) {
                codes[i] = (codes[i] << 1) | (code & 1);
                code >>>= 1;
            }
        }

        return codes;
    };
}