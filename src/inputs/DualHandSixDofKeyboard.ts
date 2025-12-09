import { Vector3, Quaternion, Matrix, Camera } from '@babylonjs/core';
import type { ICameraInput } from '@babylonjs/core/Cameras/cameraInputsManager';

type BaseCam = Camera;

// Two-handed 6DoF keyboard controls:
// - Movement (WASDQE) and rotation (IJKL + U/O roll)
// - Pure quaternion math for axes; no world alignment assumptions

class KeyboardYawPitchRollInput implements ICameraInput<BaseCam> {
  camera!: BaseCam;
  private keysLeft = [74]; // J
  private keysRight = [76]; // L
  private keysUp = [73]; // I
  private keysDown = [75]; // K
  private keysRollLeft = [79]; // O
  private keysRollRight = [85]; // U
  private _keys = new Set<number>();
  public rotationStep = 0.005; // radians per frame while held (~0.29°)
  private _tmpQuat: Quaternion = Quaternion.Identity();
  private _tmpForward: Vector3 = new Vector3();
  private _tmpRight: Vector3 = new Vector3();
  private _tmpUp: Vector3 = new Vector3();

    getClassName(): string {
      return 'KeyboardYawPitchRollInput';
    }

    getSimpleName(): string {
      return 'keyboardYawPitchRoll';
    }

  attachControl(noPreventDefault?: boolean): void {
    const onKeyDown = (evt: KeyboardEvent) => {
      const code = evt.keyCode || evt.which;
      if (
        this.keysLeft.includes(code) ||
        this.keysRight.includes(code) ||
        this.keysUp.includes(code) ||
        this.keysDown.includes(code) ||
        this.keysRollLeft.includes(code) ||
        this.keysRollRight.includes(code)
      ) {
        this._keys.add(code);
        if (!noPreventDefault) evt.preventDefault();
      }
    };

    const onKeyUp = (evt: KeyboardEvent) => {
      const code = evt.keyCode || evt.which;
      this._keys.delete(code);
    };

    (this as any)._onKeyDown = onKeyDown;
    (this as any)._onKeyUp = onKeyUp;

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  detachControl(): void {
    const onKeyDown = (this as any)._onKeyDown;
    const onKeyUp = (this as any)._onKeyUp;
    if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
    if (onKeyUp) window.removeEventListener('keyup', onKeyUp);
    this._keys.clear();
  }

  private rotateVec(q: Quaternion, v: Vector3, out: Vector3): Vector3 {
    // Quaternion-vector rotation without building a matrix
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const vx = v.x, vy = v.y, vz = v.z;
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    out.x = vx + qw * tx + (qy * tz - qz * ty);
    out.y = vy + qw * ty + (qz * tx - qx * tz);
    out.z = vz + qw * tz + (qx * ty - qy * tx);
    return out;
  }

  private refreshBasis(orientation: Quaternion) {
    // Derive an orthonormal basis from the current orientation using all three canonical axes
    this.rotateVec(orientation, Vector3.Forward(), this._tmpForward);
    this.rotateVec(orientation, Vector3.Right(), this._tmpRight);
    this.rotateVec(orientation, Vector3.Up(), this._tmpUp);

    let f = this._tmpForward.lengthSquared() > 1e-6 ? this._tmpForward.normalize() : Vector3.Forward();
    let r = this._tmpRight.lengthSquared() > 1e-6 ? this._tmpRight.normalize() : Vector3.Right();
    let u = this._tmpUp.lengthSquared() > 1e-6 ? this._tmpUp.normalize() : Vector3.Up();

    // Gram-Schmidt to keep axes orthonormal while preserving handedness
    const dotFR = Vector3.Dot(f, r);
    if (Math.abs(dotFR) > 1e-6) {
      r = r.subtract(f.scale(dotFR)).normalize();
    }
    const dotFU = Vector3.Dot(f, u);
    if (Math.abs(dotFU) > 1e-6) {
      u = u.subtract(f.scale(dotFU)).normalize();
    }
    const dotRU = Vector3.Dot(r, u);
    if (Math.abs(dotRU) > 1e-6) {
      u = u.subtract(r.scale(dotRU)).normalize();
    }

    return { forward: f, right: r, up: u };
  }

  checkInputs(): void {
    if (!this.camera) return;
    let yawLeft = false;
    let yawRight = false;
    let pitchUp = false;
    let pitchDown = false;
    let rollLeft = false;
    let rollRight = false;
    for (const k of this._keys) {
      if (this.keysLeft.includes(k)) yawLeft = true;
      if (this.keysRight.includes(k)) yawRight = true;
      if (this.keysUp.includes(k)) pitchUp = true;
      if (this.keysDown.includes(k)) pitchDown = true;
      if (this.keysRollLeft.includes(k)) rollLeft = true;
      if (this.keysRollRight.includes(k)) rollRight = true;
    }
    if (!yawLeft && !yawRight && !pitchUp && !pitchDown && !rollLeft && !rollRight) return;

    const step = this.rotationStep;
    if (!this.camera.rotationQuaternion) this.camera.rotationQuaternion = Quaternion.Identity();

    let orientation = this.camera.rotationQuaternion;
    let { forward, right, up: localUp } = this.refreshBasis(orientation);

    const yawDelta = (yawRight ? -step : 0) + (yawLeft ? step : 0);
    const pitchDelta = (pitchDown ? -step : 0) + (pitchUp ? step : 0);
    const rollDelta = (rollRight ? -step : 0) + (rollLeft ? step : 0);

    if (yawDelta !== 0) {
      Quaternion.RotationAxisToRef(localUp, yawDelta, this._tmpQuat);
      orientation = this._tmpQuat.multiply(orientation);
      orientation.normalize();
      ({ forward, right, up: localUp } = this.refreshBasis(orientation));
    }
    if (pitchDelta !== 0) {
      Quaternion.RotationAxisToRef(right, pitchDelta, this._tmpQuat);
      orientation = this._tmpQuat.multiply(orientation);
      orientation.normalize();
      ({ forward, right, up: localUp } = this.refreshBasis(orientation));
    }
    if (rollDelta !== 0) {
      Quaternion.RotationAxisToRef(forward, rollDelta, this._tmpQuat);
      orientation = this._tmpQuat.multiply(orientation);
      orientation.normalize();
      ({ up: localUp } = this.refreshBasis(orientation));
    }

    this.camera.rotationQuaternion = orientation;
    this.camera.upVector = localUp;
  }
}

class KeyboardMoveInput implements ICameraInput<BaseCam> {
  camera!: BaseCam;
  private keysForward = [87]; // W
  private keysBack = [83]; // S
  private keysLeft = [65]; // A
  private keysRight = [68]; // D
  private keysUp = [81]; // Q
  private keysDown = [69]; // E
  private _keys = new Set<number>();
  private _lastTime = performance.now();
  private _tmpForward: Vector3 = new Vector3();
  private _tmpRight: Vector3 = new Vector3();
  private _tmpUp: Vector3 = new Vector3();
  private _tmpMat: Matrix = Matrix.Identity();
  private _move: Vector3 = new Vector3();

  private rotateVec(q: Quaternion, v: Vector3, out: Vector3): Vector3 {
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const vx = v.x, vy = v.y, vz = v.z;
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    out.x = vx + qw * tx + (qy * tz - qz * ty);
    out.y = vy + qw * ty + (qz * tx - qx * tz);
    out.z = vz + qw * tz + (qx * ty - qy * tx);
    return out;
  }

  getClassName(): string {
    return 'KeyboardMoveInput';
  }
  getSimpleName(): string {
    return 'keyboardMove';
  }

  attachControl(noPreventDefault?: boolean): void {
    const onKeyDown = (evt: KeyboardEvent) => {
      const code = evt.keyCode || evt.which;
      if (
        this.keysForward.includes(code) ||
        this.keysBack.includes(code) ||
        this.keysLeft.includes(code) ||
        this.keysRight.includes(code) ||
        this.keysUp.includes(code) ||
        this.keysDown.includes(code)
      ) {
        this._keys.add(code);
        if (!noPreventDefault) evt.preventDefault();
      }
    };
    const onKeyUp = (evt: KeyboardEvent) => {
      const code = evt.keyCode || evt.which;
      this._keys.delete(code);
    };
    (this as any)._onKeyDown = onKeyDown;
    (this as any)._onKeyUp = onKeyUp;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  detachControl(): void {
    const onKeyDown = (this as any)._onKeyDown;
    const onKeyUp = (this as any)._onKeyUp;
    if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
    if (onKeyUp) window.removeEventListener('keyup', onKeyUp);
    this._keys.clear();
  }

  checkInputs(): void {
    if (!this.camera) return;
    if (this._keys.size === 0) {
      this._lastTime = performance.now();
      return;
    }
    const now = performance.now();
    const dt = Math.min((now - this._lastTime) / 1000, 0.25);
    this._lastTime = now;

    const orient = this.camera.rotationQuaternion ?? Quaternion.Identity();
    // Camera-local basis directly from quaternion matrix
    Matrix.FromQuaternionToRef(orient, this._tmpMat);
    Vector3.TransformNormalToRef(Vector3.Forward(), this._tmpMat, this._tmpForward);
    Vector3.TransformNormalToRef(Vector3.Right(), this._tmpMat, this._tmpRight);
    Vector3.TransformNormalToRef(Vector3.Up(), this._tmpMat, this._tmpUp);
    const forward = this._tmpForward.normalize();
    const right = this._tmpRight.normalize();
    const up = this._tmpUp.normalize();

    this._move.set(0, 0, 0);
    const fDir = forward.scale(-1); // move "forward" along view direction
    this._keys.forEach((code) => {
      if (this.keysForward.includes(code)) this._move.addInPlace(fDir);
      if (this.keysBack.includes(code)) this._move.addInPlace(fDir.scale(-1));
      if (this.keysLeft.includes(code)) this._move.addInPlace(right.scale(-1));
      if (this.keysRight.includes(code)) this._move.addInPlace(right);
      if (this.keysUp.includes(code)) this._move.addInPlace(up);
      if (this.keysDown.includes(code)) this._move.addInPlace(up.scale(-1));
    });

    if (this._move.lengthSquared() === 0) return;
    this._move.normalize();
    const speed = this.camera.speed ?? 50;
    this.camera.position.addInPlace(this._move.scale(speed * dt));
    // Keep up vector aligned with orientation
    this.camera.upVector = up;
  }
}

// Helper to attach both inputs (movement + yaw/pitch/roll).
export function addDualHandSixDofKeyboardInputs(camera: Camera): void {
  camera.inputs.add(new KeyboardMoveInput());
  camera.inputs.add(new KeyboardYawPitchRollInput());
}

export { KeyboardMoveInput, KeyboardYawPitchRollInput };
