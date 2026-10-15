// Minimal XML parser (elements, attributes, text, comments). Enough for XM Solitaire rule files.
// Returns { name, attrs, text, children } where text is the concatenated direct text of the element.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e] ?? m;
});

export function parseXml(src) {
  let i = 0;
  const n = src.length;
  const root = { name: '#root', attrs: {}, text: '', children: [] };
  const stack = [root];
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) stack[stack.length - 1].text += decode(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
    } else if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2);
      i = e < 0 ? n : e + 2;
    } else if (src.startsWith('<!', lt)) {
      const e = src.indexOf('>', lt + 2);
      i = e < 0 ? n : e + 1;
    } else if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt + 2);
      if (stack.length > 1) stack.pop();
      i = e < 0 ? n : e + 1;
    } else {
      // start tag: find the closing '>' that is not inside an attribute value
      let j = lt + 1;
      let q = null;
      while (j < n) {
        const ch = src[j];
        if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '>') break;
        j++;
      }
      let body = src.slice(lt + 1, j);
      const selfClose = body.endsWith('/');
      if (selfClose) body = body.slice(0, -1);
      const m = /^\s*([^\s/>]+)/.exec(body);
      const el = { name: m ? m[1] : '', attrs: {}, text: '', children: [] };
      const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a;
      const rest = m ? body.slice(m[0].length) : '';
      while ((a = re.exec(rest))) el.attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
      stack[stack.length - 1].children.push(el);
      if (!selfClose) stack.push(el);
      i = j + 1;
    }
  }
  return root;
}
