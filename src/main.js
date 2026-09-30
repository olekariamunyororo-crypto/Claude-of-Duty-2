import { Engine } from './core/engine.js';
import { createConfig } from './core/config.js';
import { detectMobile, applyMobileProfile } from './core/mobileProfile.js';

import { RenderSystem } from './render/index.js';
import { MaterialSystem } from './materials/index.js';
import { SkySystem } from './sky/index.js';
import { WorldSystem } from './world/index.js';
import { PhysicsSystem } from './physics/index.js';
import { PlayerSystem } from './player/index.js';
import { WeaponSystem } from './weapons/index.js';
import { FxSystem } from './fx/index.js';
import { AiSystem } from './ai/index.js';
import { UiSystem } from './ui/index.js';
import { AudioSystem } from './audio/index.js';

import { installShotApi } from './dev/shots.js';
import { prewarm } from './core/prewarm.js';

const params = new URLSearchParams(location.search);
const capture = params.get('capture') === '1';
const lockstep = capture && params.get('lockstep') === '1';

const isMobile = detectMobile(params);

const defaultQuality = isMobile ? 'low' : 'medium';
const config = createConfig({
  quality: params.get('q') ?? defaultQuality,
  deterministic: capture,
  mobile: isMobile,
});
if (isMobile) applyMobileProfile(config);
window.__MOBILE__ = isMobile;
console.info(
  '[boot] quality=%s mobile=%s moveScale=%s timeScale=%s sens=%s',
  config.quality, isMobile, config.moveSpeedScale ?? 1, config.timeScale ?? 1, config.sensitivity,
);

const canvas = document.getElementById('game');

const engine = new Engine({ canvas, config });
if (config.timeScale != null) engine.time.scale = config.timeScale;

engine
  .add(RenderSystem)
  .add(MaterialSystem)
  .add(SkySystem)
  .add(WorldSystem)
  .add(PhysicsSystem)
  .add(PlayerSystem)
  .add(WeaponSystem)
  .add(FxSystem)
  .add(AiSystem)
  .add(UiSystem)
  .add(AudioSystem);

try {
  await engine.init();
} catch (err) {
  console.error('[boot] init failed', err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<pre style="position:fixed;inset:0;padding:2rem;color:#f66;background:#000;
       font:12px/1.5 ui-monospace,monospace;overflow:auto;z-index:9999;white-space:pre-wrap">
BOOT FAILURE\n\n${err.stack ?? err.message}</pre>`
  );
  throw err;
}

const shotApi = installShotApi(engine, { capture, lockstep });

const skipWarm =
  params.get('prewarm') === '0' ||
  (isMobile && config.skipPrewarm !== false && params.get('prewarm') !== '1');
const warmup = skipWarm
  ? { ok: false, reason: isMobile ? 'skipped on mobile (set ?prewarm=1 to force)' : 'disabled by ?prewarm=0' }
  : await prewarm(engine);
console.info('[boot] prewarm', warmup);
window.__PREWARM__ = warmup;

engine.start();

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

const BOOT_FRAMES = 3;
if (lockstep) {
  await shotApi.pump(BOOT_FRAMES);
  window.__READY__ = true;
} else {
  let warm = 0;
  const readyProbe = () => {
    if (++warm >= BOOT_FRAMES) {
      window.__READY__ = true;
      return;
    }
    requestAnimationFrame(readyProbe);
  };
  requestAnimationFrame(readyProbe);
}

window.__ENGINE__ = engine;

if (import.meta.hot) {
  import.meta.hot.dispose(() => engine.dispose());
}
