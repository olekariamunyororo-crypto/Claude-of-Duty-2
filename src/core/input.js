/**
 * Input aggregation: keyboard, mouse (pointer-locked), and gamepad, exposed as
 * a stable per-frame snapshot so gameplay never touches raw DOM events.
 *
 * Edge queries (`pressed`, `released`) are valid only during the frame in which
 * the transition happened — read them in update(), not fixedUpdate().
 */

export const ACTIONS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  crouch: ['ControlLeft', 'KeyC'],
  prone: ['KeyZ'],
  sprint: ['ShiftLeft'],
  reload: ['KeyR'],
  use: ['KeyF'],
  melee: ['KeyV'],
  leanLeft: ['KeyQ'],
  leanRight: ['KeyE'],
  swapWeapon: ['Digit1', 'Digit2', 'Tab'],
  grenade: ['KeyG'],
  flashlight: ['KeyT'],
  pause: ['Escape'],
};

export class Input {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;

    this.down = new Set(); // codes currently held
    this._pressed = new Set(); // went down this frame
    this._released = new Set(); // went up this frame
    this._pendingDown = new Set();
    this._pendingUp = new Set();

    /** Accumulated pointer delta for this frame, in radians after sensitivity. */
    this.look = { x: 0, y: 0 };
    this._rawLook = { x: 0, y: 0 };
    this.wheel = 0;
    this._pendingWheel = 0;

    this.pointerLocked = false;
    this.enabled = true;
    /** Set true by capture mode so scripted shots aren't fought by real input. */
    this.frozen = false;

    this.mobile = !!(config && config.mobile);
    this._touchLookId = null;
    this._touchStickId = null;
    this._stickOrigin = { x: 0, y: 0 };
    // MOBILE_TOUCH_PATCH

    this.gamepadIndex = null;
    this.stick = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };

    this._bound = {
      keydown: this._onKeyDown.bind(this),
      keyup: this._onKeyUp.bind(this),
      mousedown: this._onMouseDown.bind(this),
      mouseup: this._onMouseUp.bind(this),
      mousemove: this._onMouseMove.bind(this),
      wheel: this._onWheel.bind(this),
      lockchange: this._onLockChange.bind(this),
      blur: this._onBlur.bind(this),
      contextmenu: (e) => e.preventDefault(),
    };
  }

  attach() {
    addEventListener('keydown', this._bound.keydown);
    addEventListener('keyup', this._bound.keyup);
    addEventListener('mousedown', this._bound.mousedown);
    addEventListener('mouseup', this._bound.mouseup);
    addEventListener('mousemove', this._bound.mousemove);
    addEventListener('wheel', this._bound.wheel, { passive: true });
    addEventListener('blur', this._bound.blur);
    document.addEventListener('pointerlockchange', this._bound.lockchange);
    this.canvas.addEventListener('contextmenu', this._bound.contextmenu);
    if (this.mobile) this._setupTouch();
  }

  detach() {
    removeEventListener('keydown', this._bound.keydown);
    removeEventListener('keyup', this._bound.keyup);
    removeEventListener('mousedown', this._bound.mousedown);
    removeEventListener('mouseup', this._bound.mouseup);
    removeEventListener('mousemove', this._bound.mousemove);
    removeEventListener('wheel', this._bound.wheel);
    removeEventListener('blur', this._bound.blur);
    document.removeEventListener('pointerlockchange', this._bound.lockchange);
    this.canvas.removeEventListener('contextmenu', this._bound.contextmenu);
  }

  requestPointerLock() {
    // Chrome returns a promise that rejects if the document is not eligible
    // (headless capture, an iframe, a lock request too soon after an exit).
    // An unhandled rejection there shows up as a page error in the harness, so
    // swallow it: failing to lock is not a game error.
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* not eligible — keep running unlocked */
    }
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    if (e.repeat) return;
    // Let devtools/refresh through; swallow everything else the game binds.
    if (!e.metaKey && !e.ctrlKey) e.preventDefault();
    this._pendingDown.add(e.code);
  }

  _onKeyUp(e) {
    if (!this.enabled) return;
    this._pendingUp.add(e.code);
  }

  _onMouseDown(e) {
    if (!this.enabled) return;
    if (!this.pointerLocked && e.button === 0) this.requestPointerLock();
    this._pendingDown.add(`Mouse${e.button}`);
  }

  _onMouseUp(e) {
    if (!this.enabled) return;
    this._pendingUp.add(`Mouse${e.button}`);
  }

  _onMouseMove(e) {
    if (!this.enabled || this.frozen) return;
    if (!this.pointerLocked && !this.mobile) return;
    // movementX/Y is already relative and unaffected by cursor clamping.
    this._rawLook.x += e.movementX ?? 0;
    this._rawLook.y += e.movementY ?? 0;
  }

  _onWheel(e) {
    if (!this.enabled) return;
    this._pendingWheel += Math.sign(e.deltaY);
  }

  _onLockChange() {
    if (this.mobile) { this.pointerLocked = true; return; }
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (!this.pointerLocked) this._onBlur();
  }

  /** Losing focus must release every held key, or the player runs forever. */
  _onBlur() {
    for (const code of this.down) this._pendingUp.add(code);
    this._rawLook.x = 0;
    this._rawLook.y = 0;
  }

  beginFrame() {
    this._pressed.clear();
    this._released.clear();

    for (const code of this._pendingDown) {
      if (!this.down.has(code)) {
        this.down.add(code);
        this._pressed.add(code);
      }
    }
    for (const code of this._pendingUp) {
      if (this.down.delete(code)) this._released.add(code);
    }
    this._pendingDown.clear();
    this._pendingUp.clear();

    const s = this.config.sensitivity;
    this.look.x = this.frozen ? 0 : this._rawLook.x * s;
    this.look.y = this.frozen ? 0 : this._rawLook.y * s * (this.config.invertY ? -1 : 1);
    this._rawLook.x = 0;
    this._rawLook.y = 0;

    this.wheel = this._pendingWheel;
    this._pendingWheel = 0;

    this._pollGamepad();
  }

  endFrame() {}

  _pollGamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads[this.gamepadIndex ?? 0] ?? pads.find(Boolean);
    if (!pad) {
      // CRITICAL: on mobile the virtual stick owns moveX/moveY.
      if (!this.mobile) {
        this.stick.moveX = this.stick.moveY = this.stick.lookX = this.stick.lookY = 0;
      } else {
        this.stick.lookX = this.stick.lookY = 0;
      }
      return;
    }
    const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
    this.stick.moveX = dz(pad.axes[0] ?? 0);
    this.stick.moveY = dz(pad.axes[1] ?? 0);
    // Cubic response curve on the look stick — fine aim near centre, fast flicks at the edge.
    const curve = (v) => Math.sign(v) * Math.abs(v) ** 2.4;
    this.stick.lookX = curve(dz(pad.axes[2] ?? 0));
    this.stick.lookY = curve(dz(pad.axes[3] ?? 0));
  }

  /** True while any key bound to `action` is held. */
  action(name) {
    const codes = ACTIONS[name];
    if (!codes) return false;
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  actionPressed(name) {
    const codes = ACTIONS[name];
    if (!codes) return false;
    for (const c of codes) if (this._pressed.has(c)) return true;
    return false;
  }

  held(code) {
    return this.down.has(code);
  }

  pressed(code) {
    return this._pressed.has(code);
  }

  released(code) {
    return this._released.has(code);
  }

  get fire() {
    return this.down.has('Mouse0');
  }

  get firePressed() {
    return this._pressed.has('Mouse0');
  }

  get ads() {
    return this.down.has('Mouse2');
  }

  /** Normalised WASD + left-stick movement, clamped to the unit disc so
   *  diagonals aren't faster than cardinals. */
  moveVector(out = { x: 0, y: 0 }) {
    let x = (this.action('right') ? 1 : 0) - (this.action('left') ? 1 : 0);
    let y = (this.action('forward') ? 1 : 0) - (this.action('back') ? 1 : 0);
    x += this.stick.moveX;
    y -= this.stick.moveY;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    out.x = x;
    out.y = y;
    return out;
  }
  // ---- mobile touch (MOBILE_TOUCH_PATCH) ---------------------------------
  _setupTouch() {
    const ui = document.getElementById('touch-ui');
    if (ui) ui.classList.add('on');
    this._stickZone = document.getElementById('stick-zone');
    this._stickBase = document.getElementById('stick-base');
    this._stickKnob = document.getElementById('stick-knob');
    this._lookZone = document.getElementById('look-zone');
    this._btnFire = document.getElementById('btn-fire');
    this._btnJump = document.getElementById('btn-jump');
    this._btnReload = document.getElementById('btn-reload');
    this._btnAds = document.getElementById('btn-ads');
    this._touchLookScale = 1.8;
    this._stickRadius = 55;
    this._touchStickId = null;
    this._touchLookId = null;
    this._lookLast = null;
    const on = (el, type, fn, opts) => { if (el) el.addEventListener(type, fn, opts || { passive: false }); };
    const stickEl = this._stickZone || this._stickBase;
    on(stickEl, 'touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = e.changedTouches[0];
      this._touchStickId = t.identifier;
      if (this._stickBase) {
        const r = this._stickBase.getBoundingClientRect();
        this._stickOrigin.x = r.left + r.width * 0.5;
        this._stickOrigin.y = r.top + r.height * 0.5;
      } else {
        this._stickOrigin.x = t.clientX; this._stickOrigin.y = t.clientY;
      }
      this._updateStick(t.clientX, t.clientY);
    });
    on(this._lookZone, 'touchstart', (e) => {
      const tag = e.target && e.target.id;
      if (tag === 'btn-fire' || tag === 'btn-jump' || tag === 'btn-reload' || tag === 'btn-ads') return;
      e.preventDefault();
      const t = e.changedTouches[0];
      this._touchLookId = t.identifier;
      this._lookLast = { x: t.clientX, y: t.clientY };
    });
    on(window, 'touchmove', (e) => {
      let used = false;
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchStickId) {
          used = true; this._updateStick(t.clientX, t.clientY);
        } else if (t.identifier === this._touchLookId && this._lookLast) {
          used = true;
          const s = this._touchLookScale;
          this._rawLook.x += (t.clientX - this._lookLast.x) * s;
          this._rawLook.y += (t.clientY - this._lookLast.y) * s;
          this._lookLast = { x: t.clientX, y: t.clientY };
        }
      }
      if (used) e.preventDefault();
    }, { passive: false });
    on(window, 'touchend', (e) => this._touchEnd(e));
    on(window, 'touchcancel', (e) => this._touchEnd(e));
    const hold = (el, code) => {
      if (!el) return;
      const down = (e) => { e.preventDefault(); e.stopPropagation(); this._pendingDown.add(code); };
      const up = (e) => { e.preventDefault(); e.stopPropagation(); this._pendingUp.add(code); };
      on(el, 'touchstart', down); on(el, 'touchend', up); on(el, 'touchcancel', up);
    };
    hold(this._btnFire, 'Mouse0');
    hold(this._btnJump, 'Space');
    hold(this._btnReload, 'KeyR');
    hold(this._btnAds, 'Mouse2');
    this.pointerLocked = true;
    console.info('[input] mobile touch controls active');
  }
  _updateStick(clientX, clientY) {
    const maxR = this._stickRadius || 55;
    let dx = clientX - this._stickOrigin.x;
    let dy = clientY - this._stickOrigin.y;
    const len = Math.hypot(dx, dy) || 1;
    if (len > maxR) { dx = (dx / len) * maxR; dy = (dy / len) * maxR; }
    this.stick.moveX = dx / maxR;
    this.stick.moveY = dy / maxR;
    if (this._stickKnob) this._stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  _touchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this._touchStickId) {
        this._touchStickId = null;
        this.stick.moveX = 0; this.stick.moveY = 0;
        if (this._stickKnob) this._stickKnob.style.transform = 'translate(0,0)';
      }
      if (t.identifier === this._touchLookId) {
        this._touchLookId = null; this._lookLast = null;
      }
    }
  }



}
