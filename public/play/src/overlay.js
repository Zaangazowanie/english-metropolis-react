// One overlay stack for every panel the HUD can put over the world: welcome
// tour, dialog, metro list, city map, journal, guide, settings, ceremony card.
//
// Before this, overlay state lived in six places and the probes showed the
// journal, map, metro and guide open on top of each other over a dialog, with
// Escape closing only two of them. Rules now:
//   - opening an exclusive panel closes every other exclusive panel first;
//   - Escape closes the topmost panel (welcome > ceremony > dialog > metro/map/journal > guide);
//   - body.overlay-open while anything is up (Input drops game keys),
//     body.modal-open while the welcome tour or a dialog is up (hotkeys ignored),
//     body.dialog-open while a dialog is up (touch controls hide underneath it);
//   - `any` is the single "blocked" predicate the sim, camera, prompt and
//     hotkeys all read.
export class OverlayStack {
  constructor() {
    this.panels = new Map();   // name -> { el, show, hide, exclusive, escapable, modal }
    this.stack = [];           // open panel names, bottom → top
    this.listeners = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.stack.length) return;
      const top = this.top;
      if (top && this.panels.get(top)?.escapable === false) return;
      e.preventDefault();
      this.closeTop();
    });
  }

  // show/hide receive the args passed to open(); return false from show to
  // veto (e.g. the map refusing to open mid-drill).
  register(name, { el = null, show = null, hide = null, exclusive = true, escapable = true, modal = false } = {}) {
    this.panels.set(name, { el, show, hide, exclusive, escapable, modal });
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _sync() {
    const b = document.body;
    b.classList.toggle('overlay-open', this.stack.length > 0);
    b.classList.toggle('modal-open', this.stack.some((n) => this.panels.get(n)?.modal));
    b.classList.toggle('dialog-open', this.stack.includes('dialog'));
    for (const fn of this.listeners) { try { fn(this.stack.slice()); } catch (e) { console.warn('[EM] overlay listener', e); } }
  }

  get top() { return this.stack[this.stack.length - 1] || null; }
  get any() { return this.stack.length > 0; }
  isOpen(name) { return this.stack.includes(name); }

  open(name, ...args) {
    const p = this.panels.get(name);
    if (!p) throw new Error(`overlay: unknown panel ${name}`);
    if (p.exclusive) {
      for (const other of this.stack.slice()) {
        if (other !== name && this.panels.get(other)?.exclusive) this.close(other);
      }
    }
    if (this.isOpen(name)) { this.stack.splice(this.stack.indexOf(name), 1); }
    const ok = p.show ? p.show(...args) : undefined;
    if (ok === false) { this._sync(); return false; }
    if (p.el) p.el.style.display = 'flex';
    this.stack.push(name);
    this._sync();
    return true;
  }

  close(name) {
    const i = this.stack.indexOf(name);
    if (i < 0) return false;
    const p = this.panels.get(name);
    this.stack.splice(i, 1);
    if (p?.el) p.el.style.display = 'none';
    p?.hide?.();
    this._sync();
    return true;
  }

  closeTop() { return this.top ? this.close(this.top) : false; }
  closeAll() { for (const n of this.stack.slice().reverse()) this.close(n); }
  toggle(name, ...args) { return this.isOpen(name) ? (this.close(name), false) : this.open(name, ...args); }
}

// Toast queue: messages render one after another, at most two visible, so a
// reward is never overwritten in the same tick by the next system message.
export class ToastQueue {
  constructor(container, { hold = 2200, max = 2 } = {}) {
    this.el = container;
    this.hold = hold;
    this.max = max;
    this.queue = [];
    this.live = [];
    this.recent = [];   // for probes: last 12 messages shown
  }
  push(text, { kind = '' } = {}) {
    this.queue.push({ text, kind });
    this._pump();
  }
  _pump() {
    while (this.queue.length && this.live.length < this.max) {
      const t = this.queue.shift();
      const row = document.createElement('div');
      row.className = `toast${t.kind ? ' ' + t.kind : ''}`;
      row.textContent = t.text;
      this.el.appendChild(row);
      requestAnimationFrame(() => row.classList.add('on'));
      this.live.push(row);
      this.recent = [...this.recent, t.text].slice(-12);
      setTimeout(() => {
        row.classList.remove('on');
        setTimeout(() => {
          row.remove();
          const i = this.live.indexOf(row);
          if (i >= 0) this.live.splice(i, 1);
          this._pump();
        }, 320);
      }, this.hold);
    }
  }
  clear() { this.queue.length = 0; }
}
