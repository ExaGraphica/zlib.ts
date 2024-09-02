import { stringToByteArray } from "./Util.js";
// A ByteStream (Little-Endian mode only)
export class ByteStream {
    constructor(buffer, pointer = 0) {
        this.buffer = buffer;
        this.p = pointer;
        this.length = buffer.length;
    }
    get pointer() { return this.p; }
    set pointer(x) { this.p = x; }
    get offset() { return this.p; }
    set offset(x) { this.p = x; }
    readByte() {
        return this.buffer[this.p++];
    }
    writeByte(byte) {
        this.buffer[this.p++] = byte;
    }
    readShort() {
        return this.buffer[this.p++]
            | (this.buffer[this.p++] << 8);
    }
    writeShort(short) {
        this.buffer[this.p++] = short & 0xFF;
        this.buffer[this.p++] = (short >>> 8) & 0xFF;
    }
    readUint() {
        return (this.buffer[this.p++]
            | (this.buffer[this.p++] << 8)
            | (this.buffer[this.p++] << 16)
            | (this.buffer[this.p++] << 24)) >>> 0; //uint32 fix for JS
    }
    writeUint(uint) {
        this.buffer[this.p++] = uint & 0xFF;
        this.buffer[this.p++] = (uint >>> 8) & 0xFF;
        this.buffer[this.p++] = (uint >>> 16) & 0xFF;
        this.buffer[this.p++] = (uint >>> 24) & 0xFF;
    }
    readUintBE() {
        return ((this.buffer[this.p++] << 24)
            | (this.buffer[this.p++] << 16)
            | (this.buffer[this.p++] << 8)
            | (this.buffer[this.p++])) >>> 0; //uint32 fix for JS
    }
    writeUintBE(uint) {
        this.buffer[this.p++] = (uint >>> 24) & 0xFF;
        this.buffer[this.p++] = (uint >>> 16) & 0xFF;
        this.buffer[this.p++] = (uint >>> 8) & 0xFF;
        this.buffer[this.p++] = (uint) & 0xFF;
    }
    readArray(len) {
        return this.buffer.subarray(this.p, (this.p += len));
    }
    writeArray(buf) {
        this.buffer.set(buf, this.p);
        this.p += buf.length;
    }
    readString(len) {
        return new TextDecoder()
            .decode(this.readArray(len));
    }
    writeString(str) {
        this.writeArray(new TextEncoder().encode(str));
    }
    readAscii(len) {
        var s = '';
        var arr = this.readArray(len);
        arr.forEach(n => {
            s += String.fromCharCode(n);
        });
        return s;
    }
    writeAscii(str) {
        this.writeArray(stringToByteArray(str));
    }
}
