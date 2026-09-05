// Trackpad-first input: one-finger drag orbits the camera, two-finger scroll
// zooms, WASD moves. On touch devices: left-half virtual joystick moves,
// right-half drag looks, on-screen buttons for jump/talk/metro/journal.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.interactPressed = false;   // edge-triggered, consumed each frame
    this.guideToggled = false;
    this.dragging = false;
    this.lookActive = false;
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;
    this.joy = { x: 0, y: 0, active: false };   // -1..1 virtual stick
    let lastX = 0, lastY = 0;

    if (this.isTouch) {
      document.body.classList.add('touch');
      let joyId = null, lookId = null, joyOX = 0, joyOY = 0, lookLX = 0, lookLY = 0;
      canvas.addEventListener('touchstart', (e) => {
        for (const t of e.changedTouches) {
          if (t.clientX < window.innerWidth / 2 && joyId === null) {
            joyId = t.identifier; joyOX = t.clientX; joyOY = t.clientY; this.joy.active = true;
          } else if (lookId === null) {
            lookId = t.identifier; lookLX = t.clientX; lookLY = t.clientY;
            this.lookActive = true;
          }
        }
        e.preventDefault();
      }, { passive: false });
      canvas.addEventListener('touchmove', (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === joyId) {
            this.joy.x = Math.max(-1, Math.min(1, (t.clientX - joyOX) / 55));
            this.joy.y = Math.max(-1, Math.min(1, (t.clientY - joyOY) / 55));
          } else if (t.identifier === lookId) {
            this.mouseDX += t.clientX - lookLX;
            this.mouseDY += t.clientY - lookLY;
            lookLX = t.clientX; lookLY = t.clientY;
          }
        }
        e.preventDefault();
      }, { passive: false });
      const endTouch = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === joyId) { joyId = null; this.joy.x = 0; this.joy.y = 0; this.joy.active = false; }
          if (t.identifier === lookId) { lookId = null; this.lookActive = false; }
        }
      };
      canvas.addEventListener('touchend', endTouch);
      canvas.addEventListener('touchcancel', endTouch);

      // Visible joystick (#stick, bottom-left) — sits above the canvas so its
      // finger never reaches the invisible left-half stick; both feed this.joy.
      const stick = document.getElementById('stick');
      const nub = document.getElementById('stick-nub');
      if (stick && nub) {
        let sId = null, cx = 0, cy = 0;
        const R = 44;
        const set = (dx, dy) => {
          const m = Math.hypot(dx, dy) || 1, c = Math.min(m, R) / m;
          dx *= c; dy *= c;
          nub.style.transform = `translate(${dx}px, ${dy}px)`;
          this.joy.x = dx / R; this.joy.y = dy / R;
        };
        stick.addEventListener('touchstart', (e) => {
          if (sId !== null) return;
          const t = e.changedTouches[0];
          sId = t.identifier;
          const r = stick.getBoundingClientRect();
          cx = r.left + r.width / 2; cy = r.top + r.height / 2;
          this.joy.active = true;
          set(t.clientX - cx, t.clientY - cy);
          e.stopPropagation();
          e.preventDefault();
        }, { passive: false });
        stick.addEventListener('touchmove', (e) => {
          for (const t of e.changedTouches) if (t.identifier === sId) set(t.clientX - cx, t.clientY - cy);
          e.stopPropagation();
          e.preventDefault();
        }, { passive: false });
        const sEnd = (e) => {
          for (const t of e.changedTouches) if (t.identifier === sId) {
            sId = null; this.joy.x = 0; this.joy.y = 0; this.joy.active = false;
            nub.style.transform = 'translate(0px, 0px)';
          }
        };
        stick.addEventListener('touchend', sEnd);
        stick.addEventListener('touchcancel', sEnd);
      }
    }

    // Keys are ignored while a form control has focus (arrow keys on the
    // graphics dropdown used to steer the character behind it). While any
    // overlay is up (body.overlay-open, set by overlay.js) movement keys are
    // dropped; while the welcome tour or a dialog is up (body.modal-open) the
    // panel hotkeys are dropped too, so panels cannot stack over a drill.
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.target?.closest?.('input, select, textarea')) return;
      const body = document.body.classList;
      if (body.contains('modal-open')) return;
      const hotkey = { KeyE: 'interactPressed', KeyH: 'guideToggled', KeyJ: 'journalToggled', KeyT: 'metroToggled', KeyM: 'mapToggled' }[e.code];
      if (hotkey) { this[hotkey] = true; return; }
      if (body.contains('overlay-open')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
      this.lookActive = false;
    });

    canvas.addEventListener('pointerdown', (e) => {
      // Touch gestures are classified above as either movement or free-look.
      // Letting the synthetic pointer stream through as well made the left
      // movement pad rotate the camera at the same time.
      if (e.pointerType === 'touch') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.dragging = true;
      this.lookActive = true;
      lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (!this.dragging) return;
      this.mouseDX += e.clientX - lastX;
      this.mouseDY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
    });
    const endDrag = (e) => {
      if (e.pointerType === 'touch') return;
      this.dragging = false;
      this.lookActive = false;
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // two-finger trackpad swipe = wheel with small deltas; accumulate raw
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += e.deltaY * 0.01;
    }, { passive: false });
  }

  get forward() { return this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.joy.y < -0.25; }
  get back()    { return this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.joy.y > 0.25; }
  get left()    { return this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.joy.x < -0.25; }
  get right()   { return this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.joy.x > 0.25; }
  get sprint()  { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > 0.92; }
  get jump()    { return this.keys.has('Space'); }

  // on-screen button hooks (touch HUD)
  pressInteract() { this.interactPressed = true; }
  pressJump()     { this.keys.add('Space'); setTimeout(() => this.keys.delete('Space'), 120); }
  pressMetro()    { this.metroToggled = true; }
  pressMap()      { this.mapToggled = true; }
  pressJournal()  { this.journalToggled = true; }

  // call once per render frame
  consume() {
    const out = {
      dx: this.mouseDX, dy: this.mouseDY, wheel: this.wheel,
      looking: this.lookActive,
      interact: this.interactPressed, guide: this.guideToggled, journal: this.journalToggled,
      metro: this.metroToggled, map: this.mapToggled,
    };
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.interactPressed = false; this.guideToggled = false; this.journalToggled = false;
    this.metroToggled = false; this.mapToggled = false;
    return out;
  }
}
