// Starting main.ts execution

import './style.css'
import { Engine, Scene, FreeCamera, Vector3, HemisphericLight } from '@babylonjs/core'
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
            // Silent canvas resize
        }
    }
    
    // Set initial canvas size
    updateCanvasSize();
    
    // Canvas found, creating Babylon engine
    
    const engine = new Engine(canvas, true, {
        useLargeWorldRendering: true
    });

    function createScene(): Scene {
        const scene = new Scene(engine);
        
        // HANDEDNESS TEST: Try RIGHT-HANDED to match Cesium coordinate system
        scene.useRightHandedSystem = true;
        console.log(`🧭 COORDINATE SYSTEM: Babylon.js scene using RIGHT-HANDED coordinates (TEST)`);
        console.log(`🔍 HANDEDNESS VERIFICATION: scene.useRightHandedSystem = ${scene.useRightHandedSystem}`);
        
        // Setup FreeCamera for 3D world viewing (Earth-scale coordinates)
        const camera = new FreeCamera("camera", Vector3.Zero(), scene);
        camera.attachControl(canvas, true);
        
        // CRITICAL: Match Cesium's exact FOV for proper tile culling
        camera.fov = Math.PI / 3; // 60 degrees - MUST match Cesium's PerspectiveFrustum.fov
        
        // Enable WASDQE controls
        camera.keysUp = [87]; // W
        camera.keysDown = [83]; // S
        camera.keysLeft = [65]; // A
        camera.keysRight = [68]; // D
        camera.keysUpward = [81]; // Q
        camera.keysDownward = [69]; // E
        
        // CRITICAL: Near-Cesium frustum parameters for Google Tilesets
        camera.minZ = 1000;           // Near: 1km (working commit configuration)
        camera.maxZ = 200000000;      // Far: 200,000km (working commit configuration)
        
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
    
    // Create the simple integration (Ion auth now handled internally)
    const integration = new SimpleIntegration(scene, camera, engine);
    
    try {
        // Loading 3D Tiles
        
        // Try loading Google Photorealistic 3D Tiles
        // Note: This requires a valid Cesium Ion access token with Google access
        try {
            
            // Google Photorealistic 3D Tiles asset ID from Cesium Ion
            await integration.loadGooglePhotorealistic3DTiles(2275207);
            // Google Photorealistic 3D Tiles loaded
            
            // Calculate proper NYC/Statue of Liberty coordinates using Cesium's WGS84 ellipsoid
            // Statue of Liberty: 40.6892° N, 74.0445° W
            const libertyLat = 40.6892 * Math.PI / 180;
            const libertyLon = -74.0445 * Math.PI / 180;
            const surfaceAltitude = 0; // Sea level
            const cameraAltitude = 15000; // 15km above surface - proper altitude to avoid zero distance issues with large tiles
            
            console.log('📐 COORDINATE SETUP:', {
                latDegrees: 40.6892,
                lonDegrees: -74.0445,
                latRadians: libertyLat,
                lonRadians: libertyLon,
                surfaceAltitude,
                cameraAltitude
            });
            
            // Use Cesium's proper ellipsoid calculations
            const { Cartesian3: CesiumCartesian3, Ellipsoid } = await import('cesium');
            
            // Silent coordinate transformation - logging removed to reduce console spam
            
            // Get ECEF positions using Cesium's WGS84 ellipsoid
            const nycSurfaceCesium = CesiumCartesian3.fromRadians(libertyLon, libertyLat, surfaceAltitude);
            const cameraPositionCesium = CesiumCartesian3.fromRadians(libertyLon, libertyLat, cameraAltitude);
            
            console.log('🗽 NYC COORDINATES DEBUG:');
            console.log(`   Lat/Lon: ${40.6892}°, ${-74.0445}° (${libertyLat.toFixed(6)}, ${libertyLon.toFixed(6)} radians)`);
            console.log(`   Original Cesium ECEF camera: (${cameraPositionCesium.x.toFixed(0)}, ${cameraPositionCesium.y.toFixed(0)}, ${cameraPositionCesium.z.toFixed(0)})`);
            console.log(`   → Babylon camera position: (${cameraPositionCesium.x.toFixed(0)}, ${cameraPositionCesium.z.toFixed(0)}, ${cameraPositionCesium.y.toFixed(0)})`);
            console.log(`   EXPECTATION: simpleIntegration should send back the original ECEF coordinates`);
            
            // Store for reference
            (window as any).originalNYCEcef = cameraPositionCesium;
            
            // ECEF → BABYLON: Coordinate system alignment transform (X, Y, Z) → (X, Z, -Y)
            // Aligns Cesium Earth-centered coordinates to Babylon view-centered coordinates
            const nycSurface = new Vector3(nycSurfaceCesium.x, nycSurfaceCesium.z, -nycSurfaceCesium.y);
            const cameraPosition = new Vector3(cameraPositionCesium.x, cameraPositionCesium.z, -cameraPositionCesium.y);
            
            // Coordinate system alignment: Cesium ECEF → Babylon view-centered
            console.log('📍 BABYLON CAMERA POSITIONING:', {
                nycSurfaceBabylon: { x: nycSurface.x, y: nycSurface.y, z: nycSurface.z },
                cameraPositionBabylon: { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z },
                distanceFromSurface: Vector3.Distance(cameraPosition, nycSurface),
                expectedDistance: cameraAltitude
            });
            
            // Store NYC surface coordinates for spacebar functionality
            const nycSurfaceForFrameState = nycSurfaceCesium;
            
            // Set camera position and look down at NYC surface
            camera.position = cameraPosition;
            camera.setTarget(nycSurface);
            
            // Camera positioned and targeted at NYC
            
            // Add keyboard controls for camera speed (1-9 keys) and mesh toggle (0 key)
            window.addEventListener('keydown', (event) => {
                const key = event.key;
                if (key >= '1' && key <= '9') {
                    const speedLevel = parseInt(key);
                    currentSpeedLevel = speedLevel;
                    camera.speed = cameraSpeedLevels[currentSpeedLevel];
                    // Camera speed changed
                } else if (key === '0') {
                    // Toggle all mesh visibility
                    let totalMeshes = 0;
                    let visibleMeshes = 0;
                    
                    scene.meshes.forEach(mesh => {
                        if (mesh.name !== 'camera' && mesh.name !== 'earthWGS84') {
                            totalMeshes++;
                            if (mesh.isEnabled()) visibleMeshes++;
                        }
                    });
                    
                    const shouldShowAll = visibleMeshes < totalMeshes;
                    
                    scene.meshes.forEach(mesh => {
                        if (mesh.name !== 'camera' && mesh.name !== 'earthWGS84') {
                            mesh.setEnabled(shouldShowAll);
                        }
                    });
                    
                    console.log(`🔄 MESH TOGGLE: ${shouldShowAll ? 'SHOWING' : 'HIDING'} all ${totalMeshes} tile meshes`);
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
            
            // SKY BARRIER: 5000m above Earth surface for camera boundary detection
            const skyBarrierRadius = earthRadiusEquatorial + 5000; // 5000m above equatorial radius
            const skyBarrier = MeshBuilder.CreateSphere("skyBarrier", {
                diameter: skyBarrierRadius * 2,
                segments: 32  // Lower resolution for performance
            }, scene);
            skyBarrier.position = Vector3.Zero();
            skyBarrier.setEnabled(false); // Hide by default
            
            const skyMaterial = new StandardMaterial("skyMaterial", scene);
            skyMaterial.diffuseColor = new Color3(0.8, 0.2, 0.2); // Red tint for visibility
            skyMaterial.emissiveColor = new Color3(0.1, 0.05, 0.05); // Subtle red glow
            skyMaterial.wireframe = true;
            skyMaterial.alpha = 0.3; // Semi-transparent
            skyBarrier.material = skyMaterial;
            
            // Silent sky barrier creation
            
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
            console.error("Failed to load Google Photorealistic 3D Tiles:", error);
            throw error; // Let the outer catch handle it
        }
        
    } catch (error) {
        console.error("Error during initialization:", error);
    }

    // Keyboard controls are set up inside the initialization block

    // Add picking functionality for 3D tiles - RIGHT CLICK ONLY
    scene.onPointerObservable.add((pointerInfo) => {
        if (pointerInfo.pickInfo?.hit && pointerInfo.type === 1 && pointerInfo.event?.button === 2) { // RIGHT CLICK POINTERDOWN
            const pickedMesh = pointerInfo.pickInfo.pickedMesh;
            const pickedPoint = pointerInfo.pickInfo.pickedPoint;
            
            if (pickedMesh && pickedPoint) {
                console.log(`🎯 RIGHT-CLICKED 3D Tile mesh: ${pickedMesh.name}`);
                console.log(`   Picked point:`, pickedPoint);
                console.log(`   Mesh position:`, pickedMesh.position);
                console.log(`   Mesh bounds:`, pickedMesh.getBoundingInfo());
                
                // DEBUG: Find and analyze the corresponding tile
                // integration.analyzePickedTile(pickedMesh); // Method not implemented yet
                
                // Show stats when right-clicking
                const stats = integration.getStats();
                console.log("   3D Tiles Stats:", stats);
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

    // Handle window resize and dev console open/close
    const handleResize = () => {
        updateCanvasSize();  // Update canvas dimensions first
        engine.resize();     // Then resize the engine
        
        // Handle frustum update and visualization recreation
        if (integration) {
            integration.handleCanvasResize();
        }
    };
    
    window.addEventListener("resize", handleResize);
    
    // Add right-click mesh deletion functionality
    canvas.addEventListener('contextmenu', (event) => {
        event.preventDefault(); // Prevent context menu
        
        const pickResult = scene.pick(event.clientX, event.clientY);
        if (pickResult && pickResult.pickedMesh) {
            const mesh = pickResult.pickedMesh;
            console.log(`🗑️ DELETING MESH: ${mesh.name || 'unnamed'} at position ${mesh.position.toString()}`);
            
            // Dispose the mesh and its materials/textures
            if (mesh.material) {
                mesh.material.dispose();
            }
            mesh.dispose();
        } else {
            console.log('🔍 RIGHT-CLICK: No mesh found at cursor position');
        }
    });

    // Watch for canvas size changes (dev console open/close, responsive design)
    const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            if (entry.target === canvas) {
                // Silent canvas resize
                handleResize();
            } else if (entry.target === document.body) {
                // Silent viewport resize
                // Delay slightly to let the canvas update
                setTimeout(() => {
                    handleResize();
                }, 10);
            }
        }
    });
    
    resizeObserver.observe(canvas);
    
    // Also observe the document body for viewport changes (dev console open/close)
    resizeObserver.observe(document.body);
    
    // Integration ready - debug utilities available on window.integration
    (window as any).integration = integration;
});