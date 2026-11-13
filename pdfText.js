const zlib = require('zlib');

// Minimalny ekstraktor tekstu z PDF (bez zewnętrznych zależności).
// Wystarcza do prostych, jednostronicowych PDF-ów z Monitora Polskiego
// (Word -> PDF, czcionki Type0/Identity-H z mapami ToUnicode).

function inflateStream(buf, body, bodyStart) {
  const m = /stream\r?\n/.exec(body);
  if (!m) return null;
  const start = bodyStart + m.index + m[0].length;
  const end = bodyStart + body.indexOf('endstream', m.index);
  const raw = buf.subarray(start, end);
  if (!/\/FlateDecode/.test(body.slice(0, m.index))) return raw;
  try {
    return zlib.inflateSync(raw);
  } catch (e) {
    try { return zlib.inflateSync(raw, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch (e2) { return null; }
  }
}

function parseObjects(buf) {
  const s = buf.toString('latin1');
  const objs = {};
  const re = /(\d+)\s+0\s+obj\b/g;
  let m;
  while ((m = re.exec(s))) {
    const bodyStart = m.index + m[0].length;
    const end = s.indexOf('endobj', bodyStart);
    if (end < 0) break;
    const body = s.slice(bodyStart, end);
    objs[m[1]] = { body, stream: () => inflateStream(buf, body, bodyStart) };
    re.lastIndex = end;
  }
  // Rozpakowanie strumieni obiektów (ObjStm)
  for (const id of Object.keys(objs)) {
    const o = objs[id];
    if (!/\/Type\s*\/ObjStm/.test(o.body)) continue;
    const data = o.stream();
    if (!data) continue;
    const n = +(/\/N\s+(\d+)/.exec(o.body) || [])[1];
    const first = +(/\/First\s+(\d+)/.exec(o.body) || [])[1];
    const txt = data.toString('latin1');
    const header = txt.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const objId = header[i * 2];
      const off = first + header[i * 2 + 1];
      const nextOff = i + 1 < n ? first + header[(i + 1) * 2 + 1] : txt.length;
      if (!objs[objId]) objs[objId] = { body: txt.slice(off, nextOff), stream: () => null };
    }
  }
  return objs;
}

function hexToStr(hex) {
  let out = '';
  for (let i = 0; i < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
}

function parseCMap(text) {
  const map = {};
  const chars = text.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  for (const block of chars) {
    for (const [, src, dst] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map[parseInt(src, 16)] = hexToStr(dst);
    }
  }
  const ranges = text.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  for (const block of ranges) {
    for (const [, a, b, rest] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g)) {
      const lo = parseInt(a, 16), hi = parseInt(b, 16);
      if (rest.startsWith('[')) {
        const items = rest.match(/<([0-9A-Fa-f]+)>/g) || [];
        items.forEach((it, i) => { map[lo + i] = hexToStr(it.slice(1, -1)); });
      } else {
        const base = parseInt(rest.slice(1, -1), 16);
        for (let c = lo; c <= hi; c++) map[c] = String.fromCharCode(base + c - lo);
      }
    }
  }
  return map;
}

function resolveDict(objs, body, key) {
  // Zwraca treść słownika pod kluczem (inline << >> lub referencja N 0 R)
  const ref = new RegExp('/' + key + '\\s+(\\d+)\\s+0\\s+R').exec(body);
  if (ref) return objs[ref[1]] ? objs[ref[1]].body : '';
  const idx = body.search(new RegExp('/' + key + '\\s*<<'));
  if (idx < 0) return '';
  let depth = 0, i = body.indexOf('<<', idx);
  const start = i;
  for (; i < body.length; i++) {
    if (body.startsWith('<<', i)) { depth++; i++; }
    else if (body.startsWith('>>', i)) { depth--; i++; if (depth === 0) break; }
  }
  return body.slice(start, i + 1);
}

function decodeLiteral(str) {
  return str.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e) => {
    const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
    return map[e] !== undefined ? map[e] : String.fromCharCode(parseInt(e, 8));
  });
}

function extractPdfText(buf) {
  const objs = parseObjects(buf);
  let text = '';

  for (const id of Object.keys(objs)) {
    const page = objs[id].body;
    if (!/\/Type\s*\/Page(?![s\w])/.test(page)) continue;

    const resources = resolveDict(objs, page, 'Resources');
    const fontDict = resolveDict(objs, resources, 'Font');
    const fonts = {};
    for (const [, name, ref] of fontDict.matchAll(/\/([\w.+-]+)\s+(\d+)\s+0\s+R/g)) {
      const fontBody = objs[ref] ? objs[ref].body : '';
      const tu = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(fontBody);
      const cmapData = tu && objs[tu[1]] ? objs[tu[1]].stream() : null;
      fonts[name] = {
        twoByte: /\/Subtype\s*\/Type0/.test(fontBody),
        map: cmapData ? parseCMap(cmapData.toString('latin1')) : null
      };
    }

    const contents = /\/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)/.exec(page);
    if (!contents) continue;
    const refs = [...contents[1].matchAll(/(\d+)\s+0\s+R/g)].map(r => r[1]);
    const content = refs.map(r => (objs[r] && objs[r].stream()) || Buffer.alloc(0)).map(b => b.toString('latin1')).join('\n');

    let font = null;
    const decode = (raw, isHex) => {
      const bytes = isHex ? Buffer.from(raw.replace(/\s+/g, ''), 'hex') : Buffer.from(decodeLiteral(raw), 'latin1');
      const f = font || { twoByte: false, map: null };
      let out = '';
      const step = f.twoByte ? 2 : 1;
      for (let i = 0; i + step <= bytes.length; i += step) {
        const code = step === 2 ? bytes.readUInt16BE(i) : bytes[i];
        out += f.map && f.map[code] !== undefined ? f.map[code] : (step === 1 ? String.fromCharCode(code) : '');
      }
      return out;
    };

    const tokenRe = /\/([\w.+-]+)\s+[\d.]+\s+Tf|\[((?:<[0-9A-Fa-f\s]*>|\((?:\\.|[^\\)])*\)|\s*-?[\d.]+\s*)*)\]\s*TJ|<([0-9A-Fa-f\s]*)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj|\b(Td|TD|Tm|T\*|ET)\b/g;
    let t;
    while ((t = tokenRe.exec(content))) {
      if (t[1]) font = fonts[t[1]] || null;
      else if (t[2] !== undefined) {
        for (const [, hex, lit, num] of t[2].matchAll(/<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\)])*)\)|(-?[\d.]+)/g)) {
          if (hex !== undefined) text += decode(hex, true);
          else if (lit !== undefined) text += decode(lit, false);
          else if (num !== undefined && parseFloat(num) < -200) text += ' ';
        }
      } else if (t[3] !== undefined) text += decode(t[3], true);
      else if (t[4] !== undefined) text += decode(t[4], false);
      else if (t[5]) text += t[5] === 'ET' ? '\n' : ' ';
    }
  }
  return text;
}

module.exports = { extractPdfText };
