import { GZip } from "GZip";
import { GUnzip } from "GUnzip";
import { Zip } from "Zip";
import { Unzip } from "Unzip";
import { Deflate } from "Deflate";
import { Inflate } from "Inflate";

const Zlib = {
    GZip, GUnzip, Zip, Unzip, Deflate, Inflate
};

window.Zlib = Zlib;