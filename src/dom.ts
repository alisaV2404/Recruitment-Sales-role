// Tiny DOM toolkit: h() builds elements, morph() patches the live DOM in place so focus,
// selection and scroll positions survive re-renders.

export type Child = Node | string | number | null | undefined | false | Child[];
export type Props = Record<string, unknown> | null | undefined;

const HANDLERS = [
  'onclick',
  'oninput',
  'onchange',
  'onsubmit',
  'onkeydown',
  'ondragover',
  'ondragleave',
  'ondrop',
  'onfocus',
  'onblur',
  'ontoggle',
] as const;

export function h(tag: string, props?: Props, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'key') el.setAttribute('data-key', String(v));
      else if (k === 'html') {
        el.innerHTML = String(v);
        el.setAttribute('data-html', '1');
      } else if (k === 'value') (el as HTMLInputElement).value = String(v);
      else if (k === 'checked') (el as HTMLInputElement).checked = !!v;
      else if (k.startsWith('on') && typeof v === 'function') (el as any)[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

function keyOf(n: Node): string | null {
  return n.nodeType === 1 ? (n as Element).getAttribute('data-key') : null;
}

export function morph(from: Element, to: Element) {
  // attributes
  for (const a of Array.from(from.attributes)) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
  for (const a of Array.from(to.attributes)) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  for (const hname of HANDLERS) {
    const nv = (to as any)[hname] ?? null;
    if ((from as any)[hname] !== nv) (from as any)[hname] = nv;
  }
  const tag = from.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    const f = from as HTMLInputElement;
    const t = to as HTMLInputElement;
    if (tag !== 'SELECT' && document.activeElement !== f && f.value !== t.value) f.value = t.value;
    if (f.checked !== t.checked) f.checked = t.checked;
    if (tag === 'TEXTAREA') return;
  }
  if (to.hasAttribute('data-html')) {
    if (from.innerHTML !== to.innerHTML) from.innerHTML = to.innerHTML;
    return;
  }
  morphChildren(from, to);
  if (tag === 'SELECT') {
    const f = from as HTMLSelectElement;
    const t = to as HTMLSelectElement;
    if (f.value !== t.value) f.value = t.value;
  }
}

function morphChildren(from: Element, to: Element) {
  const newKids = Array.from(to.childNodes);
  const keyed = new Map<string, Element>();
  for (const k of Array.from(from.childNodes)) {
    const key = keyOf(k);
    if (key) keyed.set(key, k as Element);
  }
  for (let i = 0; i < newKids.length; i++) {
    const n = newKids[i];
    const current = from.childNodes[i] as Node | undefined;
    const nkey = keyOf(n);
    if (nkey) {
      const match = keyed.get(nkey);
      if (match && match.tagName === (n as Element).tagName) {
        keyed.delete(nkey);
        if (match !== current) from.insertBefore(match, current ?? null);
        morph(match, n as Element);
      } else {
        from.insertBefore(n, current ?? null);
      }
      continue;
    }
    if (!current) {
      from.appendChild(n);
      continue;
    }
    if (current.nodeType === 3 && n.nodeType === 3) {
      if (current.textContent !== n.textContent) current.textContent = n.textContent;
      continue;
    }
    if (
      current.nodeType === 1 &&
      n.nodeType === 1 &&
      (current as Element).tagName === (n as Element).tagName &&
      !keyOf(current)
    ) {
      morph(current as Element, n as Element);
      continue;
    }
    from.replaceChild(n, current);
  }
  while (from.childNodes.length > newKids.length) from.removeChild(from.lastChild!);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function uid(prefix = ''): string {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return prefix + r[0].toString(36) + r[1].toString(36);
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'report';
}
