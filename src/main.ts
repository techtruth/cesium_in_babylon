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
    private _keys = new Set<number>();
    public rotationStep = 0.0025; // radians per frame while held (~0.14°)

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

    checkInputs(): void {
      if (!this.camera) return;
      const step = this.rotationStep;
      const yawLeft = Array.from(this._keys).some((k) => this.keysLeft.includes(k));
      const yawRight = Array.from(this._keys).some((k) => this.keysRight.includes(k));
      const pitchUp = Array.from(this._keys).some((k) => this.keysUp.includes(k));
      const pitchDown = Array.from(this._keys).some((k) => this.keysDown.includes(k));
      if (!yawLeft && !yawRight && !pitchUp && !pitchDown) return;

      if (!this.camera.rotationQuaternion) {
        this.camera.rotationQuaternion = Quaternion.Identity();
      }

      const up = this.camera.position.clone().normalize();

      // Start from current orientation
      let orientation = this.camera.rotationQuaternion.clone();
      const orientMat = Matrix.Identity();
      Matrix.FromQuaternionToRef(orientation, orientMat);
      let forward = Vector3.TransformNormal(Vector3.Forward(), orientMat).normalize();
      if (forward.lengthSquared() < 1e-6) forward = Vector3.Forward();
      let right = Vector3.Cross(up, forward);
      if (right.lengthSquared() < 1e-6) {
        right = Vector3.TransformNormal(Vector3.Right(), orientMat).normalize();
      } else {
        right.normalize();
      }

      // Yaw around planetary up
      if (yawLeft || yawRight) {
        // Invert yaw so J looks left, L looks right
        const yawAngle = (yawRight ? -step : 0) + (yawLeft ? step : 0);
        const yawQ = Quaternion.RotationAxis(up, yawAngle);
        orientation = yawQ.multiply(orientation);
        Matrix.FromQuaternionToRef(orientation, orientMat);
        forward = Vector3.TransformNormal(Vector3.Forward(), orientMat).normalize();
        right = Vector3.Cross(up, forward).normalize();
      }

      // Pitch around camera right
      if (pitchUp || pitchDown) {
        // Invert pitch so I looks up, K looks down
        const pitchAngle = (pitchDown ? -step : 0) + (pitchUp ? step : 0);
        const pitchQ = Quaternion.RotationAxis(right, pitchAngle);
        orientation = pitchQ.multiply(orientation);
      }

      orientation.normalize();
      this.camera.rotationQuaternion = orientation;
      this.camera.upVector = up;
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

      const up = this.camera.upVector ? this.camera.upVector.clone().normalize() : Vector3.Up();
      let forward = this.camera.getDirection(Vector3.Forward()).normalize();
      if (forward.lengthSquared() < 1e-6) forward = Vector3.Forward();
      let right = Vector3.Cross(up, forward).normalize();
      if (right.lengthSquared() < 1e-6) right = Vector3.Right();

      const move = new Vector3(0, 0, 0);
      this._keys.forEach((code) => {
        if (this.keysForward.includes(code)) move.addInPlace(forward);
        if (this.keysBack.includes(code)) move.addInPlace(forward.scale(-1));
        if (this.keysLeft.includes(code)) move.addInPlace(right.scale(-1));
        if (this.keysRight.includes(code)) move.addInPlace(right);
        if (this.keysUp.includes(code)) move.addInPlace(up);
        if (this.keysDown.includes(code)) move.addInPlace(up.scale(-1));
      });

      if (move.lengthSquared() === 0) return;
      move.normalize();
      const speed = this.camera.speed ?? 50;
      // Invert forward/back to match view direction intuition
      const forwardDir = forward.scale(-1);
      const finalMove = new Vector3(0, 0, 0);
      this._keys.forEach((code) => {
        if (this.keysForward.includes(code)) finalMove.addInPlace(forwardDir);
        if (this.keysBack.includes(code)) finalMove.addInPlace(forwardDir.scale(-1));
        if (this.keysLeft.includes(code)) finalMove.addInPlace(right.scale(-1));
        if (this.keysRight.includes(code)) finalMove.addInPlace(right);
        if (this.keysUp.includes(code)) finalMove.addInPlace(up);
        if (this.keysDown.includes(code)) finalMove.addInPlace(up.scale(-1));
      });
      if (finalMove.lengthSquared() === 0) return;
      finalMove.normalize();
      this.camera.position.addInPlace(finalMove.scale(speed * dt));
      // Refresh up vector to stay radial after movement
      this.camera.upVector = this.camera.position.clone().normalize();
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
    camera.inputs.add(new KeyboardYawPitchInput());
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
