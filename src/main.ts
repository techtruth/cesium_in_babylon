/**
 * main.ts - Mars 3D Tiles Viewer
 *
 * Main entry point for rendering Mars 3D Tiles in Babylon.js with planetary camera controls.
 * Features:
 * - UniversalCamera with keyboard-only controls (mouse disabled)
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

  // Handle window resize and dev console open/close
  const handleResize = () => {
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    engine.resize(); // Then resize the engine
  };
  handleResize();
  window.addEventListener('resize', handleResize);

  function createScene(): Scene {
    const scene = new Scene(engine);

    // HANDEDNESS TEST: Try RIGHT-HANDED to match Cesium coordinate system
    scene.useRightHandedSystem = true;

    // Setup UniversalCamera
    const camera = new UniversalCamera('camera', new Vector3(0, 0, 0), scene);
    camera.attachControl(canvas, true);

    // CRITICAL: Match Cesium's exact FOV for proper tile culling
    camera.fov = Math.PI / 3; // 60 degrees - MUST match Cesium's PerspectiveFrustum.fov

    // Enable WASD controls
    camera.keysUp = [87]; // W
    camera.keysDown = [83]; // S
    camera.keysLeft = [65]; // A
    camera.keysRight = [68]; // D
    camera.keysUpward = [81]; // Q
    camera.keysDownward = [69]; // E

    // Disable mouse input
    camera.inputs.remove(camera.inputs.attached['mouse']);

    camera.minZ = 0.1; // Near: 0.1m
    camera.maxZ = 200000000; // Far: 200,000km

    // Set lighter background color
    scene.clearColor.set(0.8, 0.9, 1.0, 1.0); // Light blue sky color

    return scene;
  }

  const scene = createScene();
  const camera = scene.activeCamera as UniversalCamera;

  // Keyboard event handler for camera speed and tile visibility controls
  function setupKeyboardControls(camera: UniversalCamera, scene: Scene, integration: any) {
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
  const integration = new SimpleIntegration(scene, camera, engine);

  // Mars includes both terrain and surface features in 3D Tiles format
  await integration.loadCesiumIonAsset(3644333, 'Cesium Mars');

  // Calculate coordinates for Mars viewing
  // Use Mars coordinates - equator and prime meridian for good view
  const marsLat = (0.0 * Math.PI) / 180; // Mars equator
  const marsLon = (0.0 * Math.PI) / 180; // Mars prime meridian
  const cameraAltitude = 2000; // 2km above Mars surface

  // Get positions using Mars ellipsoid
  const cameraPositionCesium = CesiumCartesian3.fromRadians(
    marsLon,
    marsLat,
    cameraAltitude,
    Ellipsoid.MARS
  );
  // Transform coordinates: Cesium ECEF to Babylon
  const cameraPosition = new Vector3(
    cameraPositionCesium.x,
    cameraPositionCesium.z,
    -cameraPositionCesium.y
  );
  // Set camera position directly
  camera.position = cameraPosition;
  // Setup keyboard controls for camera speed and tile visibility
  setupKeyboardControls(camera, scene, integration);

  // Start the render loop with integration updates
  engine.runRenderLoop(() => {
    // Update the integration every frame (let Cesium work)
    integration.update();
    scene.render();
  });
});
