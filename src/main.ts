// Starting main.ts execution

import './style.css'
import { Engine, Scene, FreeCamera, Vector3, HemisphericLight } from '@babylonjs/core'
import { CesiumIonAuth } from './cesiumIonAuth'
import { SimpleIntegration } from './simpleIntegration'

window.addEventListener('DOMContentLoaded', async () => {
    // DOM loaded, starting app initialization
    
    
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }
    
    // CRITICAL: Set canvas resolution to match display size for correct WebGL context
    function updateCanvasSize() {
        const displayWidth = canvas.clientWidth;
        const displayHeight = canvas.clientHeight;
        
        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
            console.log(`📺 Canvas resized to: ${displayWidth}x${displayHeight}`);
        }
    }
    
    // Set initial canvas size
    updateCanvasSize();
    
    // Canvas found, creating Babylon engine
    
    const engine = new Engine(canvas, true);

    function createScene(): Scene {
        const scene = new Scene(engine);
        
        // COORDINATE SYSTEM: Try LEFT-HANDED to see if this fixes East/West flip
        scene.useRightHandedSystem = false;
        console.log(`🧭 COORDINATE SYSTEM: Babylon.js scene configured for LEFT-HANDED coordinates (testing East/West fix)`);
        
        // Setup FreeCamera for 3D world viewing (Earth-scale coordinates)
        const camera = new FreeCamera("camera", Vector3.Zero(), scene);
        camera.attachControl(canvas, true);
        
        // CRITICAL: Match Cesium's exact FOV and settings for proper tile culling
        camera.fov = Math.PI / 3; // 60 degrees - MUST match Cesium's PerspectiveFrustum.fov
        camera.minZ = 1.0;        // MUST match Cesium's PerspectiveFrustum.near
        camera.maxZ = 500000000;  // MUST match Cesium's PerspectiveFrustum.far
        
        // Enable WASDQE controls
        camera.keysUp = [87]; // W
        camera.keysDown = [83]; // S
        camera.keysLeft = [65]; // A
        camera.keysRight = [68]; // D
        camera.keysUpward = [81]; // Q
        camera.keysDownward = [69]; // E
        
        // CRITICAL: Set camera clipping planes for massive distances
        camera.minZ = 1000;           // Near clipping plane - 1km
        camera.maxZ = 200000000;      // Far clipping plane - 200,000km (much larger!)
        
        // Make camera movement faster for large scale
        // Mouse wheel sensitivity for zooming
        camera.inertia = 0.7;
        camera.angularSensibility = 1000;
        
        // Speed will be set after scene creation
        
        // Add lighting for 3D models
        const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
        light.intensity = 0.8;
        
        // Set lighter background color
        scene.clearColor.set(0.8, 0.9, 1.0, 1.0); // Light blue sky color
        
        return scene;
    }

    const scene = createScene();
    const camera = scene.activeCamera as FreeCamera;
    
    // Speed settings for different levels (1-9 keys) - moved to outer scope
    const cameraSpeedLevels = [
        0,           // Index 0 (unused)
        5,           // 1: Street level jogging
        50,          // 2: Fast walking/cycling
        200,         // 3: Car speed
        1000,        // 4: Highway speed
        5000,        // 5: Fast vehicle
        25000,       // 6: Aircraft speed
        100000,      // 7: Fast aircraft
        500000,      // 8: Satellite speed
        2000000      // 9: Earth fly-by speeds
    ];
    
    // Set default speed (level 5)
    let currentSpeedLevel = 5;
    camera.speed = cameraSpeedLevels[currentSpeedLevel];
    // Camera speed initialized
    
    // Initialize Cesium Ion authentication
    const ionAuth = new CesiumIonAuth();
    
    // Create the simple integration
    const integration = new SimpleIntegration(scene, camera, engine, ionAuth);
    
    try {
        // Initializing Cesium Ion authentication
        
        // Test authentication first
        const authTest = await ionAuth.testAuthentication();
        if (!authTest) {
            console.warn("Cesium Ion authentication may not be working properly");
        }
        
        // Loading 3D Tiles
        
        // Try loading Google Photorealistic 3D Tiles
        // Note: This requires a valid Cesium Ion access token with Google access
        try {
            
            await integration.loadGooglePhotorealistic3DTiles();
            // Google Photorealistic 3D Tiles loaded
            
            // Calculate proper NYC/Statue of Liberty coordinates using Cesium's WGS84 ellipsoid
            // Statue of Liberty: 40.6892° N, 74.0445° W
            const libertyLat = 40.6892 * Math.PI / 180;
            const libertyLon = -74.0445 * Math.PI / 180;
            const surfaceAltitude = 0; // Sea level
            const cameraAltitude = 10000; // 10km above surface - good viewing distance for NYC
            
            // Use Cesium's proper ellipsoid calculations
            const { Cartesian3: CesiumCartesian3, Ellipsoid } = await import('cesium');
            
            // COORDINATE DEBUG: Comprehensive logging for coordinate transformation analysis
            console.log(`\n🔍 === COORDINATE TRANSFORMATION ANALYSIS ===`);
            console.log(`📍 INPUT: NYC/Liberty Island coordinates`);
            console.log(`   Longitude: ${(libertyLon * 180 / Math.PI).toFixed(6)}° (${libertyLon.toFixed(6)} radians)`);
            console.log(`   Latitude:  ${(libertyLat * 180 / Math.PI).toFixed(6)}° (${libertyLat.toFixed(6)} radians)`);
            console.log(`   Surface altitude: ${surfaceAltitude}m, Camera altitude: ${cameraAltitude}m`);
            
            // Get ECEF positions using Cesium's WGS84 ellipsoid
            const nycSurfaceCesium = CesiumCartesian3.fromRadians(libertyLon, libertyLat, surfaceAltitude);
            const cameraPositionCesium = CesiumCartesian3.fromRadians(libertyLon, libertyLat, cameraAltitude);
            
            console.log(`\n🌍 CESIUM ECEF COORDINATES (Z-up, right-handed):`);
            console.log(`   Surface ECEF:  (${nycSurfaceCesium.x.toFixed(1)}, ${nycSurfaceCesium.y.toFixed(1)}, ${nycSurfaceCesium.z.toFixed(1)})`);
            console.log(`   Camera ECEF:   (${cameraPositionCesium.x.toFixed(1)}, ${cameraPositionCesium.y.toFixed(1)}, ${cameraPositionCesium.z.toFixed(1)})`);
            
            // Verify ECEF coordinates are reasonable for NYC
            const magnitude = Math.sqrt(nycSurfaceCesium.x**2 + nycSurfaceCesium.y**2 + nycSurfaceCesium.z**2);
            console.log(`   ECEF magnitude: ${magnitude.toFixed(0)}m (Earth radius ~6,371,000m)`);
            
            // Convert back to lat/lon to verify calculation
            const verifyCartographic = Ellipsoid.WGS84.cartesianToCartographic(nycSurfaceCesium);
            console.log(`   VERIFICATION: lat=${(verifyCartographic.latitude * 180 / Math.PI).toFixed(6)}°, lon=${(verifyCartographic.longitude * 180 / Math.PI).toFixed(6)}°`);
            
            // COORDINATE TRANSFORMATION: Cesium ECEF (Z-up) → Babylon (Y-up, right-handed)
            // Transformation: (cesium_x, cesium_y, cesium_z) → (babylon_x, babylon_y, babylon_z)
            //                 (X,        Y,        Z)        → (X,        Z,        Y)
            const nycSurface = new Vector3(nycSurfaceCesium.x, nycSurfaceCesium.z, nycSurfaceCesium.y);
            const cameraPosition = new Vector3(cameraPositionCesium.x, cameraPositionCesium.z, cameraPositionCesium.y);
            
            console.log(`\n🔄 BABYLON COORDINATES (Y-up, right-handed):`);
            console.log(`   Surface:  (${nycSurface.x.toFixed(1)}, ${nycSurface.y.toFixed(1)}, ${nycSurface.z.toFixed(1)})`);
            console.log(`   Camera:   (${cameraPosition.x.toFixed(1)}, ${cameraPosition.y.toFixed(1)}, ${cameraPosition.z.toFixed(1)})`);
            console.log(`   Transform rule: Cesium(X,Y,Z) → Babylon(X,Z,Y)`);
            console.log(`🔍 === END COORDINATE ANALYSIS ===\n`);
            
            // Store NYC surface coordinates for spacebar functionality
            const nycSurfaceForFrameState = nycSurfaceCesium;
            console.log(`NYC marker position: (${nycSurfaceForFrameState.x.toFixed(0)}, ${nycSurfaceForFrameState.y.toFixed(0)}, ${nycSurfaceForFrameState.z.toFixed(0)})`);
            
            // Set camera position and look down at NYC surface
            camera.position = cameraPosition;
            camera.setTarget(nycSurface);
            
            // Add keyboard controls for camera speed (1-9 keys)
            window.addEventListener('keydown', (event) => {
                const key = event.key;
                if (key >= '1' && key <= '9') {
                    const speedLevel = parseInt(key);
                    currentSpeedLevel = speedLevel;
                    camera.speed = cameraSpeedLevels[currentSpeedLevel];
                    // Camera speed changed
                }
            });
            
            // Camera positioned over NYC
            
            // Add visual reference objects to understand coordinate system
            const { MeshBuilder, StandardMaterial, Color3 } = await import('@babylonjs/core');
            
            // Create actual Earth ellipsoid using WGS84 dimensions
            const earthRadiusEquatorial = 6378137; // WGS84 equatorial radius in meters
            const earthRadiusPolar = 6356752.314245; // WGS84 polar radius in meters
            
            // Creating WGS84 Earth ellipsoid
            
            // Create proper ellipsoid (oblate spheroid) using Babylon's CreateSphere with different X/Z vs Y scaling
            const earthEllipsoid = MeshBuilder.CreateSphere("earthWGS84", {
                diameterX: earthRadiusEquatorial * 2,  // Equatorial diameter (X-axis)
                diameterY: earthRadiusPolar * 2,       // Polar diameter (Y-axis) 
                diameterZ: earthRadiusEquatorial * 2,  // Equatorial diameter (Z-axis)
                segments: 64  // Higher resolution for better ellipsoid approximation
            }, scene);
            earthEllipsoid.position = Vector3.Zero();
            earthEllipsoid.setEnabled(false); // Hide the Earth ellipsoid
            
            const earthMaterial = new StandardMaterial("earthMaterial", scene);
            earthMaterial.diffuseColor = new Color3(0.2, 0.4, 0.8); // Earth blue
            earthMaterial.emissiveColor = new Color3(0.05, 0.1, 0.2); // Slight glow
            earthMaterial.wireframe = true; // Show as wireframe so we can see through it
            earthEllipsoid.material = earthMaterial;
            
            // NYC marker removed for cleaner debugging view
            
            // Green wireframe sphere at Earth center for reference - make it bigger
            const centerSphere = MeshBuilder.CreateSphere("centerSphere", {diameter: 100000}, scene); // 100km sphere
            centerSphere.position = Vector3.Zero();
            const centerMaterial = new StandardMaterial("centerMaterial", scene);
            centerMaterial.diffuseColor = new Color3(0, 1, 0); // Bright green
            centerMaterial.emissiveColor = new Color3(0, 0.5, 0); // Green glow
            centerMaterial.wireframe = true; // WIREFRAME for consistency
            centerMaterial.backFaceCulling = false; // Show from all angles
            centerSphere.material = centerMaterial;
            
            // Massive boxes that should be impossible to miss
            const northPole = MeshBuilder.CreateBox("northPole", {size: 5000000}, scene); // 5000km box
            northPole.position = new Vector3(0, 10000000, 0); // 10M units up
            const northMaterial = new StandardMaterial("northMaterial", scene);
            northMaterial.diffuseColor = new Color3(1, 1, 1); // Bright white
            northMaterial.emissiveColor = new Color3(0.5, 0.5, 0.5); // Make it glow
            northPole.material = northMaterial;
            
            const southPole = MeshBuilder.CreateBox("southPole", {size: 5000000}, scene); // 5000km box  
            southPole.position = new Vector3(0, -10000000, 0); // 10M units down
            const southMaterial = new StandardMaterial("southMaterial", scene);
            southMaterial.diffuseColor = new Color3(0, 0, 1); // Bright blue
            southMaterial.emissiveColor = new Color3(0, 0, 0.5); // Make it glow
            southPole.material = southMaterial;
            
            // Reference objects created
            
        } catch (error) {
            console.warn("Failed to load Google 3D Tiles, trying OSM Buildings:", error);
            
            // Try OSM Buildings instead
            try {
                await integration.loadOSMBuildings3DTiles();
                // OSM Buildings 3D Tiles loaded
                
            } catch (osmError) {
                console.error("Failed to load OSM Buildings as well:", osmError);
                throw osmError; // Let the outer catch handle it
            }
        }
        
    } catch (error) {
        console.error("Error during initialization:", error);
    }

    // Keyboard controls are set up inside the initialization block

    // Add picking functionality for 3D tiles
    scene.onPointerObservable.add((pointerInfo) => {
        if (pointerInfo.pickInfo?.hit && pointerInfo.type === 1) { // POINTERDOWN
            const pickedMesh = pointerInfo.pickInfo.pickedMesh;
            const pickedPoint = pointerInfo.pickInfo.pickedPoint;
            
            if (pickedMesh && pickedPoint) {
                console.log(`Picked 3D Tile mesh: ${pickedMesh.name}`);
                console.log(`Picked point:`, pickedPoint);
                console.log(`Mesh position:`, pickedMesh.position);
                console.log(`Mesh bounds:`, pickedMesh.getBoundingInfo());
                
                // Show stats when clicking
                const stats = integration.getStats();
                console.log("3D Tiles Stats:", stats);
            } else {
                // Show all loaded meshes and their positions
                const allMeshes = scene.meshes.filter(m => m.name.includes('tile'));
                console.log(`Found ${allMeshes.length} tile meshes:`);
                allMeshes.forEach(mesh => {
                    console.log(`- ${mesh.name}: position=${mesh.position}, visible=${mesh.isEnabled()}`);
                });
            }
        }
    });

    // Start the render loop with integration updates
    engine.runRenderLoop(() => {
        // Update the integration every frame (let Cesium manage LOD)
        integration.update();
        
        scene.render();
    });

    // Handle window resize
    window.addEventListener("resize", () => {
        updateCanvasSize();  // Update canvas dimensions first
        engine.resize();     // Then resize the engine
    });
    
    // Integration ready - debug utilities available on window.integration and window.ionAuth
    (window as any).integration = integration;
    (window as any).ionAuth = ionAuth;
});