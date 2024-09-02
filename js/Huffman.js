/**
 * Build huffman table from length list.
 * @param {!(Array.<number>|Uint8Array)} lengths length list.
 * @return {!HuffmanTable} huffman table.
 */
export function buildHuffmanTable(lengths) {
    var listSize = lengths.length; //length list size.
    var bitLength; //bit length.
    var code; //huffman code.
    /**
     * Skip filling tables of size 2^maxlength.
     * @type {number} skip length for table filling.
     */
    var skip;
    var i; //loop counter.
    var j; //loop counter.
    var value; //table value.
    var maxCodeLength = 0; //max code length for table size.
    var minCodeLength = Number.POSITIVE_INFINITY; //min code length for table size.
    // Use a for loop instead of Math.min/Math.max;
    for (i = 0; i < listSize; ++i) {
        if (lengths[i] > maxCodeLength) {
            maxCodeLength = lengths[i];
        }
        if (lengths[i] < minCodeLength) {
            minCodeLength = lengths[i];
        }
    }
    var size = 1 << maxCodeLength; //table size.
    var table = new Uint32Array(size); //huffman code table.
    // Assign Huffman codes in ascending order of bit length
    for (bitLength = 1, code = 0, skip = 2; bitLength <= maxCodeLength;) {
        for (i = 0; i < listSize; ++i) {
            if (lengths[i] === bitLength) {
                // Since the bit order is reversed, reverse the bit length
                var reversed = 0, //reversed code.
                rtemp = code;
                for (j = 0; j < bitLength; ++j) {
                    reversed = (reversed << 1) | (rtemp & 1);
                    rtemp >>= 1;
                }
                // While create a table based on this max bit length, there are places outside the max bit length where either 0 or 1 are acceptable.
                // By filling these places with the same value, the no problem even if there are more bits than the orignal bit length.
                value = (bitLength << 16) | i;
                for (j = reversed; j < size; j += skip) {
                    table[j] = value;
                }
                ++code;
            }
        }
        // Move to the next bit length
        ++bitLength;
        code <<= 1;
        skip <<= 1;
    }
    return [table, maxCodeLength, minCodeLength];
}
;
