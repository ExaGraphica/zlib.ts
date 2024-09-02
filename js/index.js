import { GZip } from "./GZip.js";
import { GUnzip } from "./GUnzip.js";
import { Zip } from "./Zip.js";
import { Unzip } from "./Unzip.js";
import { Deflate } from "./Deflate.js";
import { Inflate } from "./Inflate.js";
const Zlib = {
    GZip, GUnzip, Zip, Unzip, Deflate, Inflate
};
window.Zlib = Zlib;
