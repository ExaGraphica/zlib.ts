/**
 * @fileoverview Miscellaneous functions.
 */

export function stringToByteArray(str: string){
    var arr = new Uint8Array(str.length);
    
    for (var i = 0; i < arr.length; i++) {
        arr[i] = str[i].charCodeAt(0) & 0xFF;
    }
    
    return arr;
};