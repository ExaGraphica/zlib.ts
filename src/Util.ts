/**
 * @fileoverview Misellaneous functions.
 */

export function stringToByteArray(str: string){
    var tmp = new Uint8Array(str.length);
    
    for (var i = 0; i < tmp.length; i++) {
        tmp[i] = str[i].charCodeAt(0) & 0xFF;
    }
    
    return tmp;
};