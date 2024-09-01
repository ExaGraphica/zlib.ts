export type HuffmanTable = [Uint32Array, number, number];

/**
 * Build huffman table from length list.
 * @param {!(Array.<number>|Uint8Array)} lengths length list.
 * @return {!Array} huffman table.
 */
export function buildHuffmanTable(lengths: number[] | Uint8Array): HuffmanTable {
    var listSize: number = lengths.length;//length list size.
    var bitLength: number;//bit length.
    var code: number;//huffman code.
    
    /**
     * Skip filling tables of size 2^maxlength.
     * @type {number} skip length for table filling.
    */
   var skip: number;
   
   var reversed: number;//reversed code.
   var rtemp: number;//reverse temp.
   var i: number;//loop counter.
   var j: number;//loop counter.
   var value: number;//table value.
   
   var maxCodeLength: number = 0;//max code length for table size.
    var minCodeLength = Number.POSITIVE_INFINITY;//min code length for table size.
   // Use a for loop instead of Math.min/Math.max;
   for (i = 0; i < listSize; ++i) {
       if (lengths[i] > maxCodeLength) {
           maxCodeLength = lengths[i];
        }
        if (lengths[i] < minCodeLength) {
            minCodeLength = lengths[i];
        }
    }
    
    var size: number = 1 << maxCodeLength;//table size.
    var table: Uint32Array = new Uint32Array(size);//huffman code table.

    // Assign Huffman codes in ascending order of bit length
    for (bitLength = 1, code = 0, skip = 2; bitLength <= maxCodeLength;) {
        for (i = 0; i < listSize; ++i) {
            if (lengths[i] === bitLength) {
                // Since the bit order is reversed, reverse the bit length
                reversed = 0, rtemp = code;
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
};
