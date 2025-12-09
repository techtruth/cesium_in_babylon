/**
 * main.ts - Mars 3D Tiles Viewer
 *
 * Main entry point for rendering Mars 3D Tiles in Babylon.js with planetary camera controls.
 * Features:
 * - FreeCamera with keyboard + mouse controls
 * - Mars Ion Asset 3644333 rendering via native Cesium3DTileset
 * - Speed controls (1-9 keys), tile visibility toggle (0 key)
 * - Visual reference objects for spatial orientation
 */

import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  Quaternion,
  Matrix
} from '@babylonjs/core';
import type { ICameraInput } from '@babylonjs/core/Cameras/cameraInputsManager';
import { SimpleIntegration } from './SimpleIntegration';
import { Cartesian3 as CesiumCartesian3, Ellipsoid } from 'cesium';
import { cesiumToBabylonVec3 } from './coordUtils';

type PlanetName = 'earth' | 'mars' | 'moon';

type PlanetConfig = {
  ellipsoid: Ellipsoid;
  assetId: number;
  skyColor: [number, number, number, number];
  // Default camera target (radians) and altitude (meters) for this planet
  defaultLatRad: number;
  defaultLonRad: number;
  defaultAltitude: number;
};

const PLANET_CONFIGS: Record<PlanetName, PlanetConfig> = {
  earth: {
    ellipsoid: Ellipsoid.WGS84,
    assetId: 2275207,
    skyColor: [0.8, 0.9, 1.0, 1.0],
    // Times Square, Midtown Manhattan (dense urban coverage)
    defaultLatRad: (40.7580 * Math.PI) / 180,
    defaultLonRad: (-73.9855 * Math.PI) / 180,
    defaultAltitude: 1200,
  }, // Google Photorealistic 3D Tiles
  mars: {
    ellipsoid: new Ellipsoid(3396190.0, 3396190.0, 3376200.0),
    assetId: 3644333,
    skyColor: [0.85, 0.6, 0.45, 1.0],
    // Jezero Crater region (Perseverance rover area)
    defaultLatRad: (18.38 * Math.PI) / 180,
    defaultLonRad: (77.58 * Math.PI) / 180,
    defaultAltitude: 3000,
  }, // Mars asset
  moon: {
    ellipsoid: Ellipsoid.MOON,
    assetId: 2684829,
    skyColor: [0.6, 0.6, 0.65, 1.0],
    // Apollo 11 landing site
    defaultLatRad: (0.67408 * Math.PI) / 180,
    defaultLonRad: (23.47297 * Math.PI) / 180,
    defaultAltitude: 1500,
  }, // Moon photorealistic tileset
};

window.addEventListener('DOMContentLoaded', async () => {
  // DOM loaded, starting app initialization

  type BaseCam = FreeCamera;

  class KeyboardYawPitchInput implements ICameraInput<BaseCam> {
    camera!: BaseCam;
    private keysLeft = [74]; // J
    private keysRight = [76]; // L
    private keysUp = [73]; // I
    private keysDown = [75]; // K
    private keysRollLeft = [85]; // U
    private keysRollRight = [79]; // O
    private _keys = new Set<number>();
    public rotationStep = 0.005; // radians per frame while held (~0.29°)
    private _tmpQuat: Quaternion = Quaternion.Identity();
    private _tmpForward: Vector3 = new Vector3();
    private _tmpRight: Vector3 = new Vector3();
    private _tmpUp: Vector3 = new Vector3();

    getClassName(): string {
      return 'KeyboardYawPitchInput';
    }

    getSimpleName(): string {
      return 'keyboardYawPitch';
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

      // Store handlers for detach
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
      // t = 2 * cross(q.xyz, v)
      const tx = 2 * (qy * vz - qz * vy);
      const ty = 2 * (qz * vx - qx * vz);
      const tz = 2 * (qx * vy - qy * vx);
      // v' = v + qw * t + cross(q.xyz, t)
      out.x = vx + qw * tx + (qy * tz - qz * ty);
      out.y = vy + qw * ty + (qz * tx - qx * tz);
      out.z = vz + qw * tz + (qx * ty - qy * tx);
      return out;
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

      const refreshBasis = () => {
        // Derive an orthonormal basis from the current orientation
        this.rotateVec(orientation, Vector3.Forward(), this._tmpForward);
        this.rotateVec(orientation, Vector3.Right(), this._tmpRight);
        let f = this._tmpForward.lengthSquared() > 1e-6 ? this._tmpForward.normalize() : Vector3.Forward();
        let r = this._tmpRight.lengthSquared() > 1e-6 ? this._tmpRight.normalize() : Vector3.Right();
        Vector3.CrossToRef(r, f, this._tmpUp); // up = right x forward
        let u = this._tmpUp.lengthSquared() > 1e-6 ? this._tmpUp.normalize() : this.rotateVec(orientation, Vector3.Up(), this._tmpUp).normalize();
        return { forward: f, right: r, up: u };
      };

      let { forward, right, up: localUp } = refreshBasis();

      const yawDelta = (yawRight ? step : 0) + (yawLeft ? -step : 0);
      const pitchDelta = (pitchDown ? -step : 0) + (pitchUp ? step : 0);
      const rollDelta = (rollRight ? -step : 0) + (rollLeft ? step : 0);

      if (yawDelta !== 0) {
        Quaternion.RotationAxisToRef(localUp, yawDelta, this._tmpQuat);
        orientation = this._tmpQuat.multiply(orientation);
        orientation.normalize();
        ({ forward, right, up: localUp } = refreshBasis());
      }
      if (pitchDelta !== 0) {
        Quaternion.RotationAxisToRef(right, pitchDelta, this._tmpQuat);
        orientation = this._tmpQuat.multiply(orientation);
        orientation.normalize();
        ({ forward, right, up: localUp } = refreshBasis());
      }
      if (rollDelta !== 0) {
        Quaternion.RotationAxisToRef(forward, rollDelta, this._tmpQuat);
        orientation = this._tmpQuat.multiply(orientation);
        orientation.normalize();
        ({ forward, right, up: localUp } = refreshBasis());
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
      // Use camera-local basis: forward/right/up directly from quaternion
      this.rotateVec(orient, Vector3.Forward(), this._tmpForward);
      let forward = this._tmpForward.lengthSquared() > 1e-6 ? this._tmpForward.normalize() : Vector3.Forward();
      this.rotateVec(orient, Vector3.Right(), this._tmpRight);
      let right = this._tmpRight.lengthSquared() > 1e-6 ? this._tmpRight.normalize() : Vector3.Right();
      this.rotateVec(orient, Vector3.Up(), this._tmpRight);
      let up = this._tmpRight.lengthSquared() > 1e-6 ? this._tmpRight.normalize() : Vector3.Up();

      this._move.set(0, 0, 0);
      const fDir = forward.scale(-1);
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

  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element not found!');
    return;
  }

  const engine = new Engine(canvas, true, {
    useLargeWorldRendering: true,
  });

  // Keep render buffer in sync with device pixel ratio to match Cesium's expectations
  const handleResize = () => {
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const renderWidth = Math.floor(displayWidth * dpr);
    const renderHeight = Math.floor(displayHeight * dpr);
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      canvas.width = renderWidth;
      canvas.height = renderHeight;
    }
    engine.setSize(renderWidth, renderHeight, false);
  };
  handleResize();
  window.addEventListener('resize', handleResize);

  // Select target planet
  const planet: PlanetName = 'moon';
  const planetConfig = PLANET_CONFIGS[planet];

  function createScene(): Scene {
    const scene = new Scene(engine);

    // HANDEDNESS TEST: Try RIGHT-HANDED to match Cesium coordinate system
    scene.useRightHandedSystem = true;

    // Setup FreeCamera with only custom inputs (no pointer grab)
    const camera = new FreeCamera('camera', new Vector3(0, 0, 0), scene) as BaseCam;
    camera.inputs.clear();
    camera.inputs.add(new KeyboardMoveInput());
    camera.attachControl(canvas, true);
    // Allow mouse rotation to feel more like an FPS look camera
    camera.inertia = 0.7; // reduce damping for snappier response
    const pointerInput = (camera.inputs as any)?.attached?.pointers;
    if (pointerInput) {
      pointerInput.angularSensibilityX = 1200; // lower = faster
      pointerInput.angularSensibilityY = 1200;
      pointerInput.buttons = [0, 2]; // left/right rotate, keep middle for panning if needed
    }
    // Allow camera roll if supported by this Babylon version
    (camera as any).allowUpsideDown = true;

    // Add Babylon-style keyboard rotation input (IJKL)
    camera.inputs.add(new KeyboardYawPitchInput());

    // CRITICAL: Match Cesium's default FOV (~60 degrees) for proper tile culling
    camera.fov = Math.PI / 3; // 60 degrees

    camera.minZ = 0.1; // Near: 0.1m
    // Use a very far plane to avoid clipping/culling at the horizon (match Mars branch)
    camera.maxZ = 200000000; // 200,000 km

    // Set background color per planet
    const [r, g, b, a] = planetConfig.skyColor;
    scene.clearColor.set(r, g, b, a);

    return scene;
  }

  const scene = createScene();
  const camera = scene.activeCamera as BaseCam;

  // Keyboard event handler for camera speed and tile visibility controls
  function setupKeyboardControls(camera: BaseCam, scene: Scene) {
    const cameraSpeedLevels = [0, 5, 50, 200, 1000, 5000, 25000, 100000, 500000, 2000000];
    let currentSpeedLevel = 5;
    camera.speed = cameraSpeedLevels[currentSpeedLevel];

    window.addEventListener('keydown', (event) => {
      const key = event.key;
      if (key >= '1' && key <= '9') {
        const speedLevel = parseInt(key);
        currentSpeedLevel = speedLevel;
        camera.speed = cameraSpeedLevels[currentSpeedLevel];
      } else if (key === '0') {
        // Toggle all tile mesh visibility
      const tileMeshes = scene.meshes.filter(
        (m) => m.name !== 'camera' && m.name !== 'earthSphere'
      );
      const anyVisible = tileMeshes.some((m) => m.isEnabled());
      tileMeshes.forEach((m) => m.setEnabled(!anyVisible));
      }
    });
  }

  // Create the simple integration (Ion auth now handled internally)
  const integration = new SimpleIntegration(scene, camera, engine, planetConfig.ellipsoid);

  // Photorealistic tileset for chosen planet
  await integration.loadCesiumIonAsset(planetConfig.assetId, 'Photorealistic 3D Tiles');

  // Initial view: planet-configured default
  const lat = planetConfig.defaultLatRad;
  const lon = planetConfig.defaultLonRad;
  const cameraAltitude = planetConfig.defaultAltitude;

  // Get positions using selected ellipsoid
  const cameraPositionCesium = CesiumCartesian3.fromRadians(
    lon,
    lat,
    cameraAltitude,
    planetConfig.ellipsoid
  );
  // Transform coordinates: Cesium ECEF to Babylon
  const cameraPosition = cesiumToBabylonVec3(cameraPositionCesium);
  // Set camera position directly
  camera.position = cameraPosition;
  // Align up once to point away from the planet center without fighting mouse yaw each frame
  camera.upVector = camera.position.clone().normalize();

  // Look toward the ground point at the same lat/lon with 0 altitude (without setTarget)
  const groundTargetCesium = CesiumCartesian3.fromRadians(lon, lat, 0, planetConfig.ellipsoid);
  const groundTarget = cesiumToBabylonVec3(groundTargetCesium);
  const initialForward = groundTarget.subtract(camera.position).normalize();
  let initialRight = Vector3.Cross(camera.upVector, initialForward);
  if (initialRight.lengthSquared() < 1e-6) {
    // If forward is parallel to up, pick an arbitrary perpendicular
    initialRight = Vector3.Cross(camera.upVector, Vector3.Up());
    if (initialRight.lengthSquared() < 1e-6) {
      initialRight = Vector3.Cross(camera.upVector, Vector3.Right());
    }
  }
  initialRight.normalize();
  const initialOrthoForward = Vector3.Cross(initialRight, camera.upVector).normalize();
  const initMatrix = Matrix.Identity();
  Matrix.FromXYZAxesToRef(initialRight, camera.upVector, initialOrthoForward, initMatrix);
  camera.rotationQuaternion = Quaternion.FromRotationMatrix(initMatrix);
  // Setup keyboard controls for camera speed and tile visibility
  setupKeyboardControls(camera, scene);

  // Start the render loop with integration updates
  engine.runRenderLoop(() => {
    // Keep down toward planet center (disabled to avoid fighting mouse rotation)
    // camera.upVector = camera.position.clone().normalize();
    // Log render buffer size occasionally for debugging viewport coverage
    const fc = (integration as any).frameCount ?? 0;
    if (fc % 300 === 0) {
      console.log(
        `[Babylon] renderSize=${engine.getRenderWidth()}x${engine.getRenderHeight()} client=${canvas.clientWidth}x${canvas.clientHeight}`
      );
    }
    // Update the integration every frame (let Cesium work)
    integration.update();
    scene.render();
  });
});
