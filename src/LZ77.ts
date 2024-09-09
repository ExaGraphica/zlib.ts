/** LZ77 Minimum match length */
const LZ77MinLength = 3;

/** LZ77 Maximum match length */
const LZ77MaxLength = 258;

/** LZ77 window size */
const WindowSize = 0x8000;

type LZ77Match = {
    len: number,
    backwardDistance: number
};
type LZ77Array = number[];

export const LZ77Array = {
    /**
     * Array in the form of [code, extension bit, extension bit length]
     */
    getLengthCode(length: number): number[] {
        switch (true) {
            case (length === 3): return [257, length - 3, 0]; break;
            case (length === 4): return [258, length - 4, 0]; break;
            case (length === 5): return [259, length - 5, 0]; break;
            case (length === 6): return [260, length - 6, 0]; break;
            case (length === 7): return [261, length - 7, 0]; break;
            case (length === 8): return [262, length - 8, 0]; break;
            case (length === 9): return [263, length - 9, 0]; break;
            case (length === 10): return [264, length - 10, 0]; break;
            case (length <= 12): return [265, length - 11, 1]; break;
            case (length <= 14): return [266, length - 13, 1]; break;
            case (length <= 16): return [267, length - 15, 1]; break;
            case (length <= 18): return [268, length - 17, 1]; break;
            case (length <= 22): return [269, length - 19, 2]; break;
            case (length <= 26): return [270, length - 23, 2]; break;
            case (length <= 30): return [271, length - 27, 2]; break;
            case (length <= 34): return [272, length - 31, 2]; break;
            case (length <= 42): return [273, length - 35, 3]; break;
            case (length <= 50): return [274, length - 43, 3]; break;
            case (length <= 58): return [275, length - 51, 3]; break;
            case (length <= 66): return [276, length - 59, 3]; break;
            case (length <= 82): return [277, length - 67, 4]; break;
            case (length <= 98): return [278, length - 83, 4]; break;
            case (length <= 114): return [279, length - 99, 4]; break;
            case (length <= 130): return [280, length - 115, 4]; break;
            case (length <= 162): return [281, length - 131, 5]; break;
            case (length <= 194): return [282, length - 163, 5]; break;
            case (length <= 226): return [283, length - 195, 5]; break;
            case (length <= 257): return [284, length - 227, 5]; break;
            case (length === 258): return [285, length - 258, 0]; break;
            default: throw 'invalid length: ' + length;
        }
    },
    
    //Array of [code, extension bit, extension bit length].
    getDistanceCode(dist: number): number[] {
        switch (true) {
            case (dist === 1): return  [0, dist - 1, 0]; break;
            case (dist === 2): return [1, dist - 2, 0]; break;
            case (dist === 3): return [2, dist - 3, 0]; break;
            case (dist === 4): return [3, dist - 4, 0]; break;
            case (dist <= 6): return [4, dist - 5, 1]; break;
            case (dist <= 8): return [5, dist - 7, 1]; break;
            case (dist <= 12): return [6, dist - 9, 2]; break;
            case (dist <= 16): return [7, dist - 13, 2]; break;
            case (dist <= 24): return [8, dist - 17, 3]; break;
            case (dist <= 32): return [9, dist - 25, 3]; break;
            case (dist <= 48): return [10, dist - 33, 4]; break;
            case (dist <= 64): return [11, dist - 49, 4]; break;
            case (dist <= 96): return [12, dist - 65, 5]; break;
            case (dist <= 128): return [13, dist - 97, 5]; break;
            case (dist <= 192): return [14, dist - 129, 6]; break;
            case (dist <= 256): return [15, dist - 193, 6]; break;
            case (dist <= 384): return [16, dist - 257, 7]; break;
            case (dist <= 512): return [17, dist - 385, 7]; break;
            case (dist <= 768): return [18, dist - 513, 8]; break;
            case (dist <= 1024): return [19, dist - 769, 8]; break;
            case (dist <= 1536): return [20, dist - 1025, 9]; break;
            case (dist <= 2048): return [21, dist - 1537, 9]; break;
            case (dist <= 3072): return [22, dist - 2049, 10]; break;
            case (dist <= 4096): return [23, dist - 3073, 10]; break;
            case (dist <= 6144): return [24, dist - 4097, 11]; break;
            case (dist <= 8192): return [25, dist - 6145, 11]; break;
            case (dist <= 12288): return [26, dist - 8193, 12]; break;
            case (dist <= 16384): return [27, dist - 12289, 12]; break;
            case (dist <= 24576): return [28, dist - 16385, 13]; break;
            case (dist <= 32768): return [29, dist - 24577, 13]; break;
            default: throw 'invalid distance';
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
    create(match: LZ77Match): LZ77Array{
        //return this.getLengthCode(match[0]).concat(this.getDistanceCode(match[1]));
        return this.getLengthCode(match.len).concat(this.getDistanceCode(match.backwardDistance));
    },
}

export class LZ77{
    input: Uint8Array;
    
    output: Uint16Array;//LZ77 buffer
    pos: number = 0;
    
    prevMatch: LZ77Match | null = null;//previous longest match
    skipLength: number = 0;//skiplength
    
    freqsDist: Uint32Array;
    freqsLitLen: Uint32Array;
    
    lazy: number = 0;
    
    constructor(input: Uint8Array, lazy: number){
        this.input = input;
        this.output = new Uint16Array(input.length * 2);
        
        this.lazy = lazy;
        
        this.freqsLitLen = new Uint32Array(286);
        this.freqsLitLen[256] = 1;//Only one End-of-block code (?)
        this.freqsDist = new Uint32Array(30);
    }
    
    writeNum(n: number){
        this.output[this.pos++] = n;
    }
    
    writeMatch(match: LZ77Match, offset: number){
        var arr = LZ77Array.create(match);
        for (var i = 0; i < arr.length; i++) {
            this.writeNum(arr[i]);
        }
        
        this.freqsLitLen[arr[0]]++;
        this.freqsDist[arr[3]]++;
        //this.skipLength = match[0] + offset - 1;
        this.skipLength = match.len + offset - 1;
        this.prevMatch = null;
    }
    
    // Search for the longest match from the end
    maxMatchTest(match1: number, match2: number, len: number){
        for(var j = len; j > LZ77MinLength; j--){
            if(this.input[match1 + j - 1] !== this.input[match2 + j - 1]) return false;
        }
        return true;
    }
    
    //Find the longest match among match candidates
    searchLongestMatch(position: number, matchList: number[]): LZ77Match{
        var currentMatch = matchList[matchList.length - 1],//currentMatch default isn't really useful
            matchMax = 0,
            inputLength = this.input.length;
        
        
        for(var i = 0; i < matchList.length; i++){
            var match = matchList[matchList.length - i - 1];//match position
            var matchLength = LZ77MinLength;
            
            // Test this match position to see if it has all the same matches as this one
            if(matchMax > LZ77MinLength){
                var j = matchMax;
                if(!this.maxMatchTest(match, position, matchMax)) continue;
                
                matchLength = matchMax;
            }
            
            // Longest match search
            while(
                (matchLength < LZ77MaxLength) && 
                (position + matchLength < inputLength) &&
                (this.input[match + matchLength] == this.input[position + matchLength])
            ){ matchLength++; }
            
            // If the match length is better, it is used as the max
            if(matchLength > matchMax){
                currentMatch = match;
                matchMax = matchLength;
            }
            
            // If the maximum length possible found, break!
            if(matchLength == LZ77MaxLength) break;
        }
        
        //return [matchMax, position - currentMatch];
        return {len: matchMax, backwardDistance: position - currentMatch};
    }
    
    encode(){
        var table: { [key: number]: number[] } = {};//chained-hash-table
        
        var position: number;//input position
        var length = this.input.length;//input length
        
        for (position = 0; position < length; ++position) {
            // Creating a hash key
            var matchKey = 0;
            for(var i = 0; i < LZ77MinLength; i++){
                if(position + i === length) break;
                matchKey = (matchKey << 8) | this.input[position + i];
            }
            
            // Create a table if not already defined
            if(table[matchKey] === undefined) {
                table[matchKey] = [];
            }
            var matchList = table[matchKey];
            
            //skip
            if((this.skipLength--) > 0){
                matchList.push(position);
                continue;
            }
            
            // Update match table (Remove anything exceeding the max return distance)
            while(matchList.length > 0 && (position - matchList[0]) > WindowSize){
                matchList.shift();
            }
            
            //If there is no match at the end of the data, just pass through
            if(position + LZ77MinLength >= length){
                if(this.prevMatch){
                    this.writeMatch(this.prevMatch, -1);
                }
                
                for(var i = position; i < length; i++){
                    var tmp = this.input[i];
                    this.writeNum(tmp);
                    this.freqsLitLen[tmp]++;
                }//end
                break;
            }
            
            // Find the longest possible match
            if(matchList.length > 0){
                var longestMatch = this.searchLongestMatch(position, matchList);
                
                if(this.prevMatch){
                    // Current match longer than previous?
                    if(this.prevMatch.len < longestMatch.len){
                        // write previous literal
                        tmp = this.input[position - 1];
                        this.writeNum(tmp);
                        this.freqsLitLen[tmp]++;
                        
                        // write current match
                        this.writeMatch(longestMatch, 0);
                    }else{
                        //else write previous match
                        this.writeMatch(this.prevMatch, -1);
                    }
                } else if(longestMatch.len < this.lazy){
                    this.prevMatch = longestMatch;
                } else{
                    this.writeMatch(longestMatch, 0);
                }
            }else if(this.prevMatch){
                // If there was a match previously but not this time, use the previous match
                this.writeMatch(this.prevMatch, -1);
            }else{
                // Just write a literal
                var tmp = this.input[position];
                this.writeNum(tmp);
                this.freqsLitLen[tmp]++;
            }
                
            matchList.push(position); //Save current position in match list
        }
        
        // Terminate
        this.writeNum(256);
        this.freqsLitLen[256]++;
        
        this.output = this.output.subarray(0, this.pos);
        return this.output;
    }
}