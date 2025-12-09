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

import { Engine, Scene, FreeCamera, Vector3, Quaternion, Matrix } from '@babylonjs/core';
import { SimpleIntegration } from './SimpleIntegration';
import { Cartesian3 as CesiumCartesian3, Ellipsoid } from 'cesium';
import { cesiumToBabylonVec3 } from './coordUtils';
import { addDualHandSixDofKeyboardInputs } from './inputs/DualHandSixDofKeyboard';

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

  type BaseCam = FreeCamera;

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
    // Distance-aware speed scaling so angular travel time stays similar at any altitude
    const baseDistanceForSpeed = planetConfig.ellipsoid.maximumRadius; // reference radius for "surface" speed
    addDualHandSixDofKeyboardInputs(camera, (cam, baseSpeed) => {
      const dist = cam.position.length(); // distance from center
      const alt = Math.max(dist - baseDistanceForSpeed, 0); // altitude above surface
      // Aggressive linear growth using golden ratio multiplier per km
      const altKm = alt / 1000;
      const phi = (1 + Math.sqrt(5)) / 2;
      // Boost near-surface with linear term, still ramps quadratically at altitude
      const linear = 5 * altKm;
      const quad = 5 * altKm * altKm;
      const scale = Math.min(1 + linear + quad, 5000);
      return baseSpeed * scale;
    }, baseDistanceForSpeed);
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
    // Exponential speed curve (doubling per level) to avoid hard-coded speed steps
    const baseSpeed = 2.7778; // ~10 km/h in m/s
    let speedPower = 0; // 0 => baseSpeed
    const applySpeed = () => {
      camera.speed = baseSpeed * Math.pow(2, speedPower);
    };
    applySpeed();

    window.addEventListener('keydown', (event) => {
      const key = event.key;
      if (key >= '1' && key <= '9') {
        // map 1..9 to powers -4..4 (centered on 5 = base speed)
        speedPower = parseInt(key) - 5;
        applySpeed();
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
