import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

// Leitura do manifest binário no APK real, sem SDK Android nem certificados alternativos.
const apk = await readFile(process.argv[2]);
let end = apk.length - 22;
while (end >= Math.max(0, apk.length - 65557) && apk.readUInt32LE(end) !== 0x06054b50) end--;
if (end < 0) throw new Error('ZIP inválido');
let pos = apk.readUInt32LE(end + 16);
const entries = new Map();
for (let i = 0; i < apk.readUInt16LE(end + 10); i++) {
  const method = apk.readUInt16LE(pos + 10), size = apk.readUInt32LE(pos + 20);
  const length = apk.readUInt16LE(pos + 28), extra = apk.readUInt16LE(pos + 30), comment = apk.readUInt16LE(pos + 32);
  const name = apk.toString('utf8', pos + 46, pos + 46 + length);
  const local = apk.readUInt32LE(pos + 42);
  const start = local + 30 + apk.readUInt16LE(local + 26) + apk.readUInt16LE(local + 28);
  entries.set(name, () => method === 8 ? inflateRawSync(apk.subarray(start, start + size)) : apk.subarray(start, start + size));
  pos += 46 + length + extra + comment;
}
function xml(buffer) {
  let strings = []; const elements = [];
  for (let p = 8; p < buffer.length;) {
    const type = buffer.readUInt16LE(p), header = buffer.readUInt16LE(p + 2), size = buffer.readUInt32LE(p + 4);
    if (size < 8) throw new Error('XML inválido');
    if (type === 1) {
      const count = buffer.readUInt32LE(p + 8), utf8 = Boolean(buffer.readUInt32LE(p + 16) & 256), base = p + buffer.readUInt32LE(p + 20);
      strings = Array.from({ length: count }, (_, i) => {
        let at = base + buffer.readUInt32LE(p + header + i * 4);
        const length8 = () => { const n = buffer[at++]; return n & 128 ? ((n & 127) << 8) | buffer[at++] : n; };
        if (utf8) { length8(); const n = length8(); return buffer.toString('utf8', at, at + n); }
        let n = buffer.readUInt16LE(at); at += 2;
        if (n & 32768) { n = ((n & 32767) << 16) | buffer.readUInt16LE(at); at += 2; }
        return buffer.toString('utf16le', at, at + n * 2);
      });
    }
    if (type === 0x102) {
      const attrs = {};
      const start = p + 16 + buffer.readUInt16LE(p + 24), stride = buffer.readUInt16LE(p + 26), count = buffer.readUInt16LE(p + 28);
      for (let i = 0; i < count; i++) {
        const a = start + i * stride, name = strings[buffer.readUInt32LE(a + 4)], raw = buffer.readUInt32LE(a + 8), valueType = buffer[a + 15], value = buffer.readUInt32LE(a + 16);
        attrs[name] = raw !== 0xffffffff ? strings[raw] : valueType === 3 ? strings[value] : valueType === 18 ? Boolean(value) : valueType === 1 ? `resource:0x${value.toString(16)}` : value;
      }
      elements.push({ name: strings[buffer.readUInt32LE(p + 20)], attrs });
    }
    p += size;
  }
  return elements;
}
const manifest = xml(entries.get('AndroidManifest.xml')());
const selected = manifest.filter((e) => ['manifest', 'uses-sdk', 'application'].includes(e.name) || e.name === 'meta-data' && /expo.modules.updates/.test(e.attrs.name));
console.log(JSON.stringify({ sha256: createHash('sha256').update(apk).digest('hex'), manifest: selected,
  networkConfigs: [...entries.keys()].filter((name) => /res\/xml\/.*network.*\.xml/.test(name)).map((name) => ({ name, elements: xml(entries.get(name)()) })) }, null, 2));
