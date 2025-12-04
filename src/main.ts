// Starting main.ts execution

import './style.css'
import { Engine, Scene, UniversalCamera, Vector3, HemisphericLight, Matrix, Quaternion, PointerEventTypes } from '@babylonjs/core'
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
        
        // Setup UniversalCamera
        const camera = new UniversalCamera("camera", new Vector3(0, 0, 0), scene);
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
        camera.inputs.remove(camera.inputs.attached["mouse"]);
        
        // CRITICAL: Near-Cesium frustum parameters for Google Tilesets
        // FIXED: Use same near plane as integration (0.1) for consistency
        camera.minZ = 0.1;            // Near: 0.1m (matches simpleIntegration.ts)
        camera.maxZ = 200000000;      // Far: 200,000km
        
        // Speed will be set after scene creation
        
        // Add lighting for 3D models
        const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
        light.intensity = 0.8;
        
        // Set lighter background color
        scene.clearColor.set(0.8, 0.9, 1.0, 1.0); // Light blue sky color
        
        return scene;
    }

    const scene = createScene();
    const camera = scene.activeCamera as UniversalCamera;
    
    // Continuously maintain planetary upVector orientation
    scene.onBeforeRenderObservable.add(() => {
        // Camera position
        const p = camera.position;

        // Down = toward center (0,0,0)
        const down = p.clone().scale(-1).normalize();

        // Up = away from center (pure radial direction)
        const up = down.scale(-1);
        camera.upVector.copyFrom(up);
    });
    
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
        try {
            
            // Switch back to Mars for now - it's a complete 3D tileset with terrain
            // Mars includes both terrain and surface features in 3D Tiles format
            await integration.loadCesiumIonAsset(3644333, 'Cesium Mars');
            // Mars terrain and features loaded
            
            // Calculate coordinates for Mars viewing 
            // Use Mars coordinates - equator and prime meridian for good view
            const marsLat = 0.0 * Math.PI / 180; // Mars equator
            const marsLon = 0.0 * Math.PI / 180; // Mars prime meridian
            const surfaceAltitude = 0; // Mars surface level
            const cameraAltitude = 2000; // 2km above Mars surface
            
            // Coordinate setup logged silently to reduce console spam
            /*console.log('📐 COORDINATE SETUP:', {
                latDegrees: 0.0,
                lonDegrees: 0.0,
                latRadians: marsLat,
                lonRadians: marsLon,
                surfaceAltitude,
                cameraAltitude
            });*/
            
            // Use Cesium's proper ellipsoid calculations
            const { Cartesian3: CesiumCartesian3, Ellipsoid } = await import('cesium');
            
            // Silent coordinate transformation - logging removed to reduce console spam
            
            // Get positions using Mars ellipsoid
            const marsSurfaceCesium = CesiumCartesian3.fromRadians(marsLon, marsLat, surfaceAltitude, Ellipsoid.MARS);
            const cameraPositionCesium = CesiumCartesian3.fromRadians(marsLon, marsLat, cameraAltitude, Ellipsoid.MARS);
            
            // Mars coordinates debug logged silently to reduce console spam
            /*console.log('🔴 MARS COORDINATES DEBUG:');
            console.log(`   Lat/Lon: ${0.0}°, ${0.0}° (${marsLat.toFixed(6)}, ${marsLon.toFixed(6)} radians)`);
            console.log(`   Original Cesium ECEF camera: (${cameraPositionCesium.x.toFixed(0)}, ${cameraPositionCesium.y.toFixed(0)}, ${cameraPositionCesium.z.toFixed(0)})`);
            console.log(`   → Babylon camera position: (${cameraPositionCesium.x.toFixed(0)}, ${cameraPositionCesium.z.toFixed(0)}, ${cameraPositionCesium.y.toFixed(0)})`);
            console.log(`   EXPECTATION: simpleIntegration should send back the original ECEF coordinates`);*/
            
            // Store for reference
            (window as any).originalMarsEcef = cameraPositionCesium;
            
            // ECEF → BABYLON: Coordinate system alignment transform (X, Y, Z) → (X, Z, -Y)
            // Aligns Cesium Mars-centered coordinates to Babylon view-centered coordinates
            const marsSurface = new Vector3(marsSurfaceCesium.x, marsSurfaceCesium.z, -marsSurfaceCesium.y);
            const cameraPosition = new Vector3(cameraPositionCesium.x, cameraPositionCesium.z, -cameraPositionCesium.y);
            
            // Coordinate system alignment: Cesium ECEF → Babylon view-centered
            // Camera positioning logged silently to reduce console spam
            /*console.log('📍 BABYLON CAMERA POSITIONING:', {
                marsSurfaceBabylon: { x: marsSurface.x, y: marsSurface.y, z: marsSurface.z },
                cameraPositionBabylon: { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z },
                distanceFromSurface: Vector3.Distance(cameraPosition, marsSurface),
                expectedDistance: cameraAltitude
            });*/
            
            // Store Mars surface coordinates for spacebar functionality
            const marsSurfaceForFrameState = marsSurfaceCesium;
            
            // Set camera position directly
            camera.position = cameraPosition;
            
            // Camera position set - upVector will be handled by onBeforeRenderObservable
            
            console.log('✅ Camera positioned 2km above Mars, looking at surface');
            
            
            // Camera positioned with planetary gravity alignment
            
            // Add keyboard controls
            window.addEventListener('keydown', (event) => {
                const key = event.key;
                if (key >= '1' && key <= '9') {
                    const speedLevel = parseInt(key);
                    currentSpeedLevel = speedLevel;
                    camera.speed = cameraSpeedLevels[currentSpeedLevel];
                } else if (key === '0') {
                    // Toggle all mesh visibility
                    let totalMeshes = 0;
                    let visibleMeshes = 0;
                    
                    scene.meshes.forEach(mesh => {
                        if (mesh.name !== 'camera' && mesh.name !== 'earthSphere') {
                            totalMeshes++;
                            if (mesh.isEnabled()) visibleMeshes++;
                        }
                    });
                    
                    const shouldShowAll = visibleMeshes < totalMeshes;
                    
                    scene.meshes.forEach(mesh => {
                        if (mesh.name !== 'camera' && mesh.name !== 'earthSphere') {
                            mesh.setEnabled(shouldShowAll);
                        }
                    });
                    
                    console.log(`🔄 MESH TOGGLE: ${shouldShowAll ? 'SHOWING' : 'HIDING'} all ${totalMeshes} tile meshes`);
                } else if (key === ' ') {
                    // Spacebar: Step Cesium camera update
                    event.preventDefault(); // Prevent page scroll
                    integration.stepCameraUpdate();
                } else if (key === 'b' || key === 'B') {
                    // B key: Toggle bounding volume visibility
                    integration.toggleBoundingVolumes();
                } else if (key === 'f' || key === 'F') {
                    // F key: Toggle frustum wireframe visibility
                    integration.toggleFrustumWireframe();
                } else if (key === 'm' || key === 'M') {
                    // M key: Manually trigger Cesium's decreaseScreenSpaceError()
                    integration.manuallyDecreaseSSE();
                }
            });
            
            // Camera positioned over NYC
            
            // Add visual reference objects to understand coordinate system
            const { MeshBuilder, StandardMaterial, Color3 } = await import('@babylonjs/core');
            
            // Create Earth sphere using Earth dimensions
            const earthRadius = 6378137; // Earth equatorial radius in meters (WGS84)
            
            // Creating Earth sphere
            
            // Create sphere for the Earth (oblate spheroid approximated as sphere)
            const earthSphere = MeshBuilder.CreateSphere("earthSphere", {
                diameter: earthRadius * 2,  // Earth diameter
                segments: 64  // Higher resolution for better sphere approximation
            }, scene);
            earthSphere.position = Vector3.Zero();
            earthSphere.setEnabled(false); // Hide the Earth sphere
            
            const earthMaterial = new StandardMaterial("earthMaterial", scene);
            earthMaterial.diffuseColor = new Color3(0.3, 0.5, 0.8); // Earth blue/green
            earthMaterial.emissiveColor = new Color3(0.1, 0.15, 0.2); // Slight glow
            earthMaterial.wireframe = true; // Show as wireframe so we can see through it
            earthSphere.material = earthMaterial;
            
            // SKY BARRIER: 5000m above Earth surface for camera boundary detection
            const skyBarrierRadius = earthRadius + 5000; // 5000m above Earth surface
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
            
            // Earth marker removed for cleaner debugging view
            
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
            console.error("Failed to load OpenStreetMap Tileset:", error);
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