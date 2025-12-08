/**
 * main.ts - Mars 3D Tiles Viewer
 *
 * Main entry point for rendering Mars 3D Tiles in Babylon.js with planetary camera controls.
 * Features:
 * - UniversalCamera with keyboard + mouse controls
 * - Mars Ion Asset 3644333 rendering via native Cesium3DTileset
 * - Speed controls (1-9 keys), tile visibility toggle (0 key)
 * - Visual reference objects for spatial orientation
 */

import {
  Engine,
  Scene,
  UniversalCamera,
  Vector3
} from '@babylonjs/core';
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
    // Statue of Liberty, NYC
    defaultLatRad: (40.6892 * Math.PI) / 180,
    defaultLonRad: (-74.0445 * Math.PI) / 180,
    defaultAltitude: 1500,
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
  const planet: PlanetName = 'earth';
  const planetConfig = PLANET_CONFIGS[planet];

  function createScene(): Scene {
    const scene = new Scene(engine);

    // HANDEDNESS TEST: Try RIGHT-HANDED to match Cesium coordinate system
    scene.useRightHandedSystem = true;

    // Setup UniversalCamera
    const camera = new UniversalCamera('camera', new Vector3(0, 0, 0), scene);
    camera.attachControl(canvas, true);

    // CRITICAL: Match Cesium's default FOV (~60 degrees) for proper tile culling
    camera.fov = Math.PI / 3; // 60 degrees

    // Enable WASD controls
    camera.keysUp = [87]; // W
    camera.keysDown = [83]; // S
    camera.keysLeft = [65]; // A
    camera.keysRight = [68]; // D
    camera.keysUpward = [81]; // Q
    camera.keysDownward = [69]; // E

    // Enable mouse controls for navigation (was disabled in Mars branch)
    // (Leave keyboard controls active as well)

    camera.minZ = 0.1; // Near: 0.1m
    // Use a very far plane to avoid clipping/culling at the horizon (match Mars branch)
    camera.maxZ = 200000000; // 200,000 km

    // Set background color per planet
    const [r, g, b, a] = planetConfig.skyColor;
    scene.clearColor.set(r, g, b, a);

    return scene;
  }

  const scene = createScene();
  const camera = scene.activeCamera as UniversalCamera;

  // Keyboard event handler for camera speed and tile visibility controls
  function setupKeyboardControls(camera: UniversalCamera, scene: Scene) {
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

  // Look toward the ground point at the same lat/lon with 0 altitude
  const groundTargetCesium = CesiumCartesian3.fromRadians(lon, lat, 0, planetConfig.ellipsoid);
  const groundTarget = cesiumToBabylonVec3(groundTargetCesium);
  camera.setTarget(groundTarget);
  // Setup keyboard controls for camera speed and tile visibility
  setupKeyboardControls(camera, scene);

  // Start the render loop with integration updates
  engine.runRenderLoop(() => {
    // Set camera's up vector to point away from planet center (so down points toward planet)
    camera.upVector = camera.position.clone().normalize();
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
