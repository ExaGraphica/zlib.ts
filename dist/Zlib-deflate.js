"use strict";
(() => {
  // src/Util.ts
  function stringToByteArray(str) {
    var tmp = new Uint8Array(str.length);
    for (var i = 0; i < tmp.length; i++) {
      tmp[i] = str[i].charCodeAt(0) & 255;
    }
    return tmp;
  }

  // src/Adler32.ts
  var Adler32 = {
    /**
     * Adler32 checksum creation
     * @param {!(string|Array<number>|Uint8Array)} array Byte array used in creation
     * @return {number} Adler32 checksum
     */
    create(array) {
      if (typeof array == "string") {
        array = stringToByteArray(array);
      } else if (!(array instanceof Uint8Array)) {
        array = new Uint8Array(array);
      }
      return this.update(1, array);
    },
    /**
     * Adler32 checksum creation
     * @param {number} adler Current hash value.
     * @param {!Uint8Array} array Byte array used in updating
     * @return {number} Adler32 checksum.
     */
    update(adler, array, len, pos = 0) {
      var s1 = adler & 65535, s2 = adler >> 16 & 65535;
      len = len ?? array.length;
      while (len > 0) {
        var tlen = len > this.OptimizationParameter ? this.OptimizationParameter : len;
        len -= tlen;
        do {
          s1 += array[pos++];
          s2 += s1;
        } while (--tlen);
        s1 %= 65521;
        s2 %= 65521;
      }
      return (s2 << 16 | s1) >>> 0;
    },
    /**
     * Adler32 Optimization parameter
     * Currently 1024 is most optimal.
     * Max 5552
     * @see http://jsperf.com/adler-32-simple-vs-optimized/3
     * @define {number}
     */
    OptimizationParameter: 1024
  };

  // src/Constants.ts
  var DEFLATE_TOKEN = 8;
  var DefaultBufferSize = 32768;
  var DefaultDeflateBufferSize = 32768;
  var DefaultInflateBufferSize = 32768;
  var DefaultBlockSize = 32768;
  var MaxBackwardLength = 32768;

  // src/BitStream.ts
  var BitStream = class _BitStream {
    /**
     * BitStream
     * @constructor
     * @param {Uint8Array=} buffer output buffer.
     * @param {number=} bufferPosition start buffer pointer.
     */
    constructor(buffer, bufferPosition = 0) {
      this.bitindex = 0;
      this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(DefaultBlockSize);
      this.index = bufferPosition;
      if (this.buffer.length * 2 <= this.index) {
        throw new Error("invalid index");
      } else if (this.buffer.length <= this.index) {
        this.expandBuffer();
      }
    }
    /**
     * Expand buffer.
     * @return {Uint8Array} new buffer.
     */
    expandBuffer() {
      var oldbuf = this.buffer;
      var buffer = new Uint8Array(oldbuf.length << 1);
      buffer.set(oldbuf);
      this.buffer = buffer;
      return buffer;
    }
    /**
    * Reverse the bit order of a 32-bit integer
    * @param {number} n 32-bit integer.
    * @return {number} reversed 32-bit integer.
    * @private
    */
    rev32(n) {
      return _BitStream.ReverseTable[n & 255] << 24 | _BitStream.ReverseTable[n >>> 8 & 255] << 16 | _BitStream.ReverseTable[n >>> 16 & 255] << 8 | _BitStream.ReverseTable[n >>> 24 & 255];
    }
    /** Writes however many speficied bits.
     * @param {number} number Number to write.
     * @param {number} b Amount of bits in number (max 32)
     * @param {boolean=} reverse Bits mean to be written in reverse order?
     */
    writeBits(number, b, reverse = false) {
      var buffer = this.buffer;
      var index = this.index;
      var bitindex = this.bitindex;
      var current = buffer[index];
      var i;
      if (reverse && b > 1) {
        number = b > 8 ? this.rev32(number) >> 32 - b : _BitStream.ReverseTable[number] >> 8 - b;
      }
      if (b + bitindex < 8) {
        current = current << b | number;
        bitindex += b;
      } else {
        for (i = 0; i < b; ++i) {
          current = current << 1 | number >> b - i - 1 & 1;
          if (++bitindex === 8) {
            bitindex = 0;
            buffer[index++] = _BitStream.ReverseTable[current];
            current = 0;
            if (index === buffer.length) {
              buffer = this.expandBuffer();
            }
          }
        }
      }
      buffer[index] = current;
      this.buffer = buffer;
      this.bitindex = bitindex;
      this.index = index;
    }
    /**
     * Terminates the stream
     * @return {Uint8Array} Returns the terminated buffer;
     */
    finish() {
      var buffer = this.buffer;
      var index = this.index;
      var output;
      if (this.bitindex > 0) {
        buffer[index] <<= 8 - this.bitindex;
        buffer[index] = _BitStream.ReverseTable[buffer[index]];
        index++;
      }
      output = buffer.subarray(0, index);
      return output;
    }
    static init() {
      this.ReverseTable = new Uint8Array(256).map((_, i) => {
        var r = i;
        var s = 7;
        for (i >>>= 1; i; i >>>= 1) {
          r <<= 1;
          r |= i & 1;
          --s;
        }
        return r << s & 255;
      });
    }
  };
  BitStream.init();

  // src/Heap.ts
  var Heap = class {
    /**
     * A heap implementation for use with custom Huffman codes.
     * @param {number} size Heap size
     * @constructor
     */
    constructor(size) {
      this.length = 0;
      this.nodes = 0;
      this.buffer = new Uint16Array(size * 2);
    }
    /**
     * Get the parent node index
     * @param {number} index Child node index
     * @return {number} Parent node index.
     */
    getParent(index) {
      return index - 2 >> 2 << 1;
    }
    /**
     * Get the index of a child node
     * @param {number} index Parent node index.
     * @return {number} Child node index.
     */
    getChild(index) {
      return 2 * index + 2;
    }
    /**
     * Add a value to Heap
     * @param {number} index key index.
     * @param {number} value Value.
     * @return {number} Current heap length.
     */
    push(index, value) {
      var current, parent, heap = this.buffer, swap;
      current = this.length;
      heap[this.length++] = value;
      heap[this.length++] = index;
      this.nodes++;
      while (current > 0) {
        parent = this.getParent(current);
        if (heap[current] > heap[parent]) {
          swap = heap[current];
          heap[current] = heap[parent];
          heap[parent] = swap;
          swap = heap[current + 1];
          heap[current + 1] = heap[parent + 1];
          heap[parent + 1] = swap;
          current = parent;
        } else {
          break;
        }
      }
      return this.length;
    }
    /**
     * Pops the largest value from the heap
     * @return {{index: number, value: number, length: number}} {index: key index,
     *     value: key, length: new heap size}
     */
    pop() {
      var heap = this.buffer, swap;
      var value = heap[0];
      var index = heap[1];
      this.nodes--;
      this.length -= 2;
      heap[0] = heap[this.length];
      heap[1] = heap[this.length + 1];
      var parent = 0;
      while (true) {
        var current = this.getChild(parent);
        if (current >= this.length) {
          break;
        }
        if (current + 2 < this.length && heap[current + 2] > heap[current]) {
          current += 2;
        }
        if (heap[current] > heap[parent]) {
          swap = heap[parent];
          heap[parent] = heap[current];
          heap[current] = swap;
          swap = heap[parent + 1];
          heap[parent + 1] = heap[current + 1];
          heap[current + 1] = swap;
        } else {
          break;
        }
        parent = current;
      }
      return { index, value, length: this.length };
    }
  };

  // src/Huffman.ts
  function buildHuffmanTable(lengths) {
    var listSize = lengths.length;
    var bitLength;
    var code;
    var skip;
    var i;
    var j;
    var value;
    var maxCodeLength = 0;
    var minCodeLength = Number.POSITIVE_INFINITY;
    for (i = 0; i < listSize; ++i) {
      if (lengths[i] > maxCodeLength) {
        maxCodeLength = lengths[i];
      }
      if (lengths[i] < minCodeLength) {
        minCodeLength = lengths[i];
      }
    }
    var size = 1 << maxCodeLength;
    var table = new Uint32Array(size);
    for (bitLength = 1, code = 0, skip = 2; bitLength <= maxCodeLength; ) {
      for (i = 0; i < listSize; ++i) {
        if (lengths[i] === bitLength) {
          var reversed = 0, rtemp = code;
          for (j = 0; j < bitLength; ++j) {
            reversed = reversed << 1 | rtemp & 1;
            rtemp >>= 1;
          }
          value = bitLength << 16 | i;
          for (j = reversed; j < size; j += skip) {
            table[j] = value;
          }
          ++code;
        }
      }
      ++bitLength;
      code <<= 1;
      skip <<= 1;
    }
    return [table, maxCodeLength, minCodeLength];
  }

  // src/RawInflate.ts
  var MaxCopyLength = 258;
  var HuffmanOrder = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var LengthCodeTable = new Uint16Array([
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    13,
    15,
    17,
    19,
    23,
    27,
    31,
    35,
    43,
    51,
    59,
    67,
    83,
    99,
    115,
    131,
    163,
    195,
    227,
    258,
    258,
    258
  ]);
  var LengthExtraTable = new Uint8Array([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0,
    0,
    0
  ]);
  var DistCodeTable = new Uint16Array([
    1,
    2,
    3,
    4,
    5,
    7,
    9,
    13,
    17,
    25,
    33,
    49,
    65,
    97,
    129,
    193,
    257,
    385,
    513,
    769,
    1025,
    1537,
    2049,
    3073,
    4097,
    6145,
    8193,
    12289,
    16385,
    24577
  ]);
  var DistExtraTable = new Uint8Array([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13
  ]);
  var FixedLiteralLengthTable = function() {
    var lengths = new Uint8Array(288).map((_, i) => {
      if (i <= 143) return 8;
      else if (i <= 255) return 9;
      else if (i <= 279) return 7;
      else return 8;
    });
    return buildHuffmanTable(lengths);
  }();
  var FixedDistanceTable = function() {
    var lengths = new Uint8Array(30).map((n) => 5);
    return buildHuffmanTable(lengths);
  }();
  var RawInflate = class {
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
      this.buffer = null;
      //inflated buffer
      this.block = [];
      this.blocks = [];
      this.bufferSize = DefaultInflateBufferSize;
      //block size.
      this.totalpos = 0;
      //input buffer.
      this.ip = 0;
      //output buffer.
      this.op = 0;
      //output buffer pointer.
      this.bitsbuf = 0;
      //bit stream reader buffer.
      this.bitsbuflen = 0;
      //bit stream reader buffer size.
      this.bfinal = false;
      //is final block flag.
      this.bufferType = 1 /* ADAPTIVE */;
      //buffer management.
      this.resize = false;
      //resize flag for memory size optimization.
      this.currentLitlenTable = null;
      this.input = input instanceof Uint8Array ? input : new Uint8Array(input);
      this.ip = opts.index ?? 0;
      this.bufferSize = opts.bufferSize ?? DefaultInflateBufferSize;
      this.bufferType = opts.bufferType ?? 1 /* ADAPTIVE */;
      this.resize = opts.resize ?? false;
      if (this.bufferType == 0 /* BLOCK */) {
        this.op = MaxBackwardLength;
        this.output = new Uint8Array(MaxBackwardLength + this.bufferSize + MaxCopyLength);
      } else {
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
        case 0 /* BLOCK */:
          return this.concatBufferBlock();
        case 1 /* ADAPTIVE */:
          return this.concatBufferDynamic();
        default:
          throw new Error("invalid inflate mode");
      }
    }
    /**
     * parse deflated block.
     */
    parseBlock() {
      var header = this.readBits(3);
      if (header & 1) this.bfinal = true;
      header >>>= 1;
      switch (header) {
        // uncompressed
        case 0 /* UNCOMPRESSED */:
          this.parseUncompressedBlock();
          break;
        // fixed huffman
        case 1 /* FIXED */:
          this.parseFixedHuffmanBlock();
          break;
        // dynamic huffman
        case 2 /* DYNAMIC */:
          this.parseDynamicHuffmanBlock();
          break;
        // reserved or other
        default:
          throw new Error("unknown BTYPE: " + header);
      }
    }
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
      var octet;
      if (ip + (length - bitsbuflen + 7 >> 3) >= inputLength) {
        throw new Error("input buffer is broken");
      }
      while (bitsbuflen < length) {
        bitsbuf |= input[ip++] << bitsbuflen;
        bitsbuflen += 8;
      }
      octet = bitsbuf & /* MASK */
      (1 << length) - 1;
      bitsbuf >>>= length;
      bitsbuflen -= length;
      this.bitsbuf = bitsbuf;
      this.bitsbuflen = bitsbuflen;
      this.ip = ip;
      return octet;
    }
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
      var codeTable = table[0];
      var maxCodeLength = table[1];
      while (bitsbuflen < maxCodeLength) {
        if (ip >= inputLength) {
          break;
        }
        bitsbuf |= input[ip++] << bitsbuflen;
        bitsbuflen += 8;
      }
      var codeWithLength = codeTable[bitsbuf & (1 << maxCodeLength) - 1];
      var codeLength = codeWithLength >>> 16;
      if (codeLength > bitsbuflen) {
        throw new Error("invalid code length: " + codeLength);
      }
      this.bitsbuf = bitsbuf >> codeLength;
      this.bitsbuflen = bitsbuflen - codeLength;
      this.ip = ip;
      return codeWithLength & 65535;
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
      var olength = output.length;
      this.bitsbuf = 0;
      this.bitsbuflen = 0;
      if (ip + 1 >= inputLength) {
        throw new Error("invalid uncompressed block header: LEN");
      }
      var len = input[ip++] | input[ip++] << 8;
      if (ip + 1 >= inputLength) {
        throw new Error("invalid uncompressed block header: NLEN");
      }
      var nlen = input[ip++] | input[ip++] << 8;
      if (len === ~nlen) {
        throw new Error("invalid uncompressed block header: length verify");
      }
      if (ip + len > input.length) throw new Error("input buffer is broken");
      switch (this.bufferType) {
        case 0 /* BLOCK */:
          while (op + len > output.length) {
            var preCopy = olength - op;
            len -= preCopy;
            output.set(input.subarray(ip, ip + preCopy), op);
            op += preCopy;
            ip += preCopy;
            this.op = op;
            output = this.expandBufferBlock();
            op = this.op;
          }
          break;
        case 1 /* ADAPTIVE */:
          while (op + len > output.length) {
            output = this.expandBufferAdaptive(0, 2);
          }
          break;
        default:
          throw new Error("invalid inflate mode");
      }
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
        case 1 /* ADAPTIVE */:
          this.decodeHuffmanAdaptive(
            FixedLiteralLengthTable,
            FixedDistanceTable
          );
          break;
        case 0 /* BLOCK */:
          this.decodeHuffmanBlock(
            FixedLiteralLengthTable,
            FixedDistanceTable
          );
          break;
        default:
          throw new Error("invalid inflate mode");
      }
    }
    /**
     * parse dynamic huffman block.
     */
    parseDynamicHuffmanBlock() {
      var hlit = this.readBits(5) + 257;
      var hdist = this.readBits(5) + 1;
      var hclen = this.readBits(4) + 4;
      var codeLengths = new Uint8Array(HuffmanOrder.length);
      for (var i = 0; i < hclen; ++i) {
        codeLengths[HuffmanOrder[i]] = this.readBits(3);
      }
      var codeLengthsTable = buildHuffmanTable(codeLengths);
      var lengthTable = new Uint8Array(hlit + hdist);
      var prev = 0;
      for (var i = 0; i < hlit + hdist; ) {
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
      var litlenTable = buildHuffmanTable(lengthTable.subarray(0, hlit));
      var distTable = buildHuffmanTable(lengthTable.subarray(hlit));
      switch (this.bufferType) {
        case 1 /* ADAPTIVE */:
          this.decodeHuffmanAdaptive(litlenTable, distTable);
          break;
        case 0 /* BLOCK */:
          this.decodeHuffmanBlock(litlenTable, distTable);
          break;
        default:
          throw new Error("invalid inflate mode");
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
      var olength = output.length - MaxCopyLength;
      var code;
      while ((code = this.readCodeByTable(litlen)) !== 256) {
        if (code < 256) {
          if (op >= olength) {
            this.op = op;
            output = this.expandBufferBlock();
            op = this.op;
          }
          output[op++] = code;
          continue;
        }
        var ti = code - 257;
        var codeLength = LengthCodeTable[ti];
        if (LengthExtraTable[ti] > 0) {
          codeLength += this.readBits(LengthExtraTable[ti]);
        }
        code = this.readCodeByTable(dist);
        var codeDist = DistCodeTable[code];
        if (DistExtraTable[code] > 0) {
          codeDist += this.readBits(DistExtraTable[code]);
        }
        if (op >= olength) {
          this.op = op;
          output = this.expandBufferBlock();
          op = this.op;
        }
        while (codeLength--) {
          output[op] = output[op++ - codeDist];
        }
      }
      while (this.bitsbuflen >= 8) {
        this.bitsbuflen -= 8;
        this.ip--;
      }
      this.op = op;
    }
    /**
     * decode huffman code (adaptive)
     * @param {!(Array.<number>|Uint16Array)} litlen literal and length code table.
     * @param {!(Array.<number>|Uint8Array)} dist distination code table.
     */
    decodeHuffmanAdaptive(litlen, dist) {
      var output = this.output;
      var op = this.op;
      this.currentLitlenTable = litlen;
      var olength = output.length;
      var code;
      while ((code = this.readCodeByTable(litlen)) !== 256) {
        if (code < 256) {
          if (op >= olength) {
            output = this.expandBufferAdaptive();
            olength = output.length;
          }
          output[op++] = code;
          continue;
        }
        var ti = code - 257;
        var codeLength = LengthCodeTable[ti];
        if (LengthExtraTable[ti] > 0) {
          codeLength += this.readBits(LengthExtraTable[ti]);
        }
        code = this.readCodeByTable(dist);
        var codeDist = DistCodeTable[code];
        if (DistExtraTable[code] > 0) {
          codeDist += this.readBits(DistExtraTable[code]);
        }
        if (op + codeLength > olength) {
          output = this.expandBufferAdaptive();
          olength = output.length;
        }
        while (codeLength--) {
          output[op] = output[op++ - codeDist];
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
      var buffer = new Uint8Array(this.op - MaxBackwardLength);
      var backward = this.op - MaxBackwardLength;
      var output = this.output;
      buffer.set(output.subarray(MaxBackwardLength, buffer.length));
      this.blocks.push(buffer);
      this.totalpos += buffer.length;
      output.set(
        output.subarray(backward, backward + MaxBackwardLength)
      );
      this.op = MaxBackwardLength;
      return output;
    }
    /**
     * expand output buffer. (adaptive)
     * @param {Object=} opt_param option parameters.
     * @return {!Uint8Array} output buffer pointer.
     */
    expandBufferAdaptive(addRatio = 0, fixRatio) {
      var ratio = Math.floor(this.input.length / this.ip + 1);
      var newSize;
      var input = this.input;
      var output = this.output;
      ratio = (fixRatio ?? ratio) + addRatio;
      if (ratio < 2) {
        var maxHuffCode = (input.length - this.ip) / this.currentLitlenTable[2];
        var maxInflateSize = Math.floor(maxHuffCode * 129);
        newSize = maxInflateSize < output.length ? output.length + maxInflateSize : output.length << 1;
      } else {
        newSize = output.length * ratio;
      }
      var buffer = new Uint8Array(newSize);
      buffer.set(output);
      this.output = buffer;
      return this.output;
    }
    /**
     * concat output buffer.
     * @return {!Uint8Array} output buffer.
     */
    concatBufferBlock() {
      var pos = 0;
      var limit = this.totalpos + (this.op - MaxBackwardLength);
      var output = this.output;
      var blocks = this.blocks;
      var buffer = new Uint8Array(limit);
      var j;
      var jl;
      if (blocks.length === 0) {
        return this.output.subarray(MaxBackwardLength, this.op);
      }
      for (var i = 0; i < blocks.length; ++i) {
        var block = blocks[i];
        buffer.set(block, pos);
        pos += block.length;
      }
      for (var i = MaxBackwardLength; i < this.op; ++i) {
        buffer[pos++] = output[i];
      }
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
      } else {
        buffer = this.output.subarray(0, op);
      }
      this.buffer = buffer;
      return this.buffer;
    }
  };

  // src/LZ77.ts
  var LZ77MinLength = 3;
  var LZ77MaxLength = 258;
  var WindowSize = 32768;
  var LZ77Array = {
    /**
     * Array in the form of [code, extension bit, extension bit length]
     */
    getLengthCode(length) {
      switch (true) {
        case length === 3:
          return [257, length - 3, 0];
          break;
        case length === 4:
          return [258, length - 4, 0];
          break;
        case length === 5:
          return [259, length - 5, 0];
          break;
        case length === 6:
          return [260, length - 6, 0];
          break;
        case length === 7:
          return [261, length - 7, 0];
          break;
        case length === 8:
          return [262, length - 8, 0];
          break;
        case length === 9:
          return [263, length - 9, 0];
          break;
        case length === 10:
          return [264, length - 10, 0];
          break;
        case length <= 12:
          return [265, length - 11, 1];
          break;
        case length <= 14:
          return [266, length - 13, 1];
          break;
        case length <= 16:
          return [267, length - 15, 1];
          break;
        case length <= 18:
          return [268, length - 17, 1];
          break;
        case length <= 22:
          return [269, length - 19, 2];
          break;
        case length <= 26:
          return [270, length - 23, 2];
          break;
        case length <= 30:
          return [271, length - 27, 2];
          break;
        case length <= 34:
          return [272, length - 31, 2];
          break;
        case length <= 42:
          return [273, length - 35, 3];
          break;
        case length <= 50:
          return [274, length - 43, 3];
          break;
        case length <= 58:
          return [275, length - 51, 3];
          break;
        case length <= 66:
          return [276, length - 59, 3];
          break;
        case length <= 82:
          return [277, length - 67, 4];
          break;
        case length <= 98:
          return [278, length - 83, 4];
          break;
        case length <= 114:
          return [279, length - 99, 4];
          break;
        case length <= 130:
          return [280, length - 115, 4];
          break;
        case length <= 162:
          return [281, length - 131, 5];
          break;
        case length <= 194:
          return [282, length - 163, 5];
          break;
        case length <= 226:
          return [283, length - 195, 5];
          break;
        case length <= 257:
          return [284, length - 227, 5];
          break;
        case length === 258:
          return [285, length - 258, 0];
          break;
        default:
          throw "invalid length: " + length;
      }
    },
    //Array of [code, extension bit, extension bit length].
    getDistanceCode(dist) {
      switch (true) {
        case dist === 1:
          return [0, dist - 1, 0];
          break;
        case dist === 2:
          return [1, dist - 2, 0];
          break;
        case dist === 3:
          return [2, dist - 3, 0];
          break;
        case dist === 4:
          return [3, dist - 4, 0];
          break;
        case dist <= 6:
          return [4, dist - 5, 1];
          break;
        case dist <= 8:
          return [5, dist - 7, 1];
          break;
        case dist <= 12:
          return [6, dist - 9, 2];
          break;
        case dist <= 16:
          return [7, dist - 13, 2];
          break;
        case dist <= 24:
          return [8, dist - 17, 3];
          break;
        case dist <= 32:
          return [9, dist - 25, 3];
          break;
        case dist <= 48:
          return [10, dist - 33, 4];
          break;
        case dist <= 64:
          return [11, dist - 49, 4];
          break;
        case dist <= 96:
          return [12, dist - 65, 5];
          break;
        case dist <= 128:
          return [13, dist - 97, 5];
          break;
        case dist <= 192:
          return [14, dist - 129, 6];
          break;
        case dist <= 256:
          return [15, dist - 193, 6];
          break;
        case dist <= 384:
          return [16, dist - 257, 7];
          break;
        case dist <= 512:
          return [17, dist - 385, 7];
          break;
        case dist <= 768:
          return [18, dist - 513, 8];
          break;
        case dist <= 1024:
          return [19, dist - 769, 8];
          break;
        case dist <= 1536:
          return [20, dist - 1025, 9];
          break;
        case dist <= 2048:
          return [21, dist - 1537, 9];
          break;
        case dist <= 3072:
          return [22, dist - 2049, 10];
          break;
        case dist <= 4096:
          return [23, dist - 3073, 10];
          break;
        case dist <= 6144:
          return [24, dist - 4097, 11];
          break;
        case dist <= 8192:
          return [25, dist - 6145, 11];
          break;
        case dist <= 12288:
          return [26, dist - 8193, 12];
          break;
        case dist <= 16384:
          return [27, dist - 12289, 12];
          break;
        case dist <= 24576:
          return [28, dist - 16385, 13];
          break;
        case dist <= 32768:
          return [29, dist - 24577, 13];
          break;
        default:
          throw "invalid distance";
      }
    },
    /**
     * Returns match info as an array encoded in LZ77
     * An LZ77 Array is as follows:
     * [ 
     *    CODE, EXTRA-BIT-LEN, EXTRA, //Length code
     *    CODE, EXTRA-BIT-LEN, EXTRA //Distance code
     * ]
     */
    create(match) {
      return this.getLengthCode(match.len).concat(this.getDistanceCode(match.backwardDistance));
    }
  };
  var LZ77 = class {
    constructor(input, lazy) {
      this.table = {};
      //LZ77 buffer
      this.pos = 0;
      this.prevMatch = null;
      //previous longest match
      this.skipLength = 0;
      this.lazy = 0;
      this.input = input;
      this.output = new Uint16Array(input.length * 2);
      this.lazy = lazy;
      this.freqsLitLen = new Uint32Array(286);
      this.freqsLitLen[256] = 1;
      this.freqsDist = new Uint32Array(30);
    }
    writeNum(n) {
      this.output[this.pos++] = n;
    }
    writeMatch(match, offset) {
      var arr = LZ77Array.create(match);
      for (var i = 0; i < arr.length; i++) {
        this.writeNum(arr[i]);
      }
      this.freqsLitLen[arr[0]]++;
      this.freqsDist[arr[3]]++;
      this.skipLength = match.len + offset - 1;
      this.prevMatch = null;
    }
    // Search for the longest match from the end
    maxMatchTest(match1, match2, len) {
      for (var j = len; j > LZ77MinLength; j--) {
        if (this.input[match1 + j - 1] !== this.input[match2 + j - 1]) return false;
      }
      return true;
    }
    //Find the longest match among match candidates
    searchLongestMatch(position, matchList) {
      var currentMatch = matchList[matchList.length], matchMax = 0, inputLength = this.input.length;
      for (var i = 0; i < matchList.length; i++) {
        var match = matchList[matchList.length - i - 1];
        var matchLength = LZ77MinLength;
        if (matchMax > LZ77MinLength) {
          var j = matchMax;
          if (!this.maxMatchTest(match, position, matchMax)) continue;
          matchLength = matchMax;
        }
        while (matchLength < LZ77MaxLength && position + matchLength < inputLength && this.input[match + matchLength] == this.input[position + matchLength]) {
          matchLength++;
        }
        if (matchLength > matchMax) {
          currentMatch = match;
          matchMax = matchLength;
        }
        if (matchLength == LZ77MaxLength) break;
      }
      return { len: matchMax, backwardDistance: position - currentMatch };
    }
    encode() {
      var table = {};
      var position;
      var length = this.input.length;
      for (position = 0; position < length; ++position) {
        var matchKey = 0;
        for (var i = 0; i < LZ77MinLength; i++) {
          if (position + i === length) break;
          matchKey = matchKey << 8 | this.input[position + i];
        }
        if (table[matchKey] === void 0) {
          table[matchKey] = [];
        }
        var matchList = table[matchKey];
        if (this.skipLength-- > 0) {
          matchList.push(position);
          continue;
        }
        while (matchList.length > 0 && position - matchList[0] > WindowSize) {
          matchList.shift();
        }
        if (position + LZ77MinLength >= length) {
          if (this.prevMatch) {
            this.writeMatch(this.prevMatch, -1);
          }
          for (var i = position; i < length; i++) {
            var tmp = this.input[i];
            this.writeNum(tmp);
            this.freqsLitLen[tmp]++;
          }
          break;
        }
        if (matchList.length > 0) {
          var longestMatch = this.searchLongestMatch(position, matchList);
          if (this.prevMatch) {
            if (this.prevMatch.len < longestMatch.len) {
              tmp = this.input[position - 1];
              this.writeNum(tmp);
              this.freqsLitLen[tmp]++;
              this.writeMatch(longestMatch, 0);
            } else {
              this.writeMatch(this.prevMatch, -1);
            }
          } else if (longestMatch.len < this.lazy) {
            this.prevMatch = longestMatch;
          } else {
            this.writeMatch(longestMatch, 0);
          }
        } else if (this.prevMatch) {
          this.writeMatch(this.prevMatch, -1);
        } else {
          var tmp = this.input[position];
          this.writeNum(tmp);
          this.freqsLitLen[tmp]++;
        }
        matchList.push(position);
      }
      this.writeNum(256);
      this.freqsLitLen[256]++;
      this.output = this.output.subarray(0, this.pos);
      return this.output;
    }
  };

  // src/ByteStream.ts
  var ByteStream = class {
    constructor(buffer, pointer = 0) {
      this.buffer = buffer;
      this.p = pointer;
      this.length = buffer.length;
    }
    get pointer() {
      return this.p;
    }
    set pointer(x) {
      this.p = x;
    }
    get offset() {
      return this.p;
    }
    set offset(x) {
      this.p = x;
    }
    truncateBuffer(len) {
      this.buffer = this.buffer.subarray(0, len);
      this.length = len;
      return this.buffer;
    }
    //Returns an error if len > oldBuffer.length
    expandLength(len) {
      const newbuffer = new Uint8Array(len);
      newbuffer.set(this.buffer);
      this.buffer = newbuffer;
      this.length = len;
      return this.buffer;
    }
    setLength(len) {
      if (len > this.length) this.expandLength(len);
      else this.truncateBuffer(len);
    }
    // Trick to restore any subarray
    restoreBuffer() {
      this.buffer = new Uint8Array(this.buffer.buffer);
    }
    readByte() {
      return this.buffer[this.p++];
    }
    writeByte(byte) {
      this.buffer[this.p++] = byte;
    }
    readShort() {
      return this.buffer[this.p++] | this.buffer[this.p++] << 8;
    }
    writeShort(short) {
      this.buffer[this.p++] = short & 255;
      this.buffer[this.p++] = short >>> 8 & 255;
    }
    readUint() {
      return (this.buffer[this.p++] | this.buffer[this.p++] << 8 | this.buffer[this.p++] << 16 | this.buffer[this.p++] << 24) >>> 0;
    }
    writeUint(uint) {
      this.buffer[this.p++] = uint & 255;
      this.buffer[this.p++] = uint >>> 8 & 255;
      this.buffer[this.p++] = uint >>> 16 & 255;
      this.buffer[this.p++] = uint >>> 24 & 255;
    }
    readUintBE() {
      return (this.buffer[this.p++] << 24 | this.buffer[this.p++] << 16 | this.buffer[this.p++] << 8 | this.buffer[this.p++]) >>> 0;
    }
    writeUintBE(uint) {
      this.buffer[this.p++] = uint >>> 24 & 255;
      this.buffer[this.p++] = uint >>> 16 & 255;
      this.buffer[this.p++] = uint >>> 8 & 255;
      this.buffer[this.p++] = uint & 255;
    }
    readArray(len) {
      return this.buffer.subarray(this.p, this.p += len);
    }
    writeArray(buf) {
      this.buffer.set(buf, this.p);
      this.p += buf.length;
    }
    readString(len) {
      return new TextDecoder().decode(this.readArray(len));
    }
    writeString(str) {
      this.writeArray(new TextEncoder().encode(str));
    }
    readAscii(len) {
      var s = "";
      var arr = this.readArray(len);
      arr.forEach((n) => {
        s += String.fromCharCode(n);
      });
      return s;
    }
    writeAscii(str) {
      this.writeArray(stringToByteArray(str));
    }
  };

  // src/RawDeflate.ts
  var MaxCodeLength = 16;
  var HUFMAX = 286;
  var FixedHuffmanTable = function() {
    var table = [], i;
    for (i = 0; i < 288; i++) {
      switch (true) {
        case i <= 143:
          table.push([i + 48, 8]);
          break;
        case i <= 255:
          table.push([i - 144 + 400, 9]);
          break;
        case i <= 279:
          table.push([i - 256 + 0, 7]);
          break;
        case i <= 287:
          table.push([i - 280 + 192, 8]);
          break;
        default:
          throw "invalid literal: " + i;
      }
    }
    return table;
  }();
  var RawDeflate = class {
    //pos output buffer position.
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
      //output output buffer.
      this.op = 0;
      this.input = input instanceof Uint8Array ? input : new Uint8Array(input);
      this.lazy = opts.lazy ?? 0;
      this.compressionType = opts.compressionType ?? 2 /* DYNAMIC */;
      if (opts.outputBuffer) {
        this.output = opts.outputBuffer instanceof Uint8Array ? opts.outputBuffer : new Uint8Array(opts.outputBuffer);
      } else {
        this.output = new Uint8Array(DefaultDeflateBufferSize);
      }
      this.op = opts.outputIndex ?? 0;
    }
    /**
     * DEFLATE block creation
     * @return {!Uint8Array} Compressed byte array.
     */
    compress() {
      var input = this.input;
      var length = input.length;
      switch (this.compressionType) {
        case 0 /* NONE */:
          for (var position = 0, length = input.length; position < length; ) {
            var blockArray = input.subarray(position, position + 65535);
            position += blockArray.length;
            this.makeNocompressBlock(blockArray, position === length);
          }
          break;
        case 1 /* FIXED */:
          this.output = this.makeFixedHuffmanBlock(input, true);
          this.op = this.output.length;
          break;
        case 2 /* DYNAMIC */:
          this.output = this.makeDynamicHuffmanBlock(input, true);
          this.op = this.output.length;
          break;
        default:
          throw "invalid compression type";
      }
      return this.output;
    }
    /**
     * Create uncompressed block
     * @param {!Uint8Array} blockArray Block data
     * @param {!boolean} isFinalBlock Is this the last block?
     * @return {!Uint8Array} Uncompressed block
     */
    makeNocompressBlock(blockArray, isFinalBlock) {
      var output = this.output;
      output = new Uint8Array(this.output.buffer);
      var b = new ByteStream(output, this.op);
      var len = output.length;
      while (len <= this.op + blockArray.length + 5) {
        len = len << 1;
      }
      b.expandLength(len);
      var btype = 0 /* NONE */;
      b.writeByte((isFinalBlock ? 1 : 0) | btype << 1);
      var len = blockArray.length;
      var nlen = len ^ 65535;
      b.writeShort(len);
      b.writeShort(nlen);
      b.writeArray(blockArray);
      b.truncateBuffer(b.p);
      this.output = b.buffer, this.op = b.p;
      return output;
    }
    /**
     * Create fixed huffman block
     * @param {!(Array<number>|Uint8Array)} blockArray Block data
     * @param {!boolean} isFinalBlock Is this the last block?
     * @return {!Uint8Array} Fixed Huffman-coded block
     */
    makeFixedHuffmanBlock(blockArray, isFinalBlock) {
      var stream = new BitStream(new Uint8Array(this.output.buffer), this.op);
      stream.writeBits(isFinalBlock ? 1 : 0, 1, true);
      stream.writeBits(1 /* FIXED */, 2, true);
      var lz = new LZ77(blockArray, this.lazy);
      lz.encode();
      this.fixedHuffman(lz, stream);
      return stream.finish();
    }
    /**
     * Create Dynamic Huffman Block
     * @param {!(Array<number>|Uint8Array)} blockArray Block data
     * @param {!boolean} isFinalBlock Is this the final block?
     * @return {!(Uint8Array} Dynamic Huffman-coded block
     */
    makeDynamicHuffmanBlock(blockArray, isFinalBlock) {
      var stream = new BitStream(new Uint8Array(this.output.buffer), this.op);
      stream.writeBits(isFinalBlock ? 1 : 0, 1, true);
      stream.writeBits(2 /* DYNAMIC */, 2, true);
      var lz = new LZ77(blockArray, this.lazy);
      var lzBuffer = lz.encode();
      var litLenLengths = this.getLengths(lz.freqsLitLen, 15);
      var litLenCodes = this.getCodesFromLengths(litLenLengths);
      var distLengths = this.getLengths(lz.freqsDist, 7);
      var distCodes = this.getCodesFromLengths(distLengths);
      var hlit, hdist;
      for (hlit = 286; hlit > 257 && litLenLengths[hlit - 1] === 0; hlit--) {
      }
      for (hdist = 30; hdist > 1 && distLengths[hdist - 1] === 0; hdist--) {
      }
      var treeSymbols = this.getTreeSymbols(hlit, litLenLengths, hdist, distLengths);
      var treeLengths = this.getLengths(treeSymbols.freqs, 7);
      var transLengths = new Array(19);
      for (i = 0; i < 19; i++) {
        transLengths[i] = treeLengths[HuffmanOrder[i]];
      }
      for (var hclen = 19; hclen > 4 && transLengths[hclen - 1] === 0; hclen--) {
      }
      var treeCodes = this.getCodesFromLengths(treeLengths);
      stream.writeBits(hlit - 257, 5, true);
      stream.writeBits(hdist - 1, 5, true);
      stream.writeBits(hclen - 4, 4, true);
      for (i = 0; i < hclen; i++) {
        stream.writeBits(transLengths[i], 3, true);
      }
      for (var i = 0; i < treeSymbols.codes.length; i++) {
        var code = treeSymbols.codes[i];
        var bitlen;
        stream.writeBits(treeCodes[code], treeLengths[code], true);
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
              throw "invalid code: " + code;
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
    dynamicHuffman(dataArray, litLen, dist, stream) {
      var litLenCodes = litLen[0];
      var litLenLengths = litLen[1];
      var distCodes = dist[0];
      var distLengths = dist[1];
      for (var index = 0; index < dataArray.length; ++index) {
        var literal = dataArray[index];
        var code;
        stream.writeBits(litLenCodes[literal], litLenLengths[literal], true);
        if (literal > 256) {
          stream.writeBits(dataArray[++index], dataArray[++index], true);
          code = dataArray[++index];
          stream.writeBits(distCodes[code], distLengths[code], true);
          stream.writeBits(dataArray[++index], dataArray[++index], true);
        } else if (literal === 256) {
          break;
        }
      }
      return stream;
    }
    /**
     * Fixed Huffman Coding
     * @param {!(Array<number>|Uint16Array)} dataArray LZ77-encoded byte array.
     * @param {!BitStream} stream Write to BitStream.
     * @return {!BitStream} Huffman-encoded BitStream object.
     */
    fixedHuffman(lz, stream) {
      var lzOutput = lz.output;
      for (var index = 0; index < lzOutput.length; index++) {
        var literal = lzOutput[index];
        var huffCode = FixedHuffmanTable[literal];
        stream.writeBits(huffCode[0], huffCode[1]);
        if (literal > 256) {
          stream.writeBits(lzOutput[++index], lzOutput[++index], true);
          stream.writeBits(lzOutput[++index], 5);
          stream.writeBits(lzOutput[++index], lzOutput[++index], true);
        } else if (literal === 256) {
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
    getTreeSymbols(hlit, litlenLengths, hdist, distLengths) {
      var src = new Uint32Array(hlit + hdist);
      var i, j;
      var l = hlit + hdist;
      var result = new Uint32Array(286 + 30), freqs = new Uint8Array(19);
      j = 0;
      for (i = 0; i < hlit; i++) {
        src[j++] = litlenLengths[i];
      }
      for (i = 0; i < hdist; i++) {
        src[j++] = distLengths[i];
      }
      var nResult = 0;
      for (i = 0, l = src.length; i < l; i += j) {
        for (j = 1; i + j < l && src[i + j] === src[i]; ++j) {
        }
        var runLength = j;
        if (src[i] === 0) {
          if (runLength < 3) {
            while (runLength-- > 0) {
              result[nResult++] = 0;
              freqs[0]++;
            }
          } else {
            while (runLength > 0) {
              var rpt = runLength < 138 ? runLength : 138;
              if (rpt > runLength - 3 && rpt < runLength) {
                rpt = runLength - 3;
              }
              if (rpt <= 10) {
                result[nResult++] = 17;
                result[nResult++] = rpt - 3;
                freqs[17]++;
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
          if (runLength < 3) {
            while (runLength-- > 0) {
              result[nResult++] = src[i];
              freqs[src[i]]++;
            }
          } else {
            while (runLength > 0) {
              var rpt = runLength < 6 ? runLength : 6;
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
        freqs
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
      for (var i = 0; i < nSymbols; ++i) {
        if (freqs[i] > 0) {
          heap.push(i, freqs[i]);
        }
      }
      var nodes = new Array(heap.nodes);
      var values = new Uint32Array(heap.nodes);
      if (nodes.length === 1) {
        length[heap.pop().index] = 1;
        return length;
      }
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
    reversePackageMerge(freqs, symbols, limit) {
      var minimumCost = new Uint16Array(limit);
      var flag = new Array(limit);
      var codeLength = new Uint8Array(symbols).fill(limit);
      var value = new Array(limit);
      var type = new Array(limit);
      var currentPosition = new Array(limit).fill(0);
      function takePackage(j2) {
        var x = type[j2][currentPosition[j2]];
        if (x === symbols) {
          takePackage(j2 + 1);
          takePackage(j2 + 1);
        } else {
          codeLength[x]--;
        }
        currentPosition[j2]++;
      }
      minimumCost[limit - 1] = symbols;
      var excess = (1 << limit) - symbols;
      var half = 1 << limit - 1;
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
      value[0] = new Array(minimumCost[0]);
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
    }
    /**
     * Get Huffman code from code length array
     * reference: PuTTY Deflate implementation
     * @param {!Uint8Array} lengths Code lengths
     * @return {!Uint16Array} Huffman code sequence
     * @private
     */
    getCodesFromLengths(lengths) {
      var codes = new Uint16Array(lengths.length), count = [], startCode = [], code = 0, j, m;
      for (var i = 0; i < lengths.length; i++) {
        count[lengths[i]] = (count[lengths[i]] ?? 0) + 1;
      }
      for (var i = 1; i <= MaxCodeLength; i++) {
        startCode[i] = code;
        code += count[i] ?? 0;
        code <<= 1;
      }
      for (var i = 0; i < lengths.length; i++) {
        code = startCode[lengths[i]];
        startCode[lengths[i]] += 1;
        codes[i] = 0;
        for (j = 0; j < lengths[i]; j++) {
          codes[i] = codes[i] << 1 | code & 1;
          code >>>= 1;
        }
      }
      return codes;
    }
  };

  // src/Deflate.ts
  var Deflate = class _Deflate {
    /**
     * Zlib Deflate
     * @constructor
     * @param {!(Array<number>|Uint8Array)} input The byte array to encode
     * @param {Object=} opts option parameters.
     */
    constructor(input, opts = {}) {
      this.adler32 = null;
      this.input = input;
      this.output = new Uint8Array(DefaultBufferSize);
      var rawDeflateOption = {};
      this.compressionType = opts.compressionType ?? 2 /* DYNAMIC */;
      Object.assign(rawDeflateOption, opts);
      rawDeflateOption["outputBuffer"] = this.output;
      this.rawDeflate = new RawDeflate(this.input, rawDeflateOption);
    }
    /**
     * Static compression
     * @param {!(Array|Uint8Array)} input target buffer.
     * @param {Object=} opts option parameters.
     * @return {!Uint8Array} compressed data byte array.
     */
    static compress(input, opts) {
      return new _Deflate(input, opts).compress();
    }
    /**
     * Deflate Compression.
     * @return {!Uint8Array} compressed data byte array.
     */
    compress() {
      var b = new ByteStream(this.output, 0);
      var cmf = 120;
      b.writeByte(cmf);
      var fdict = 0;
      var flevel = this.compressionType;
      var flg = flevel << 6 | fdict << 5;
      var fcheck = 31 - ((cmf << 8) + flg) % 31;
      flg |= fcheck;
      b.writeByte(flg);
      var adler = Adler32.create(this.input);
      this.adler32 = adler;
      this.rawDeflate.op = b.p;
      var output = this.rawDeflate.compress();
      var pos = output.length;
      b.buffer = output;
      b.restoreBuffer();
      b.setLength(pos + 4);
      b.p = pos;
      b.writeUintBE(adler);
      this.output = b.buffer;
      return this.output;
    }
  };

  // src/Inflate.ts
  var Inflate = class {
    /**
     * @constructor
     * @param {!(Uint8Array|Array)} input deflated buffer.
     * @param {Object=} opts option parameters.
     *
     * In opts, you can specify the following:
     *   - index: The starting index of the deflate container
     *   - blockSize: The block size of the buffer.
     *   - verify: Should the adler32 checksum be verified?
     *   - bufferType: BufferType that specifies how the buffer is managed
     */
    constructor(input, opts = {}) {
      this.ip = 0;
      this.adler32 = null;
      this.input = input;
      this.ip = opts.index ?? 0;
      this.verify = opts.verify ?? false;
      var cmf = input[this.ip++];
      var flg = input[this.ip++];
      if ((cmf & 15) != DEFLATE_TOKEN) {
        throw new Error("unsupported compression method");
      }
      if (((cmf << 8) + flg) % 31 !== 0) {
        throw new Error("invalid fcheck flag:" + ((cmf << 8) + flg) % 31);
      }
      if (flg & 32) {
        throw new Error("fdict flag is not supported");
      }
      this.rawinflate = new RawInflate(input, {
        index: this.ip,
        bufferSize: opts.bufferSize,
        bufferType: opts.bufferType,
        resize: opts.resize
      });
    }
    /**
     * decompress.
     * @return {!Uint8Array} inflated buffer.
     */
    decompress() {
      var input = this.input;
      var buffer;
      buffer = this.rawinflate.decompress();
      this.ip = this.rawinflate.ip;
      if (this.verify) {
        var b = new ByteStream(input, this.ip);
        var adler32 = Adler32.create(buffer);
        this.adler32 = adler32;
        if (adler32 !== b.readUintBE()) {
          throw new Error("invalid adler-32 checksum");
        }
      }
      return buffer;
    }
  };

  // src/index-deflate.ts
  var Zlib = {
    Deflate,
    Inflate
  };
  window.Zlib = Zlib;
})();
