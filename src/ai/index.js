/**
 * Temporary minimal AI system — prevents boot crash.
 * Run RESTORE_AND_PUSH.sh or paste full src/ai/index.js from local upgrade.
 */
import * as THREE from 'three';

export const VARIANTS = {};
export const STATE = {};

export class AiSystem {
  static id = 'ai';
  static deps = ['physics', 'world'];

  async init(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.name = 'ai';
    ctx.scene.add(this.root);
    this.agents = [];
    this.squads = [];
    this.stats = { agents: 0, alive: 0, navMs: 0, coverPts: 0, walkable: 0 };
    console.warn('[ai] minimal stub — restore full AI file');
  }

  update() {}
  fixedUpdate() {}
  lateUpdate() {}
  populate() { return 0; }
  spawn() { return null; }
  dispose() {
    this.root?.parent?.remove(this.root);
  }
}
