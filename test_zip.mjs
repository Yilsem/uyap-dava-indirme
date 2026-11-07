// Öz-denetim: zip.js çıktısını Python zipfile ile aç, klasör yapısını ve içeriği doğrula.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

globalThis.window = globalThis;
eval(readFileSync(new URL("./zip.js", import.meta.url), "utf8"));
const enc = new TextEncoder();
const blob = window.UyapZip.makeZip([
  { path: "Ödemiş İcra 2024-109/Dilekçeler/Cevap Dilekçesi.pdf", data: enc.encode("%PDF-1.4 deneme") },
  { path: "Ödemiş İcra 2024-109/Kararlar/Ara Karar/Ek 1.udf", data: new Uint8Array(70000).map((_, i) => i % 251) },
  { path: "Ödemiş İcra 2024-109/_INDIRILEMEYENLER.txt", data: enc.encode("") },
]);
const out = process.argv[2] || "test.zip";
writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
const py = `
import zipfile,sys
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
n=z.namelist(); print(n)
assert n[0]=="Ödemiş İcra 2024-109/Dilekçeler/Cevap Dilekçesi.pdf"
assert z.read(n[1])==bytes(i%251 for i in range(70000))
`;
console.log(execFileSync("python", ["-I", "-c", py, out], { encoding: "utf8" }));
assert.equal(window.UyapZip.crc32(enc.encode("123456789")), 0xcbf43926);
console.log("TAMAM");
