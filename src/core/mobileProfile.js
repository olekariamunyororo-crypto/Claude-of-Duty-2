/**
 * Permanent mobile runtime profile — single source of truth.
 * Desktop: fixed 120 Hz + full HDR. Mobile: variable dt, fixed exposure, known quality.
 */
export const MOBILE_PROFILE = {
  quality: "low",
  physicsDtCap: 0.05,
  moveSpeedScale: 1.35,
  timeScale: 1,
  touchLookScale: 1.6,
  sensitivity: 0.0018,
  stickRadius: 64,
  autoSprintInput: 0.4,
  autoSprintForward: 0.4,
  exposureBias: 1.1,
  exposureKey: 0.55,
  exposure: 0.85,
  exposureMinEv: -1.5,
  exposureMaxEv: 12,
  jumpScale: 1.15,

  // --- upgrades ---
  renderScale: 0.42,
  dynResSlowMs: 33,
  dynResFastMs: 18,
  dynResMin: 0.28,
  dynResMax: 0.5,
  aiSquads: 1,
  aiPerSquad: 2,
  aiPathsPerFrame: 1,
  skipPrewarm: true,
  ldrTargets: true,
  dprCap: 1,
};

export function applyMobileProfile(config, profile = MOBILE_PROFILE) {
  config.mobile = true;
  if (!config.quality || config.quality === "mobile") config.quality = profile.quality;
  if (typeof config.setQuality === "function") {
    try { config.setQuality(config.quality); } catch (_) {}
  }
  if (config.q) {
    config.q.renderScale = profile.renderScale;
    config.q.shadowMapSize = Math.min(config.q.shadowMapSize || 512, 512);
    config.q.cascades = Math.min(config.q.cascades || 2, 2);
    config.q.bloom = false;
    config.q.taa = false;
    config.q.gtao = false;
    config.q.ssr = false;
    config.q.particleBudget = Math.min(config.q.particleBudget || 400, 400);
  }
  config.physicsHz = 30;
  config.maxSubsteps = 8;
  config.physicsDtCap = profile.physicsDtCap;
  config.moveSpeedScale = profile.moveSpeedScale;
  config.timeScale = profile.timeScale;
  config.sensitivity = profile.sensitivity;
  config.exposure = profile.exposure;
  config.touchLookScale = profile.touchLookScale;
  config.stickRadius = profile.stickRadius;
  config.autoSprintInput = profile.autoSprintInput;
  config.autoSprintForward = profile.autoSprintForward;
  config.jumpScale = profile.jumpScale;
  config.mobileExposure = {
    bias: profile.exposureBias,
    key: profile.exposureKey,
    minEv: profile.exposureMinEv,
    maxEv: profile.exposureMaxEv,
  };
  config.dynResSlowMs = profile.dynResSlowMs;
  config.dynResFastMs = profile.dynResFastMs;
  config.dynResMin = profile.dynResMin;
  config.dynResMax = profile.dynResMax;
  config.aiSquads = profile.aiSquads;
  config.aiPerSquad = profile.aiPerSquad;
  config.aiPathsPerFrame = profile.aiPathsPerFrame;
  config.skipPrewarm = profile.skipPrewarm;
  config.ldrTargets = profile.ldrTargets;
  config.dprCap = profile.dprCap;
  return config;
}

export function detectMobile(params = new URLSearchParams(location.search)) {
  if (params.get("mobile") === "0") return false;
  if (params.get("mobile") === "1" || params.get("mobile") === "true") return true;
  return (
    navigator.maxTouchPoints > 0 ||
    matchMedia("(pointer: coarse)").matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  );
}
