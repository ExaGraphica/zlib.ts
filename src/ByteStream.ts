import { stringToByteArray } from "Util";

// A ByteStream (Little-Endian mode only)
export class ByteStream{
    buffer: Uint8Array;
    p: number;
    length: number;

    constructor(buffer: Uint8Array, pointer: number = 0){
        this.buffer = buffer;
        this.p = pointer;
        this.length = buffer.length;
    }

    get pointer(){return this.p;}
    set pointer(x){this.p = x;}
    get offset(){return this.p;}
    set offset(x){this.p = x;}

    readByte(){
        return this.buffer[this.p++];
    }
    writeByte(byte: number){
        this.buffer[this.p++] = byte;
    }

    readWord(){
        return this.buffer[this.p++]
            | (this.buffer[this.p++] << 8);
    }
    writeWord(short: number){
        this.buffer[this.p++] = short & 0xFF;
        this.buffer[this.p++] = (short >>> 8) & 0xFF;
    }

    readUint(){
        return (
            this.buffer[this.p++]
            | (this.buffer[this.p++] << 8)
            | (this.buffer[this.p++] << 16)
            | (this.buffer[this.p++] << 24)
        ) >>> 0;//uint32 fix for JS
    }
    writeUint(uint: number){
        this.buffer[this.p++] = uint & 0xFF;
        this.buffer[this.p++] = (uint >>> 8) & 0xFF;
        this.buffer[this.p++] = (uint >>> 16) & 0xFF;
        this.buffer[this.p++] = (uint >>> 24) & 0xFF;
    }
    
    readArray(len: number){
        return this.buffer.subarray(this.p, (this.p += len));
    }
    writeArray(buf: Uint8Array){
        this.buffer.set(buf, this.p);
        this.p += buf.length;
    }

    readString(len: number){
        return new TextDecoder()
        .decode(this.readArray(len));
    }
    writeString(str: string){
        this.writeArray(new TextEncoder().encode(str));
    }

    readAscii(len: number){
        var s = '';
        var arr = this.readArray(len);
        arr.forEach(n => {
            s += String.fromCharCode(n);
        });
        return s;
    }
    writeAscii(str: string){
        this.writeArray(stringToByteArray(str));
    }

}