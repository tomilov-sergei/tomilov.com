// Port of WallpaperState / Spring in Apple's saved main.built.js.
// The source advances one 1/30 step per rendered frame, independently of dt.
const clamp = value => Math.min(1, Math.max(0, value));
export const foldTarget = hinge => clamp((clamp(hinge) - 0.11) / 0.89);

export class WallpaperState {
  constructor() {
    const omega = 2 * Math.PI / (3 / 7);
    this.stiffness = omega * omega;
    this.damping = 2.6 * omega;
    this.velocity = 0;
    this.fold = 1;
    this.needsMoreFrames = false;
  }
  reset(hinge) {
    this.fold = foldTarget(hinge);
    this.velocity = 0;
    this.needsMoreFrames = false;
  }
  step(hinge) {
    const target = foldTarget(hinge);
    if (![this.fold, target, this.velocity].every(Number.isFinite)) {
      this.velocity = 0;
      this.fold = Number.isFinite(target) ? target : Number.isFinite(this.fold) ? this.fold : 0;
      this.needsMoreFrames = false;
      return this.fold;
    }
    const displacement = Math.min(1, Math.max(-1, this.fold - target));
    this.velocity += (-this.stiffness * displacement - this.damping * this.velocity) / 30;
    const value = clamp(this.fold + this.velocity / 30);
    this.needsMoreFrames = Math.abs(this.velocity) >= 0.001 || Math.abs(value - this.fold) >= 0.001;
    this.fold = this.needsMoreFrames ? value : target;
    if (!this.needsMoreFrames) this.velocity = 0;
    return this.fold;
  }
}
