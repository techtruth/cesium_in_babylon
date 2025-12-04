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
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import { SimpleIntegration } from './simpleIntegration';
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

    // CRITICAL: Near-Cesium frustum parameters for Google Tilesets
    // FIXED: Use same near plane as integration (0.1) for consistency
    camera.minZ = 0.1; // Near: 0.1m (matches simpleIntegration.ts)
    camera.maxZ = 200000000; // Far: 200,000km

    // Speed will be set after scene creation

    // Add lighting for 3D models
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
    light.intensity = 0.8;

    // Set lighter background color
    scene.clearColor.set(0.8, 0.9, 1.0, 1.0); // Light blue sky color

    return scene;
  }

  const scene = createScene();
  const camera = scene.activeCamera as UniversalCamera;

  // Create visual reference objects for spatial orientation
  function createReferenceObjects(scene: Scene) {
    const earthRadius = 6378137; // Earth equatorial radius in meters (WGS84)

    // Earth sphere (hidden wireframe)
    const earthSphere = MeshBuilder.CreateSphere(
      'earthSphere',
      { diameter: earthRadius * 2, segments: 64 },
      scene
    );
    earthSphere.position = Vector3.Zero();
    earthSphere.setEnabled(false);
    const earthMaterial = new StandardMaterial('earthMaterial', scene);
    earthMaterial.diffuseColor = new Color3(0.3, 0.5, 0.8);
    earthMaterial.emissiveColor = new Color3(0.1, 0.15, 0.2);
    earthMaterial.wireframe = true;
    earthSphere.material = earthMaterial;

    // Sky barrier (hidden)
    const skyBarrierRadius = earthRadius + 5000;
    const skyBarrier = MeshBuilder.CreateSphere(
      'skyBarrier',
      { diameter: skyBarrierRadius * 2, segments: 32 },
      scene
    );
    skyBarrier.position = Vector3.Zero();
    skyBarrier.setEnabled(false);
    const skyMaterial = new StandardMaterial('skyMaterial', scene);
    skyMaterial.diffuseColor = new Color3(0.8, 0.2, 0.2);
    skyMaterial.emissiveColor = new Color3(0.1, 0.05, 0.05);
    skyMaterial.wireframe = true;
    skyMaterial.alpha = 0.3;
    skyBarrier.material = skyMaterial;

    // Center reference sphere (green wireframe)
    const centerSphere = MeshBuilder.CreateSphere('centerSphere', { diameter: 100000 }, scene);
    centerSphere.position = Vector3.Zero();
    const centerMaterial = new StandardMaterial('centerMaterial', scene);
    centerMaterial.diffuseColor = new Color3(0, 1, 0);
    centerMaterial.emissiveColor = new Color3(0, 0.5, 0);
    centerMaterial.wireframe = true;
    centerMaterial.backFaceCulling = false;
    centerSphere.material = centerMaterial;

    // North pole marker (white box)
    const northPole = MeshBuilder.CreateBox('northPole', { size: 5000000 }, scene);
    northPole.position = new Vector3(0, 10000000, 0);
    const northMaterial = new StandardMaterial('northMaterial', scene);
    northMaterial.diffuseColor = new Color3(1, 1, 1);
    northMaterial.emissiveColor = new Color3(0.5, 0.5, 0.5);
    northPole.material = northMaterial;

    // South pole marker (blue box)
    const southPole = MeshBuilder.CreateBox('southPole', { size: 5000000 }, scene);
    southPole.position = new Vector3(0, -10000000, 0);
    const southMaterial = new StandardMaterial('southMaterial', scene);
    southMaterial.diffuseColor = new Color3(0, 0, 1);
    southMaterial.emissiveColor = new Color3(0, 0, 0.5);
    southPole.material = southMaterial;
  }

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
      } else if (key === 'm' || key === 'M') {
        // M key: Manually trigger Cesium's decreaseScreenSpaceError()
        integration.manuallyDecreaseSSE();
      }
    });
  }

  // Create the simple integration (Ion auth now handled internally)
  const integration = new SimpleIntegration(scene, camera, engine);

  // Switch back to Mars for now - it's a complete 3D tileset with terrain
  // Mars includes both terrain and surface features in 3D Tiles format
  await integration.loadCesiumIonAsset(3644333, 'Cesium Mars');
  // Mars terrain and features loaded

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
  // Create visual reference objects
  createReferenceObjects(scene);

  // Start the render loop with integration updates
  engine.runRenderLoop(() => {
    // Update the integration every frame (let Cesium manage LOD)
    integration.update();
    scene.render();
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
});
