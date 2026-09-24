// Minimal, dependency-free PDF text extractor (runs in the browser and in Node 20+).
// Supports: classic and compressed (object-stream) PDFs, FlateDecode streams, page tree order,
// ToUnicode CMaps (simple and composite fonts), WinAnsi-like simple fonts, Form XObjects.
// It does not perform OCR. Pages without extractable text are reported, never invented.

export interface PdfExtraction {
  text: string;
  pageCount: number;
  pagesWithText: number;
  emptyPages: number[];
  warnings: string[];
}

export class PdfError extends Error {}

type PdfValue = number | string | boolean | null | PdfName | PdfRef | PdfDict | PdfValue[] | PdfString;
class PdfName {
  constructor(public name: string) {}
}
class PdfRef {
  constructor(public num: number, public gen: number) {}
}
class PdfString {
  constructor(public bytes: number[]) {}
}
type PdfDict = Map<string, PdfValue>;

interface PdfObject {
  dict: PdfValue;
  streamStart?: number;
  streamEnd?: number;
  decoded?: Uint8Array | null;
  inlineStream?: Uint8Array; // for objects from object streams (never streams, kept for symmetry)
}

// ---------------- low-level parsing ----------------

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

class Lexer {
  pos: number;
  constructor(public b: Uint8Array, start = 0, public end = b.length) {
    this.pos = start;
  }
  skipWs() {
    const b = this.b;
    while (this.pos < this.end) {
      const c = b[this.pos];
      if (WS.has(c)) this.pos++;
      else if (c === 0x25) {
        while (this.pos < this.end && b[this.pos] !== 0x0a && b[this.pos] !== 0x0d) this.pos++;
      } else break;
    }
  }
  // Returns a value, or an operator/keyword as {op}
  next(): PdfValue | { op: string } | undefined {
    this.skipWs();
    if (this.pos >= this.end) return undefined;
    const b = this.b;
    const c = b[this.pos];
    if (c === 0x2f) {
      // name
      this.pos++;
      let s = '';
      while (this.pos < this.end && !WS.has(b[this.pos]) && !DELIM.has(b[this.pos])) {
        if (b[this.pos] === 0x23 && this.pos + 2 < this.end) {
          s += String.fromCharCode(parseInt(String.fromCharCode(b[this.pos + 1], b[this.pos + 2]), 16));
          this.pos += 3;
        } else s += String.fromCharCode(b[this.pos++]);
      }
      return new PdfName(s);
    }
    if (c === 0x28) return this.literalString();
    if (c === 0x3c) {
      if (b[this.pos + 1] === 0x3c) {
        this.pos += 2;
        return this.dict();
      }
      return this.hexString();
    }
    if (c === 0x5b) {
      this.pos++;
      const arr: PdfValue[] = [];
      for (;;) {
        this.skipWs();
        if (this.pos >= this.end) break;
        if (b[this.pos] === 0x5d) {
          this.pos++;
          break;
        }
        const v = this.next();
        if (v === undefined) break;
        if (typeof v === 'object' && v !== null && 'op' in v) {
          if (v.op === 'R' && arr.length >= 2) {
            const gen = arr.pop() as number;
            const num = arr.pop() as number;
            arr.push(new PdfRef(num, gen));
          }
          continue;
        }
        arr.push(v);
      }
      return arr;
    }
    if (c === 0x5d || c === 0x3e || c === 0x7b || c === 0x7d || c === 0x29) {
      this.pos++;
      return { op: String.fromCharCode(c) };
    }
    // number or keyword
    let s = '';
    while (this.pos < this.end && !WS.has(b[this.pos]) && !DELIM.has(b[this.pos])) s += String.fromCharCode(b[this.pos++]);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return parseFloat(s);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    return { op: s };
  }
  dict(): PdfDict {
    const d: PdfDict = new Map();
    const b = this.b;
    for (;;) {
      this.skipWs();
      if (this.pos >= this.end) break;
      if (b[this.pos] === 0x3e && b[this.pos + 1] === 0x3e) {
        this.pos += 2;
        break;
      }
      const k = this.next();
      if (!(k instanceof PdfName)) {
        if (k === undefined) break;
        continue;
      }
      let v = this.next();
      // handle "n g R"
      if (typeof v === 'number') {
        const save = this.pos;
        const g = this.next();
        if (typeof g === 'number') {
          const r = this.next();
          if (r && typeof r === 'object' && 'op' in r && r.op === 'R') {
            d.set(k.name, new PdfRef(v, g));
            continue;
          }
        }
        this.pos = save;
      }
      if (v && typeof v === 'object' && 'op' in v) v = null;
      d.set(k.name, v as PdfValue);
    }
    return d;
  }
  literalString(): PdfString {
    const b = this.b;
    this.pos++;
    const out: number[] = [];
    let depth = 1;
    while (this.pos < this.end) {
      const c = b[this.pos++];
      if (c === 0x5c) {
        const n = b[this.pos++];
        switch (n) {
          case 0x6e: out.push(0x0a); break;
          case 0x72: out.push(0x0d); break;
          case 0x74: out.push(0x09); break;
          case 0x62: out.push(0x08); break;
          case 0x66: out.push(0x0c); break;
          case 0x0d:
            if (b[this.pos] === 0x0a) this.pos++;
            break;
          case 0x0a: break;
          default:
            if (n >= 0x30 && n <= 0x37) {
              let oct = n - 0x30;
              for (let i = 0; i < 2 && b[this.pos] >= 0x30 && b[this.pos] <= 0x37; i++) oct = oct * 8 + (b[this.pos++] - 0x30);
              out.push(oct & 0xff);
            } else out.push(n);
        }
      } else if (c === 0x28) {
        depth++;
        out.push(c);
      } else if (c === 0x29) {
        depth--;
        if (depth === 0) break;
        out.push(c);
      } else out.push(c);
    }
    return new PdfString(out);
  }
  hexString(): PdfString {
    const b = this.b;
    this.pos++;
    let hex = '';
    while (this.pos < this.end && b[this.pos] !== 0x3e) {
      const ch = String.fromCharCode(b[this.pos++]);
      if (/[0-9a-fA-F]/.test(ch)) hex += ch;
    }
    this.pos++;
    if (hex.length % 2) hex += '0';
    const out: number[] = [];
    for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
    return new PdfString(out);
  }
}

function indexOfBytes(b: Uint8Array, needle: string, from: number, to = b.length): number {
  const n0 = needle.charCodeAt(0);
  outer: for (let i = from; i <= to - needle.length; i++) {
    if (b[i] !== n0) continue;
    for (let j = 1; j < needle.length; j++) if (b[i + j] !== needle.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const tryFormat = async (fmt: 'deflate' | 'deflate-raw', input: Uint8Array) => {
    const ds = new DecompressionStream(fmt);
    const writer = ds.writable.getWriter();
    writer.write(input as unknown as BufferSource).catch(() => undefined);
    writer.close().catch(() => undefined);
    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
    } catch (err) {
      if (total === 0) throw err;
      // keep what was decoded before a trailing-garbage error
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  };
  try {
    return await tryFormat('deflate', data);
  } catch {
    return await tryFormat('deflate-raw', data.subarray(2));
  }
}

// ---------------- document model ----------------

class PdfDoc {
  objects = new Map<number, PdfObject>();
  trailers: PdfDict[] = [];
  unsupportedFilters = new Set<string>();

  constructor(public b: Uint8Array) {}

  parseObjects() {
    const b = this.b;
    const text = latin1(b);
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const num = parseInt(m[1], 10);
      const lx = new Lexer(b, m.index + m[0].length);
      const v = lx.next();
      if (v === undefined || (typeof v === 'object' && v !== null && 'op' in v)) continue;
      const obj: PdfObject = { dict: v as PdfValue };
      lx.skipWs();
      if (indexOfBytes(b, 'stream', lx.pos, lx.pos + 6) === lx.pos) {
        let start = lx.pos + 6;
        if (b[start] === 0x0d) start++;
        if (b[start] === 0x0a) start++;
        let end = -1;
        const len = v instanceof Map ? v.get('Length') : undefined;
        if (typeof len === 'number') {
          const probe = indexOfBytes(b, 'endstream', start + len, Math.min(b.length, start + len + 20));
          if (probe >= 0) end = start + len;
        }
        if (end < 0) {
          end = indexOfBytes(b, 'endstream', start);
          if (end < 0) continue;
          while (end > start && (b[end - 1] === 0x0a || b[end - 1] === 0x0d)) end--;
        }
        obj.streamStart = start;
        obj.streamEnd = end;
        re.lastIndex = end;
      }
      this.objects.set(num, obj); // later definitions (incremental updates) win
    }
    const tre = /trailer\s*<</g;
    while ((m = tre.exec(text))) {
      const lx = new Lexer(b, m.index + m[0].length);
      this.trailers.push(lx.dict());
    }
  }

  async expandObjectStreams() {
    for (const [, obj] of [...this.objects]) {
      const d = obj.dict;
      if (!(d instanceof Map)) continue;
      const type = d.get('Type');
      if (type instanceof PdfName && type.name === 'XRef') this.trailers.push(d);
      if (!(type instanceof PdfName) || type.name !== 'ObjStm') continue;
      const data = await this.streamData(obj);
      if (!data) continue;
      const n = Number(d.get('N'));
      const first = Number(d.get('First'));
      const lx = new Lexer(data, 0, first);
      const pairs: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const on = lx.next();
        const off = lx.next();
        if (typeof on !== 'number' || typeof off !== 'number') break;
        pairs.push([on, off]);
      }
      for (const [on, off] of pairs) {
        if (this.objects.has(on)) continue;
        const vl = new Lexer(data, first + off);
        const v = vl.next();
        if (v === undefined || (typeof v === 'object' && v !== null && 'op' in v)) continue;
        this.objects.set(on, { dict: v as PdfValue });
      }
    }
  }

  resolve(v: PdfValue | undefined, depth = 0): PdfValue | undefined {
    if (v instanceof PdfRef && depth < 20) return this.resolve(this.objects.get(v.num)?.dict, depth + 1);
    return v;
  }

  objOf(v: PdfValue | undefined): PdfObject | undefined {
    return v instanceof PdfRef ? this.objects.get(v.num) : undefined;
  }

  async streamData(obj: PdfObject | undefined): Promise<Uint8Array | null> {
    if (!obj || obj.streamStart === undefined || obj.streamEnd === undefined) return null;
    if (obj.decoded !== undefined) return obj.decoded;
    let data: Uint8Array = this.b.subarray(obj.streamStart, obj.streamEnd);
    const d = obj.dict instanceof Map ? obj.dict : new Map();
    let filters = this.resolve(d.get('Filter'));
    const list: string[] = filters instanceof PdfName ? [filters.name] : Array.isArray(filters) ? filters.filter((f): f is PdfName => f instanceof PdfName).map((f) => f.name) : [];
    try {
      for (const f of list) {
        if (f === 'FlateDecode' || f === 'Fl') data = await inflate(data);
        else {
          this.unsupportedFilters.add(f);
          obj.decoded = null;
          return null;
        }
      }
      const parms = this.resolve(d.get('DecodeParms'));
      if (parms instanceof Map && Number(parms.get('Predictor')) >= 10) {
        data = pngUnpredict(data, Number(parms.get('Columns') ?? 1));
      }
    } catch {
      obj.decoded = null;
      return null;
    }
    obj.decoded = data;
    return data;
  }

  isEncrypted(): boolean {
    return this.trailers.some((t) => t.has('Encrypt'));
  }

  pages(): PdfDict[] {
    let root: PdfValue | undefined;
    for (const t of this.trailers) if (t.has('Root')) root = this.resolve(t.get('Root'));
    if (!(root instanceof Map)) {
      for (const o of this.objects.values()) {
        const d = o.dict;
        if (d instanceof Map && d.get('Type') instanceof PdfName && (d.get('Type') as PdfName).name === 'Catalog') root = d;
      }
    }
    const out: PdfDict[] = [];
    const seen = new Set<PdfValue>();
    const walk = (node: PdfValue | undefined, inherited: PdfDict) => {
      const n = this.resolve(node);
      if (!(n instanceof Map) || seen.has(n) || out.length > 5000) return;
      seen.add(n);
      const inh = new Map(inherited);
      for (const k of ['Resources']) if (n.has(k)) inh.set(k, n.get(k)!);
      const kids = this.resolve(n.get('Kids'));
      const type = n.get('Type');
      if (Array.isArray(kids)) {
        for (const k of kids) walk(k, inh);
      } else if (!(type instanceof PdfName) || type.name === 'Page') {
        const page = new Map(n);
        if (!page.has('Resources') && inh.has('Resources')) page.set('Resources', inh.get('Resources')!);
        out.push(page);
      }
    };
    if (root instanceof Map) walk(root.get('Pages'), new Map());
    if (out.length === 0) {
      const nums = [...this.objects.keys()].sort((a, b) => a - b);
      for (const num of nums) {
        const d = this.objects.get(num)!.dict;
        if (d instanceof Map && d.get('Type') instanceof PdfName && (d.get('Type') as PdfName).name === 'Page') out.push(d);
      }
    }
    return out;
  }
}

function pngUnpredict(data: Uint8Array, columns: number): Uint8Array {
  const rowLen = columns + 1;
  const rows = Math.floor(data.length / rowLen);
  const out = new Uint8Array(rows * columns);
  const prev = new Uint8Array(columns);
  for (let r = 0; r < rows; r++) {
    const type = data[r * rowLen];
    for (let c = 0; c < columns; c++) {
      const x = data[r * rowLen + 1 + c];
      const left = c > 0 ? out[r * columns + c - 1] : 0;
      const up = prev[c];
      const ul = c > 0 ? prev[c - 1] : 0;
      let v = x;
      if (type === 1) v = x + left;
      else if (type === 2) v = x + up;
      else if (type === 3) v = x + ((left + up) >> 1);
      else if (type === 4) {
        const p = left + up - ul;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
        v = x + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul);
      }
      out[r * columns + c] = v & 0xff;
    }
    prev.set(out.subarray(r * columns, (r + 1) * columns));
  }
  return out;
}

function latin1(b: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < b.length; i += CH) s += String.fromCharCode(...b.subarray(i, i + CH));
  return s;
}

// ---------------- fonts ----------------

const WIN_ANSI_EXTRA: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
  0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘',
  0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜',
  0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

const GLYPH_NAMES: Record<string, string> = {
  space: ' ', quoteright: '’', quoteleft: '‘', quotedblleft: '“', quotedblright: '”', quotesingle: "'",
  endash: '–', emdash: '—', hyphen: '-', minus: '−', bullet: '•', ellipsis: '…', period: '.',
  comma: ',', colon: ':', semicolon: ';', parenleft: '(', parenright: ')', slash: '/', percent: '%', ampersand: '&',
  numbersign: '#', dollar: '$', euro: '€', sterling: '£', multiply: '×', fi: 'fi', fl: 'fl',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  quotedbl: '"', exclam: '!', question: '?', plus: '+', equal: '=', at: '@', bracketleft: '[', bracketright: ']',
  underscore: '_', asterisk: '*', degree: '°', eacute: 'é', egrave: 'è', udieresis: 'ü',
  odieresis: 'ö', adieresis: 'ä', ccedilla: 'ç', aacute: 'á', oacute: 'ó',
};

interface FontInfo {
  bytesPerCode: number;
  toUnicode: Map<number, string> | null;
  differences: Map<number, string> | null;
  composite: boolean;
  widths: Map<number, number>; // glyph advance in 1/1000 text-space units
  defaultWidth: number;
}

const EMPTY_FONT = (): FontInfo => ({ bytesPerCode: 1, toUnicode: null, differences: null, composite: false, widths: new Map(), defaultWidth: 500 });

function parseCMap(data: Uint8Array): { map: Map<number, string>; bytes: number } {
  const s = latin1(data);
  const map = new Map<number, string>();
  let bytes = 0;
  const utf16 = (hex: string) => {
    let out = '';
    for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    if (hex.length === 2) out = String.fromCharCode(parseInt(hex, 16));
    return out;
  };
  const cs = /begincodespacerange([\s\S]*?)endcodespacerange/g;
  let m: RegExpExecArray | null;
  while ((m = cs.exec(s))) {
    const h = /<([0-9a-fA-F]+)>/.exec(m[1]);
    if (h) bytes = Math.max(bytes, h[1].length / 2);
  }
  const bc = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = bc.exec(s))) {
    const pair = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g;
    let p: RegExpExecArray | null;
    while ((p = pair.exec(m[1]))) {
      map.set(parseInt(p[1], 16), utf16(p[2]));
      if (!bytes) bytes = p[1].length / 2;
    }
  }
  const br = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = br.exec(s))) {
    const range = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([^\]]*)\])/g;
    let p: RegExpExecArray | null;
    while ((p = range.exec(m[1]))) {
      const lo = parseInt(p[1], 16);
      const hi = parseInt(p[2], 16);
      if (!bytes) bytes = p[1].length / 2;
      if (hi - lo > 65535) continue;
      if (p[4] !== undefined) {
        const base = p[4];
        const baseLast = parseInt(base.slice(-4), 16);
        const prefix = utf16(base.slice(0, -4));
        for (let c = lo; c <= hi; c++) map.set(c, prefix + String.fromCharCode(baseLast + (c - lo)));
      } else {
        const items = [...(p[5] ?? '').matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => utf16(x[1]));
        for (let c = lo; c <= hi && c - lo < items.length; c++) map.set(c, items[c - lo]);
      }
    }
  }
  return { map, bytes: bytes || 1 };
}

async function loadFont(doc: PdfDoc, ref: PdfValue | undefined): Promise<FontInfo> {
  const f = doc.resolve(ref);
  const info = EMPTY_FONT();
  if (!(f instanceof Map)) return info;
  const sub = f.get('Subtype');
  if (sub instanceof PdfName && sub.name === 'Type0') {
    info.composite = true;
    info.bytesPerCode = 2;
    const desc = doc.resolve(f.get('DescendantFonts'));
    const cid = doc.resolve(Array.isArray(desc) ? desc[0] : undefined);
    if (cid instanceof Map) {
      const dw = doc.resolve(cid.get('DW'));
      info.defaultWidth = typeof dw === 'number' ? dw : 1000;
      const w = doc.resolve(cid.get('W'));
      if (Array.isArray(w)) {
        for (let i = 0; i < w.length; ) {
          const c1 = doc.resolve(w[i]);
          const nxt = doc.resolve(w[i + 1]);
          if (typeof c1 !== 'number') break;
          if (Array.isArray(nxt)) {
            nxt.forEach((wv, j) => {
              const r = doc.resolve(wv);
              if (typeof r === 'number') info.widths.set(c1 + j, r);
            });
            i += 2;
          } else {
            const c2 = nxt;
            const wv = doc.resolve(w[i + 2]);
            if (typeof c2 === 'number' && typeof wv === 'number' && c2 - c1 < 65536) for (let c = c1; c <= c2; c++) info.widths.set(c, wv);
            i += 3;
          }
        }
      }
    }
  } else {
    const first = doc.resolve(f.get('FirstChar'));
    const ws = doc.resolve(f.get('Widths'));
    if (typeof first === 'number' && Array.isArray(ws)) {
      ws.forEach((wv, j) => {
        const r = doc.resolve(wv);
        if (typeof r === 'number') info.widths.set(first + j, r);
      });
    }
  }
  const tu = f.get('ToUnicode');
  const tuObj = doc.objOf(tu);
  if (tuObj) {
    const data = await doc.streamData(tuObj);
    if (data) {
      const cm = parseCMap(data);
      info.toUnicode = cm.map;
      if (info.composite) info.bytesPerCode = cm.bytes;
    }
  }
  const enc = doc.resolve(f.get('Encoding'));
  if (enc instanceof Map) {
    const diffs = doc.resolve(enc.get('Differences'));
    if (Array.isArray(diffs)) {
      info.differences = new Map();
      let code = 0;
      for (const d of diffs) {
        if (typeof d === 'number') code = d;
        else if (d instanceof PdfName) info.differences.set(code++, d.name);
      }
    }
  }
  return info;
}

function decodeText(bytes: number[], font: FontInfo | undefined): { text: string; unmapped: number; advance: number } {
  let out = '';
  let unmapped = 0;
  let advance = 0;
  const n = font?.bytesPerCode ?? 1;
  for (let i = 0; i + n <= bytes.length; i += n) {
    let code = 0;
    for (let j = 0; j < n; j++) code = (code << 8) | bytes[i + j];
    advance += font?.widths.get(code) ?? font?.defaultWidth ?? 500;
    const tu = font?.toUnicode?.get(code);
    if (tu !== undefined) {
      out += tu;
      continue;
    }
    if (font?.composite) {
      unmapped++;
      continue;
    }
    const diff = font?.differences?.get(code);
    if (diff) {
      if (GLYPH_NAMES[diff] !== undefined) out += GLYPH_NAMES[diff];
      else if (/^[A-Za-z]$/.test(diff)) out += diff;
      else if (/^uni[0-9A-Fa-f]{4}$/.test(diff)) out += String.fromCharCode(parseInt(diff.slice(3), 16));
      else out += String.fromCharCode(code);
      continue;
    }
    out += WIN_ANSI_EXTRA[code] ?? (code >= 0x20 || code === 0x0a ? String.fromCharCode(code) : '');
  }
  return { text: out, unmapped, advance };
}

// ---------------- content streams ----------------

interface TextState {
  out: string[];
  unmapped: number;
  lastY: number | null;
  pendingNewline: boolean;
  pendingSpace: boolean;
}

async function runContent(doc: PdfDoc, data: Uint8Array, resources: PdfValue | undefined, st: TextState, depth: number) {
  const res = doc.resolve(resources);
  const fontsDict = res instanceof Map ? doc.resolve(res.get('Font')) : undefined;
  const xobjs = res instanceof Map ? doc.resolve(res.get('XObject')) : undefined;
  const fontCache = new Map<string, FontInfo>();
  let font: FontInfo | undefined;
  const lx = new Lexer(data);
  const stack: (PdfValue | { op: string })[] = [];
  let lineX = 0;
  let lineY = 0;
  let curX = 0; // estimated pen position after the last shown text
  let scale = 1; // horizontal scale of the text matrix
  let fontSize = 10;

  const emit = (s: string) => {
    if (!s) return;
    if (st.pendingNewline && st.out.length) {
      st.out.push('\n');
    } else if (st.pendingSpace && st.out.length) {
      const last = st.out[st.out.length - 1];
      if (!/\s$/.test(last) && !/^\s/.test(s)) st.out.push(' ');
    }
    st.pendingNewline = false;
    st.pendingSpace = false;
    st.out.push(s);
  };
  const moveTo = (x: number, y: number) => {
    const em = Math.abs(fontSize * scale) || 10;
    if (st.lastY !== null && Math.abs(y - st.lastY) > em * 0.4) st.pendingNewline = true;
    else if (st.lastY !== null) {
      const gap = x - curX;
      if (gap > em * 0.18 || gap < -em * 2) st.pendingSpace = true;
    }
    st.lastY = y;
    lineX = x;
    lineY = y;
    curX = x;
  };
  const show = (v: PdfValue) => {
    if (v instanceof PdfString) {
      const d = decodeText(v.bytes, font);
      st.unmapped += d.unmapped;
      emit(d.text);
      curX += (d.advance / 1000) * fontSize * scale;
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (item instanceof PdfString) show(item);
        else if (typeof item === 'number') {
          curX -= (item / 1000) * fontSize * scale;
          if (item < -180) st.pendingSpace = true;
        }
      }
    }
  };

  for (;;) {
    const t = lx.next();
    if (t === undefined) break;
    if (!(t && typeof t === 'object' && 'op' in t)) {
      stack.push(t);
      if (stack.length > 64) stack.shift();
      continue;
    }
    const op = t.op;
    const args = stack.splice(0, stack.length) as PdfValue[];
    const num = (i: number) => (typeof args[i] === 'number' ? (args[i] as number) : 0);
    switch (op) {
      case 'BI': {
        // skip inline image data
        const endIdx = indexOfBytes(data, 'EI', lx.pos);
        lx.pos = endIdx < 0 ? data.length : endIdx + 2;
        break;
      }
      case 'BT':
        lineX = 0;
        lineY = 0;
        curX = 0;
        scale = 1;
        break;
      case 'Tf': {
        const name = args[0] instanceof PdfName ? args[0].name : '';
        if (!fontCache.has(name)) {
          fontCache.set(name, fontsDict instanceof Map ? await loadFont(doc, fontsDict.get(name)) : EMPTY_FONT());
        }
        font = fontCache.get(name);
        if (typeof args[1] === 'number') fontSize = args[1];
        break;
      }
      case 'Td':
      case 'TD':
        moveTo(lineX + num(0) * scale, lineY + num(1) * scale);
        break;
      case 'Tm':
        scale = Math.hypot(num(0), num(1)) || 1;
        moveTo(num(4), num(5));
        break;
      case 'T*':
        st.pendingNewline = true;
        break;
      case 'Tj':
        show(args[args.length - 1]);
        break;
      case 'TJ':
        show(args[args.length - 1]);
        break;
      case "'":
        st.pendingNewline = true;
        show(args[args.length - 1]);
        break;
      case '"':
        st.pendingNewline = true;
        show(args[args.length - 1]);
        break;
      case 'Do': {
        if (depth > 3 || !(xobjs instanceof Map) || !(args[0] instanceof PdfName)) break;
        const ref = xobjs.get(args[0].name);
        const xo = doc.objOf(ref);
        const xd = xo?.dict;
        if (xd instanceof Map && xd.get('Subtype') instanceof PdfName && (xd.get('Subtype') as PdfName).name === 'Form') {
          const xdata = await doc.streamData(xo);
          if (xdata) await runContent(doc, xdata, xd.get('Resources') ?? resources, st, depth + 1);
        }
        break;
      }
    }
  }
}

export async function extractPdfText(input: Uint8Array | ArrayBuffer): Promise<PdfExtraction> {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (indexOfBytes(b, '%PDF-', 0, Math.min(b.length, 1024)) < 0) throw new PdfError('This file does not look like a PDF.');
  const doc = new PdfDoc(b);
  doc.parseObjects();
  await doc.expandObjectStreams();
  if (doc.isEncrypted()) {
    throw new PdfError('This PDF is encrypted. Text cannot be extracted in the browser; please paste the text instead.');
  }
  const pages = doc.pages();
  if (pages.length === 0) throw new PdfError('No pages could be read from this PDF. The file may be damaged or use an unsupported structure.');

  const texts: string[] = [];
  const emptyPages: number[] = [];
  let unmappedTotal = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const st: TextState = { out: [], unmapped: 0, lastY: null, pendingNewline: false, pendingSpace: false };
    const contents = page.get('Contents');
    const list = Array.isArray(doc.resolve(contents)) && !(contents instanceof PdfRef && doc.objects.get(contents.num)?.streamStart !== undefined)
      ? (doc.resolve(contents) as PdfValue[])
      : [contents];
    const parts: Uint8Array[] = [];
    for (const c of list) {
      const data = await doc.streamData(doc.objOf(c));
      if (data) parts.push(data);
    }
    const total = parts.reduce((n, p) => n + p.length + 1, 0);
    const joined = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      joined.set(p, o);
      o += p.length;
      joined[o++] = 0x0a;
    }
    await runContent(doc, joined, page.get('Resources'), st, 0);
    unmappedTotal += st.unmapped;
    const text = st.out
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .trim();
    if (text.replace(/\s/g, '').length < 20) emptyPages.push(i + 1);
    texts.push(text);
  }

  const warnings: string[] = [];
  const pagesWithText = pages.length - emptyPages.length;
  if (pagesWithText === 0) {
    warnings.push(
      'No extractable text was found. The PDF probably consists of scanned images. Image recognition (OCR) is not available here — please paste recognised text instead.',
    );
  } else if (emptyPages.length) {
    warnings.push(
      `No extractable text on page(s) ${emptyPages.join(', ')} (possibly scanned images or graphics). Those pages are not part of the text and will not be analyzed.`,
    );
  }
  if (unmappedTotal > 0) {
    warnings.push(`${unmappedTotal} character(s) use fonts without a Unicode mapping and could not be decoded. Check the text for gaps.`);
  }
  if (doc.unsupportedFilters.size) {
    warnings.push(`Some streams use unsupported encodings (${[...doc.unsupportedFilters].join(', ')}); parts of the document may be missing.`);
  }
  warnings.push('Tables and multi-column layouts may lose their structure during extraction. Review the text before analysis.');

  const text = texts
    .map((t, i) => `--- Page ${i + 1} ---\n${emptyPages.includes(i + 1) ? '[No extractable text on this page]' : t}`)
    .join('\n\n');
  return { text, pageCount: pages.length, pagesWithText, emptyPages, warnings };
}
