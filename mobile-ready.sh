#!/usr/bin/env bash
# Mobile-ready patch for Claude-of-Duty / OVERWATCH
set -euo pipefail
ROOT="$(pwd)"
if [[ ! -f "$ROOT/src/main.js" || ! -f "$ROOT/index.html" ]]; then
  echo "ERROR: run from the repo root (index.html + src/)."
  exit 1
fi
mkdir -p .mobile-backup
for f in index.html src/main.js src/core/config.js src/core/input.js src/render/index.js; do
  cp -n "\( f" ".mobile-backup/ \)(echo "$f" | tr '/' '_')" 2>/dev/null || true
done

echo "==> 1/5 index.html"
cat > index.html << 'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>OVERWATCH — Tactical Shooter</title>
    <style>
      :root { color-scheme: dark; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: #000; touch-action: none; -webkit-user-select: none; user-select: none; }
      body { font-family: "Inter", "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
      #game { display: block; width: 100vw; height: 100vh; touch-action: none; cursor: none; }
      #boot {
        position: fixed; inset: 0; z-index: 9998;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: #050505; color: #c8c8c8;
        font: 14px/1.5 system-ui, -apple-system, sans-serif;
        transition: opacity 0.4s ease;
      }
      #boot.hidden { opacity: 0; pointer-events: none; }
      #boot .title { font-size: 22px; letter-spacing: 0.18em; color: #eee; margin-bottom: 12px; font-weight: 600; }
      #boot .sub { opacity: 0.7; font-size: 13px; max-width: 280px; text-align: center; }
      #boot .bar { width: min(220px, 60vw); height: 3px; margin-top: 22px; background: #222; border-radius: 2px; overflow: hidden; }
      #boot .bar > i { display: block; height: 100%; width: 30%; background: linear-gradient(90deg, #3a7, #6cf); animation: bootslide 1.2s ease-in-out infinite; }
      @keyframes bootslide { 0% { transform: translateX(-100%); } 50% { transform: translateX(230%); } 100% { transform: translateX(-100%); } }
      #touch-ui { position: fixed; inset: 0; z-index: 20; pointer-events: none; display: none; }
      #touch-ui.on { display: block; }
      #stick-base, #look-zone, #btn-fire, #btn-jump, #btn-reload { pointer-events: auto; position: absolute; }
      #stick-base {
        left: max(16px, env(safe-area-inset-left)); bottom: max(24px, env(safe-area-inset-bottom));
        width: 120px; height: 120px; border-radius: 50%;
        background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18);
      }
      #stick-knob {
        position: absolute; left: 50%; top: 50%; width: 48px; height: 48px; margin: -24px 0 0 -24px;
        border-radius: 50%; background: rgba(255,255,255,0.28); border: 1px solid rgba(255,255,255,0.35); will-change: transform;
      }
      #look-zone { right: 0; top: 0; bottom: 0; width: 55%; }
      #btn-fire {
        right: max(18px, env(safe-area-inset-right)); bottom: max(36px, env(safe-area-inset-bottom));
        width: 72px; height: 72px; border-radius: 50%; background: rgba(220,60,60,0.35); border: 2px solid rgba(255,120,120,0.55);
      }
      #btn-jump {
        right: max(100px, calc(env(safe-area-inset-right) + 90px)); bottom: max(48px, env(safe-area-inset-bottom));
        width: 52px; height: 52px; border-radius: 50%; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.3);
      }
      #btn-reload {
        right: max(24px, env(safe-area-inset-right)); bottom: max(120px, calc(env(safe-area-inset-bottom) + 100px));
        width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.3);
      }
      #btn-fire::after, #btn-jump::after, #btn-reload::after {
        position: absolute; inset: 0; display: grid; place-items: center; font: 11px/1 system-ui; color: rgba(255,255,255,0.85); letter-spacing: 0.06em;
      }
      #btn-fire::after { content: "FIRE"; }
      #btn-jump::after { content: "JUMP"; }
      #btn-reload::after { content: "R"; }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <div id="ui"></div>
    <div id="boot">
      <div class="title">OVERWATCH</div>
      <div class="sub" id="boot-msg">Building world… first load can take 15–40s on mobile</div>
      <div class="bar"><i></i></div>
    </div>
    <div id="touch-ui">
      <div id="stick-base"><div id="stick-knob"></div></div>
      <div id="look-zone"></div>
      <div id="btn-fire"></div>
      <div id="btn-jump"></div>
      <div id="btn-reload"></div>
    </div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
HTML

echo "==> 2/5 main.js"
python3 - << 'PY'
from pathlib import Path
p = Path("src/main.js")
text = p.read_text()
old = """const params = new URLSearchParams(location.search);
const capture = params.get('capture') === '1';
// Deterministic shutter for the pixel gate: the engine does not schedule its own
// frames, the driver advances exactly N of them through window.__PUMP__. Opt-in,
// because tools that measure real frame pacing (tools/perf.mjs) need the loop to
// free-run. See the long comment in src/dev/shots.js.
const lockstep = capture && params.get('lockstep') === '1';

const config = createConfig({
  quality: params.get('q') ?? 'ultra',
  deterministic: capture,
});
"""
new = """const params = new URLSearchParams(location.search);
const capture = params.get('capture') === '1';
// Deterministic shutter for the pixel gate: the engine does not schedule its own
// frames, the driver advances exactly N of them through window.__PUMP__. Opt-in,
// because tools that measure real frame pacing (tools/perf.mjs) need the loop to
// free-run. See the long comment in src/dev/shots.js.
const lockstep = capture && params.get('lockstep') === '1';

const isMobile =
  params.get('mobile') === '1' ||
  params.get('mobile') === 'true' ||
  (params.get('mobile') !== '0' &&
    (navigator.maxTouchPoints > 0 ||
      matchMedia('(pointer: coarse)').matches ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)));

const defaultQuality = isMobile ? 'low' : 'medium';
const config = createConfig({
  quality: params.get('q') ?? defaultQuality,
  deterministic: capture,
  mobile: isMobile,
});
window.__MOBILE__ = isMobile;
console.info('[boot] quality=%s mobile=%s', config.quality, isMobile);
"""
if old not in text:
    raise SystemExit('main.js: quality block not found')
text = text.replace(old, new, 1)
if "Dismiss the HTML boot splash" not in text:
    text = text.replace("engine.start();", """engine.start();

{
  const boot = document.getElementById('boot');
  const hide = () => {
    if (!boot || boot.classList.contains('hidden')) return;
    boot.classList.add('hidden');
    setTimeout(() => boot.remove(), 500);
  };
  if (lockstep) hide();
  else {
    let n = 0;
    const tick = () => { if (++n >= 2) hide(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
}
""", 1)
p.write_text(text)
print("main.js OK")
PY

echo "==> 3/5 config.js"
python3 - << 'PY'
from pathlib import Path
p = Path("src/core/config.js")
text = p.read_text()
if "mobile:" not in text:
    text = text.replace(
        "export const DEFAULTS = {\n  quality: 'ultra',",
        "export const DEFAULTS = {\n  quality: 'medium',\n  mobile: false,",
        1,
    )
    p.write_text(text)
print("config.js OK")
PY

echo "==> 4/5 input.js (touch)"
python3 - << 'PY'
from pathlib import Path
import re
p = Path("src/core/input.js")
text = p.read_text()
if "MOBILE_TOUCH_PATCH" in text:
    print("input.js already patched"); raise SystemExit(0)
text = text.replace(
    "this.frozen = false;\n",
    "this.frozen = false;\n\n    this.mobile = !!(config && config.mobile);\n"
    "    this._touchLookId = null;\n    this._touchStickId = null;\n"
    "    this._stickOrigin = { x: 0, y: 0 };\n    // MOBILE_TOUCH_PATCH\n",
    1,
)
m = re.search(r"this\.canvas\.addEventListener\('contextmenu', this\._bound\.contextmenu\);\s*\}", text)
if not m: raise SystemExit('attach end missing')
text = text[:m.start()] + "this.canvas.addEventListener('contextmenu', this._bound.contextmenu);\n    if (this.mobile) this._setupTouch();\n  }" + text[m.end():]
text = text.replace(
    "if (!this.enabled || !this.pointerLocked || this.frozen) return;",
    "if (!this.enabled || this.frozen) return;\n    if (!this.pointerLocked && !this.mobile) return;",
    1,
)
mobile_methods = r'''
  // ---- mobile touch (MOBILE_TOUCH_PATCH) ---------------------------------
  _setupTouch() {
    const ui = document.getElementById('touch-ui');
    if (ui) ui.classList.add('on');
    this._stickBase = document.getElementById('stick-base');
    this._stickKnob = document.getElementById('stick-knob');
    this._lookZone = document.getElementById('look-zone');
    this._btnFire = document.getElementById('btn-fire');
    this._btnJump = document.getElementById('btn-jump');
    this._btnReload = document.getElementById('btn-reload');
    const on = (el, type, fn, opts) => el && el.addEventListener(type, fn, opts || { passive: false });
    on(this._stickBase, 'touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._touchStickId = t.identifier;
      const r = this._stickBase.getBoundingClientRect();
      this._stickOrigin.x = r.left + r.width / 2;
      this._stickOrigin.y = r.top + r.height / 2;
      this._updateStick(t.clientX, t.clientY);
    });
    on(window, 'touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchStickId) { e.preventDefault(); this._updateStick(t.clientX, t.clientY); }
      }
    }, { passive: false });
    on(window, 'touchend', (e) => this._touchEnd(e));
    on(window, 'touchcancel', (e) => this._touchEnd(e));
    let lastLook = null;
    on(this._lookZone, 'touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._touchLookId = t.identifier;
      lastLook = { x: t.clientX, y: t.clientY };
    });
    on(this._lookZone, 'touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._touchLookId) continue;
        e.preventDefault();
        if (lastLook) {
          this._rawLook.x += (t.clientX - lastLook.x) * 1.6;
          this._rawLook.y += (t.clientY - lastLook.y) * 1.6;
        }
        lastLook = { x: t.clientX, y: t.clientY };
      }
    }, { passive: false });
    on(this._lookZone, 'touchend', () => { this._touchLookId = null; lastLook = null; });
    on(this._lookZone, 'touchcancel', () => { this._touchLookId = null; lastLook = null; });
    const hold = (el, code) => {
      if (!el) return;
      const down = (e) => { e.preventDefault(); this._pendingDown.add(code); };
      const up = (e) => { e.preventDefault(); this._pendingUp.add(code); };
      on(el, 'touchstart', down); on(el, 'touchend', up); on(el, 'touchcancel', up);
    };
    hold(this._btnFire, 'Mouse0');
    hold(this._btnJump, 'Space');
    hold(this._btnReload, 'KeyR');
    this.pointerLocked = true;
  }
  _updateStick(clientX, clientY) {
    const maxR = 48;
    let dx = clientX - this._stickOrigin.x;
    let dy = clientY - this._stickOrigin.y;
    const len = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, maxR / len);
    dx *= scale; dy *= scale;
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
      if (t.identifier === this._touchLookId) this._touchLookId = null;
    }
  }
'''
idx = text.rfind("\n}")
text = text[:idx] + mobile_methods + text[idx:]
p.write_text(text)
print("input.js OK")
PY

echo "==> 5/5 render pixel ratio"
python3 - << 'PY'
from pathlib import Path
p = Path("src/render/index.js")
text = p.read_text()
if "MOBILE_PIXEL_RATIO" not in text:
    old = "    renderer.setClearColor(0x000000, 1);\n    this.renderer = renderer;\n"
    new = """    renderer.setClearColor(0x000000, 1);
    // MOBILE_PIXEL_RATIO
    const dprCap = (ctx.config && ctx.config.mobile) ? 1.5 : 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    this.renderer = renderer;
"""
    if old not in text: raise SystemExit('render block missing')
    p.write_text(text.replace(old, new, 1))
print("render OK")
PY

echo ""
echo "DONE. Now run:"
echo "  git add -A && git commit -m 'mobile-ready: low quality, boot UI, touch controls' && git push"
