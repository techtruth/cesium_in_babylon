import { Scene as BabylonScene, Camera, Engine, MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import { Cartesian3, Cartesian2, Plane, PerspectiveFrustum, Ellipsoid, BoundingSphere, Matrix4, SceneMode, CullingVolume, Intersect, Occluder, Cartographic } from 'cesium';
import { CesiumIonAuth } from './cesiumIonAuth';
import MinimalTileset from './cesium_derived/MinimalTileset';
import { EllipsoidalOccluder } from './cesium_extracted/EllipsoidalOccluder_extracted';

/**
 * Simple Cesium + Babylon integration - just tile selection and rendering
 */
export class SimpleIntegration {
    private scene: BabylonScene;
    private camera: Camera;
    private engine: Engine;
    private ionAuth: CesiumIonAuth;
    private cesiumTileset?: MinimalTileset;
    private frameCount: number = 0;
    private debugSpheresEnabled: boolean = false; // Hidden by default
    private frustumVisible: boolean = false; // Hidden by default
    public staticFakeCamera: any; // Cache the static fake camera - only create once
    private staticCameraSphereCreated: boolean = false; // Track if camera sphere was created
    private currentMeshIndex: number = -1; // Track which mesh camera is looking at

    constructor(scene: BabylonScene, camera: Camera, engine: Engine, ionAuth?: CesiumIonAuth) {
        this.scene = scene;
        this.camera = camera;
        this.engine = engine;
        this.ionAuth = ionAuth || new CesiumIonAuth();
        
        // CRITICAL: Ensure Babylon camera matches Cesium frustum exactly
        this.syncCameraSettings();
        
        // Add keyboard handler for debug sphere toggle
        this.setupDebugControls();
        
        // SimpleIntegration initialized
    }

    /**
     * Setup debug controls for toggling wireframe spheres
     */
    private setupDebugControls(): void {
        window.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 'b') {
                this.debugSpheresEnabled = !this.debugSpheresEnabled;
                console.log(`🔘 Debug spheres ${this.debugSpheresEnabled ? 'ENABLED' : 'DISABLED'} (press 'b' to toggle)`);
                
                // Update all existing debug spheres
                this.toggleAllDebugSpheres();
            }
            
            if (event.key.toLowerCase() === 'f') {
                this.frustumVisible = !this.frustumVisible;
                console.log(`🔺 Frustum ${this.frustumVisible ? 'VISIBLE' : 'HIDDEN'} (press 'f' to toggle)`);
                this.toggleFrustumVisibility();
            }
            
            if (event.key === ' ') { // Spacebar
                event.preventDefault(); // Prevent page scroll
                console.log(`🎥 SPACEBAR PRESSED - Using REAL CAMERA MODE (no sync needed)`);
                console.log(`   Current position: (${this.camera.position.x.toFixed(0)}, ${this.camera.position.y.toFixed(0)}, ${this.camera.position.z.toFixed(0)})`);
                console.log(`   Tiles will update automatically based on camera movement!`);
            }
            
            if (event.key === '0') {
                this.toggleAllTileMeshes();
            }
            
            if (event.key === 'ArrowLeft') {
                this.cycleMeshTarget(-1); // Previous mesh
            }
            
            if (event.key === 'ArrowRight') {
                this.cycleMeshTarget(1); // Next mesh
            }
        });
        
        console.log(`🔘 Debug controls: 'b'=spheres, 'f'=frustum, SPACE=camera info, '0'=meshes, ←→=cycle camera`);
    }

    /**
     * CRITICAL: Make Babylon camera adopt Cesium's exact frustum parameters
     */
    private syncCameraSettings(): void {
        // CESIUM AUTHORITATIVE: Use Cesium's exact default parameters
        const cesiumFov = Math.PI / 3; // 60 degrees - Cesium's default
        const cesiumNear = 1.0; // 1 meter - Cesium's default
        const cesiumFar = 500000000.0; // 500M km - Cesium's Earth-scale default
        
        // Get current Babylon camera settings
        const babylonFov = this.camera.fov;
        const babylonNear = this.camera.minZ;
        const babylonFar = this.camera.maxZ;
        
        // FORCE Babylon to match Cesium exactly
        let changed = false;
        
        if (Math.abs(babylonFov - cesiumFov) > 0.001) {
            console.log(`🔄 ADOPTING CESIUM FOV: Babylon ${(babylonFov * 180 / Math.PI).toFixed(1)}° → ${(cesiumFov * 180 / Math.PI).toFixed(1)}°`);
            this.camera.fov = cesiumFov;
            changed = true;
        }
        
        if (babylonNear !== cesiumNear) {
            console.log(`🔄 ADOPTING CESIUM NEAR: Babylon ${babylonNear} → ${cesiumNear}`);
            this.camera.minZ = cesiumNear;
            changed = true;
        }
        
        if (babylonFar !== cesiumFar) {
            console.log(`🔄 ADOPTING CESIUM FAR: Babylon ${babylonFar/1000000}Mkm → ${cesiumFar/1000000}Mkm`);
            this.camera.maxZ = cesiumFar;
            changed = true;
        }
        
        // VIEWPORT DEBUG: Check for canvas vs engine size mismatch
        const engineWidth = this.engine.getRenderWidth();
        const engineHeight = this.engine.getRenderHeight();
        const canvasWidth = this.engine.getRenderingCanvas()?.width || 0;
        const canvasHeight = this.engine.getRenderingCanvas()?.height || 0;
        const canvasClientWidth = this.engine.getRenderingCanvas()?.clientWidth || 0;
        const canvasClientHeight = this.engine.getRenderingCanvas()?.clientHeight || 0;
        
        const aspect = engineWidth / engineHeight;
        if (changed) {
            console.log(`✅ BABYLON CAMERA SYNCHRONIZED TO CESIUM: FOV=${(cesiumFov * 180 / Math.PI).toFixed(1)}°, aspect=${aspect.toFixed(3)}, near=${cesiumNear}, far=${cesiumFar/1000000}Mkm`);
        } else {
            console.log(`✅ BABYLON CAMERA ALREADY MATCHES CESIUM: FOV=${(cesiumFov * 180 / Math.PI).toFixed(1)}°, aspect=${aspect.toFixed(3)}`);
        }
        
        console.log(`🖼️  VIEWPORT ANALYSIS:`);
        console.log(`   Engine render size: ${engineWidth}×${engineHeight}`);
        console.log(`   Canvas buffer size: ${canvasWidth}×${canvasHeight}`);
        console.log(`   Canvas client size: ${canvasClientWidth}×${canvasClientHeight}`);
        
        if (engineWidth !== canvasWidth || engineHeight !== canvasHeight) {
            console.log(`⚠️  ENGINE/CANVAS SIZE MISMATCH! This could cause edge coverage issues.`);
        }
    }

    /**
     * Toggle visibility of all debug spheres
     */
    private toggleAllDebugSpheres(): void {
        // Find all debug sphere meshes in the scene
        const debugSpheres = this.scene.meshes.filter(mesh => mesh.name.startsWith('debug_tile_'));
        
        // DEBUG: Check all spheres in scene and their materials
        console.log(`\n🔘 === DEBUG SPHERE ANALYSIS ===`);
        const allSpheres = this.scene.meshes.filter(mesh => 
            mesh.name.includes('Sphere') || mesh.name.includes('sphere') || mesh.name.startsWith('debug_'));
        
        console.log(`📊 Found ${allSpheres.length} total sphere-like objects in scene:`);
        
        let sphereCount = 0, boxCount = 0;
        for (const sphere of allSpheres) {
            const material = sphere.material as any;
            const wireframe = material?.wireframe || false;
            const materialType = material?.constructor.name || 'NO_MATERIAL';
            const color = material?.diffuseColor ? 
                `RGB(${material.diffuseColor.r.toFixed(2)}, ${material.diffuseColor.g.toFixed(2)}, ${material.diffuseColor.b.toFixed(2)})` : 
                'NO_COLOR';
            
            // Count bounding volume types by color
            if (sphere.name.startsWith('debug_tile_')) {
                if (color.includes('1.00, 0.00, 0.00')) sphereCount++; // Red = sphere
                if (color.includes('0.00, 1.00, 0.00')) boxCount++;   // Green = box
            }
            
            console.log(`   ${sphere.name}: wireframe=${wireframe}, material=${materialType}, color=${color}, enabled=${sphere.isEnabled()}`);
        }
        
        console.log(`🔍 BOUNDING VOLUME BREAKDOWN: ${sphereCount} sphere bounds (red), ${boxCount} box bounds (green)`);
        if (boxCount === 0) {
            console.log(`💡 All tiles use SPHERE bounding volumes - that's why you see no green boxes!`);
        }
        
        for (const sphere of debugSpheres) {
            sphere.setEnabled(this.debugSpheresEnabled);
        }
        
        if (debugSpheres.length > 0) {
            console.log(`🔘 Toggled ${debugSpheres.length} debug spheres to ${this.debugSpheresEnabled ? 'visible' : 'hidden'}`);
        }
        console.log(`🔘 === END ANALYSIS ===\n`);
    }

    /**
     * Toggle visibility of ALL meshes in the scene (bypass tile system)
     */
    private toggleAllTileMeshes(): void {
        const allMeshes = this.scene.meshes.filter(mesh => 
            // Skip debug spheres, camera spheres, and basic shapes
            !mesh.name.startsWith('debug_') && 
            !mesh.name.includes('camera') && 
            !mesh.name.includes('marker') &&
            !mesh.name.includes('ground') &&
            mesh.name !== 'sphere' &&
            mesh.name !== 'box'
        );
        
        if (allMeshes.length === 0) {
            // console.log(`🎲 NO TILE MESHES: Found 0 tile meshes to toggle`);
            return;
        }
        
        // Toggle visibility of first mesh to determine new state
        const newVisibility = !allMeshes[0].isVisible;
        
        let enabledCount = 0;
        let disabledCount = 0;
        
        for (const mesh of allMeshes) {
            mesh.isVisible = newVisibility;
            mesh.setEnabled(newVisibility);
            
            if (newVisibility) {
                enabledCount++;
            } else {
                disabledCount++;
            }
        }
        
        // console.log(`🎲 FORCE ${newVisibility ? 'VISIBLE' : 'HIDDEN'}: ${newVisibility ? 'Enabled' : 'Disabled'} ${newVisibility ? enabledCount : disabledCount} tile meshes`);
    }

    /**
     * Cycle camera target through all tile meshes
     */
    private cycleMeshTarget(direction: number): void {
        const tileMeshes = this.scene.meshes.filter(mesh => 
            // Skip debug spheres, camera spheres, and basic shapes
            !mesh.name.startsWith('debug_') && 
            !mesh.name.includes('camera') && 
            !mesh.name.includes('marker') &&
            !mesh.name.includes('ground') &&
            mesh.name !== 'sphere' &&
            mesh.name !== 'box'
        );
        
        if (tileMeshes.length === 0) {
            // console.log(`📷 NO MESHES: Found 0 tile meshes to target`);
            return;
        }
        
        // Update mesh index
        this.currentMeshIndex += direction;
        
        // Wrap around
        if (this.currentMeshIndex >= tileMeshes.length) {
            this.currentMeshIndex = 0;
        } else if (this.currentMeshIndex < 0) {
            this.currentMeshIndex = tileMeshes.length - 1;
        }
        
        const targetMesh = tileMeshes[this.currentMeshIndex];
        const meshPos = targetMesh.absolutePosition || targetMesh.position;
        
        // Set camera target to mesh position
        if ((this.camera as any).setTarget) {
            (this.camera as any).setTarget(meshPos);
        } else {
            // For other camera types, try alternative methods
            (this.camera as any).target = meshPos;
        }
        
        // console.log(`📷 CAMERA TARGET: Mesh ${this.currentMeshIndex + 1}/${tileMeshes.length} - "${targetMesh.name}"`);
        // console.log(`   Position: (${meshPos.x.toFixed(0)}, ${meshPos.y.toFixed(0)}, ${meshPos.z.toFixed(0)})`);
        // console.log(`   Distance from camera: ${this.scene.activeCamera?.position?.subtract(meshPos)?.length()?.toFixed(0) || 'unknown'}m`);
    }

    /**
     * Toggle frustum visualization visibility
     */
    private toggleFrustumVisibility(): void {
        const frustumMeshes = this.scene.meshes.filter(m => m.name.startsWith('debug_frustum'));
        
        for (const mesh of frustumMeshes) {
            mesh.setEnabled(this.frustumVisible);
        }
        
        if (frustumMeshes.length > 0) {
            // console.log(`🔺 ${frustumMeshes.length} frustum meshes ${this.frustumVisible ? 'shown' : 'hidden'}`);
        }
    }

    /**
     * Sync fake camera to real camera position and rotation
     */
    private syncFakeCameraToReal(): void {
        if (!this.staticFakeCamera) {
            console.log('⚠️ No fake camera to sync - fake camera not created yet. Try again after tiles start loading.');
            return;
        }

        // console.log('📷 BEFORE SYNC:');
        // console.log(`   Fake camera position: (${this.staticFakeCamera.cesiumPosition?.x.toFixed(0) || 'undefined'}, ${this.staticFakeCamera.cesiumPosition?.y.toFixed(0) || 'undefined'}, ${this.staticFakeCamera.cesiumPosition?.z.toFixed(0) || 'undefined'})`);
        // console.log(`   Real camera position: (${this.camera.position.x.toFixed(0)}, ${this.camera.position.y.toFixed(0)}, ${this.camera.position.z.toFixed(0)})`);

        // Get real camera position and rotation
        const realPos = this.camera.position;
        const realTarget = this.camera.getTarget();
        const realDirection = realTarget.subtract(realPos).normalize();
        const realUp = this.camera.upVector || Vector3.Up();
        const realRight = Vector3.Cross(realDirection, realUp).normalize();

        // Convert Babylon to Cesium coordinates (Y-up to Z-up)
        const cesiumPos = new Cartesian3(realPos.x, realPos.z, realPos.y);
        const cesiumDirection = new Cartesian3(realDirection.x, realDirection.z, realDirection.y);
        const cesiumUp = new Cartesian3(realUp.x, realUp.z, realUp.y);
        const cesiumRight = new Cartesian3(realRight.x, realRight.z, realRight.y);

        // Update basic fake camera properties
        this.staticFakeCamera.babylonPosition = realPos;
        this.staticFakeCamera.babylonDirection = realDirection;
        this.staticFakeCamera.babylonUp = realUp;
        this.staticFakeCamera.babylonRight = realRight;
        this.staticFakeCamera.cesiumPosition = cesiumPos;
        this.staticFakeCamera.cesiumDirection = cesiumDirection;
        this.staticFakeCamera.cesiumUp = cesiumUp;
        this.staticFakeCamera.cesiumRight = cesiumRight;

        // Update cartographic position
        this.staticFakeCamera.positionCartographic = Cartographic.fromCartesian(cesiumPos, Ellipsoid.WGS84);

        // If the fake camera has been converted to full Cesium camera, update those properties too
        if (this.staticFakeCamera.positionWC) {
            // Calculate movement distance for Cesium's movement detection
            const oldPos = this.staticFakeCamera.positionWC;
            const movementDistance = Math.sqrt(
                (cesiumPos.x - oldPos.x) ** 2 +
                (cesiumPos.y - oldPos.y) ** 2 +
                (cesiumPos.z - oldPos.z) ** 2
            );
            
            // Update position and vectors
            this.staticFakeCamera.positionWC = cesiumPos;
            this.staticFakeCamera.directionWC = cesiumDirection;
            this.staticFakeCamera.upWC = cesiumUp;
            this.staticFakeCamera.rightWC = cesiumRight;
            this.staticFakeCamera.position = cesiumPos;
            this.staticFakeCamera.direction = cesiumDirection;
            this.staticFakeCamera.up = cesiumUp;
            this.staticFakeCamera.right = cesiumRight;
            
            // CRITICAL: Update camera movement properties to trigger tile refinement
            this.staticFakeCamera.timeSinceMoved = 0.0; // Just moved
            this.staticFakeCamera.positionWCDeltaMagnitudeLastFrame = this.staticFakeCamera.positionWCDeltaMagnitude || 0.0;
            this.staticFakeCamera.positionWCDeltaMagnitude = Math.max(movementDistance, 1000.0); // Ensure significant movement
            
            console.log(`🎯 CAMERA MOVEMENT: ${movementDistance.toFixed(0)}m, deltaWC=${this.staticFakeCamera.positionWCDeltaMagnitude.toFixed(0)}`);
        }

        // console.log('📷 AFTER SYNC:');
        // console.log(`   NEW Fake camera position: (${cesiumPos.x.toFixed(0)}, ${cesiumPos.y.toFixed(0)}, ${cesiumPos.z.toFixed(0)})`);
        // console.log(`   NEW Fake camera direction: (${cesiumDirection.x.toFixed(3)}, ${cesiumDirection.y.toFixed(3)}, ${cesiumDirection.z.toFixed(3)})`);
        // console.log(`   Frustum FOV: ${(this.staticFakeCamera.frustum.fov * 180 / Math.PI).toFixed(1)}°`);
        // console.log(`   Frustum aspect: ${this.staticFakeCamera.frustum.aspectRatio.toFixed(3)}`);
        
        // Recreate frustum visualization at new camera position
        if (this.frustumVisible) {
            this.createFrustumVisualization(realPos, realDirection, realUp, realRight, false);
        }
    }

    /**
     * Handle canvas resize - update frustum and recreate visualization
     */
    public handleCanvasResize(): void {
        if (!this.staticFakeCamera || !this.staticFakeCamera.frustum) return;

        const newWidth = this.engine.getRenderWidth();
        const newHeight = this.engine.getRenderHeight();
        const newAspectRatio = newWidth / newHeight;

        // Update frustum aspect ratio
        this.staticFakeCamera.frustum.aspectRatio = newAspectRatio;

        // Trigger frustum's internal update by accessing sseDenominator getter
        const sseDenominator = (this.staticFakeCamera.frustum as any).sseDenominator;

        // console.log(`📐 Frustum updated for resize: ${newWidth}x${newHeight} (aspect: ${newAspectRatio.toFixed(3)})`);

        // Recreate frustum visualization with new dimensions
        if (this.frustumVisible) {
            // Get current camera info for visualization recreation  
            const babylonPos = this.camera.position;
            const babylonTarget = this.camera.getTarget();
            const babylonDirection = babylonTarget.subtract(babylonPos).normalize();
            const babylonUp = this.camera.upVector || Vector3.Up();
            const babylonRight = Vector3.Cross(babylonDirection, babylonUp).normalize();

            this.createFrustumVisualization(babylonPos, babylonDirection, babylonUp, babylonRight, false);
        }
    }

    /**
     * Load a 3D tileset
     */
    async loadTileset(assetId: number): Promise<void> {
        try {
            // Loading tileset
            
            // Get Ion resource
            const ionResource = await this.ionAuth.getIonResource(assetId);
            // Ion resource obtained
            
            // Create MinimalTileset with Babylon scene - CESIUM DEFAULT
            this.cesiumTileset = new MinimalTileset({
                url: ionResource,
                maximumScreenSpaceError: 16, // CESIUM DEFAULT: Keep standard SSE, rely on distance culling for control
                babylonScene: this.scene
            });
            
            // Wait for it to be ready
            await this.cesiumTileset.readyPromise;
            // Tileset ready
            
        } catch (error) {
            console.error('Failed to load tileset:', error);
            throw error;
        }
    }

    /**
     * Update method - call every frame
     */
    update(): void {
        if (!this.cesiumTileset) {
            return;
        }

        this.frameCount++;

        // FRUSTUM DEBUG: More restrictive frustum for debugging
        const debugFrustum = this.frameCount % 600 === 0; // Debug every 10 seconds
        // Using Cesium's exact default frustum values for Earth-scale 3D tilesets
        
        // 🎥 REAL CAMERA MODE: Use actual Babylon camera position and direction every frame
        // This makes tiles respond to real camera movement and rotation
        if (this.frameCount > 10 && this.cesiumTileset?.ready) {
            // Log when real camera mode starts (only once)
            if (!this.staticFakeCamera) {
                console.log(`🎥 REAL CAMERA MODE ACTIVATED: Tiles will now respond to camera movement!`);
            }
            // Use CURRENT real camera position and direction (updates every frame)
            const babylonCameraPosition = this.camera.position.clone(); // Live camera position
            
            // BABYLON-EXACT: Use the actual Babylon camera's direction vector
            const babylonDirection = this.camera.getDirection(Vector3.Forward()).normalize(); // Use real camera direction
            // BABYLON-EXACT: Use the actual Babylon camera's up vector
            const babylonUp = this.camera.upVector.normalize(); // Use real camera up vector
            const babylonRight = Vector3.Cross(babylonDirection, babylonUp).normalize(); // Right vector
            
            if (debugFrustum) {
                console.log(`🎥 REAL CAMERA MODE: Position = (${babylonCameraPosition.x.toFixed(0)}, ${babylonCameraPosition.y.toFixed(0)}, ${babylonCameraPosition.z.toFixed(0)})`);
                console.log(`🧭 Direction: (${babylonDirection.x.toFixed(3)}, ${babylonDirection.y.toFixed(3)}, ${babylonDirection.z.toFixed(3)})`);
            }
            
            // COORDINATE TRANSFORMATION: Babylon (Y-up) → Cesium (Z-up)
            // Transformation: (babylon_x, babylon_y, babylon_z) → (cesium_x, cesium_y, cesium_z)
            //                 (X,        Y,        Z)        → (X,       Z,       Y)
            const cesiumCameraPosition = new Cartesian3(
                babylonCameraPosition.x,  // X unchanged
                babylonCameraPosition.z,  // Babylon Z → Cesium Y  
                babylonCameraPosition.y   // Babylon Y → Cesium Z
            );
            
            // Direction vectors use same transformation (both right-handed systems)
            const cesiumDirection = new Cartesian3(
                babylonDirection.x,   // X unchanged
                babylonDirection.z,   // Babylon Z → Cesium Y
                babylonDirection.y    // Babylon Y → Cesium Z
            );
            
            // Up and Right vectors use same transformation
            const cesiumUp = new Cartesian3(
                babylonUp.x,     // X unchanged
                babylonUp.z,     // Babylon Z → Cesium Y
                babylonUp.y      // Babylon Y → Cesium Z
            );
            
            const cesiumRight = new Cartesian3(
                babylonRight.x,  // X unchanged  
                babylonRight.z,  // Babylon Z → Cesium Y
                babylonRight.y   // Babylon Y → Cesium Z
            );
            
            // console.log(`🌍 OUTPUT: Cesium coordinates (Z-up, right-handed):`);
            // console.log(`   Position:  (${cesiumCameraPosition.x.toFixed(1)}, ${cesiumCameraPosition.y.toFixed(1)}, ${cesiumCameraPosition.z.toFixed(1)})`);
            // console.log(`   Direction: (${cesiumDirection.x.toFixed(3)}, ${cesiumDirection.y.toFixed(3)}, ${cesiumDirection.z.toFixed(3)})`);
            // console.log(`   Transform rule: Babylon(X,Y,Z) → Cesium(X,Z,Y)`);
            
            // COORDINATE VALIDATION: Verify transformation consistency
            // console.log(`\n✅ COORDINATE VALIDATION:`);
            
            // Check magnitude consistency (distance from Earth center should be same)
            const babylonMagnitude = babylonCameraPosition.length();
            const cesiumMagnitude = Cartesian3.magnitude(cesiumCameraPosition);
            console.log(`   Magnitude check: Babylon=${babylonMagnitude.toFixed(0)}m, Cesium=${cesiumMagnitude.toFixed(0)}m (should match)`);
            
            // Verify cartographic calculation produces expected NYC coordinates
            const computedCartographic = Ellipsoid.WGS84.cartesianToCartographic(cesiumCameraPosition);
            const computedLon = computedCartographic.longitude * 180 / Math.PI;
            const computedLat = computedCartographic.latitude * 180 / Math.PI;
            const expectedLon = -74.0445;  // Expected NYC longitude
            const expectedLat = 40.6892;   // Expected NYC latitude
            
            console.log(`   Geographic validation:`);
            console.log(`     Computed: lon=${computedLon.toFixed(6)}°, lat=${computedLat.toFixed(6)}°`);
            console.log(`     Expected: lon=${expectedLon.toFixed(6)}°, lat=${expectedLat.toFixed(6)}°`);
            console.log(`     Lon error: ${Math.abs(computedLon - expectedLon).toFixed(6)}° (should be ~0)`);
            console.log(`     Lat error: ${Math.abs(computedLat - expectedLat).toFixed(6)}° (should be ~0)`);
            
            // Check if coordinates are in correct hemisphere/quadrant for NYC
            const isCorrectHemisphere = computedLon < 0 && computedLat > 0; // Western & Northern hemisphere
            console.log(`   Hemisphere check: ${isCorrectHemisphere ? '✅ CORRECT' : '❌ WRONG'} (NYC is Western/Northern)`);
            
            // Store the current camera data for this frame - POSITION CHANGES EVERY FRAME
            this.staticFakeCamera = {
                babylonPosition: babylonCameraPosition,
                babylonDirection: babylonDirection,
                babylonUp: babylonUp,
                babylonRight: babylonRight,
                cesiumPosition: cesiumCameraPosition,
                cesiumDirection: cesiumDirection,
                cesiumUp: cesiumUp,
                cesiumRight: cesiumRight,
                // CRITICAL: Calculate correct cartographic position from our Cartesian coordinates
                // This MUST match our actual position for correct tile loading
                positionCartographic: computedCartographic
            };
            
            // Log the final transformation results (only when debugging)
            if (debugFrustum) {
                console.log(`✅ COORDINATE TRANSFORMATION: Babylon → Cesium`);
                console.log(`   Position: → Cesium(${cesiumCameraPosition.x.toFixed(0)}, ${cesiumCameraPosition.y.toFixed(0)}, ${cesiumCameraPosition.z.toFixed(0)})`);
                console.log(`   Direction: → Cesium(${cesiumDirection.x.toFixed(3)}, ${cesiumDirection.y.toFixed(3)}, ${cesiumDirection.z.toFixed(3)})`);
            }
        } else {
            return; // Skip this frame, camera not ready
        }
        
        // Get current camera data for this frame (recalculated every frame)
        const babylonCameraPosition = this.staticFakeCamera.babylonPosition;
        const babylonDirection = this.staticFakeCamera.babylonDirection;
        const babylonUp = this.staticFakeCamera.babylonUp;
        const babylonRight = this.staticFakeCamera.babylonRight;
        
        // FRUSTUM DEBUG: Show current camera state
        if (debugFrustum) {
            console.log(`\n🎥 === REAL CAMERA DEBUG ===`);
            console.log(`🗽 LIVE BABYLON CAMERA: position = (${babylonCameraPosition.x.toFixed(0)}, ${babylonCameraPosition.y.toFixed(0)}, ${babylonCameraPosition.z.toFixed(0)})`);
            console.log(`🌍 BABYLON DISTANCE from origin: ${babylonCameraPosition.length().toFixed(0)} units`);
            console.log(`🗽 CESIUM CONVERTED: position = (${this.staticFakeCamera.cesiumPosition.x.toFixed(0)}, ${this.staticFakeCamera.cesiumPosition.y.toFixed(0)}, ${this.staticFakeCamera.cesiumPosition.z.toFixed(0)})`);
            console.log(`🌍 CESIUM DISTANCE from origin: ${Cartesian3.magnitude(this.staticFakeCamera.cesiumPosition).toFixed(0)} units`);
            
            // CREATE FRUSTUM VISUALIZATION: Draw the actual frustum wireframe
            this.createFrustumVisualization(babylonCameraPosition, babylonDirection, babylonUp, babylonRight, false);
        }
        
        // Build CESIUM-COMPATIBLE CAMERA: Implement updateMembers() pattern from Cesium Camera.js
        const fakeCamera = this.createCesiumCompatibleCamera(this.staticFakeCamera);

        // CESIUM EXACT: Create frameState with all required properties like FrameState.js
        const frameState = {
            camera: fakeCamera,
            
            // CRITICAL: Add context with drawing buffer dimensions (required for screen space error calculations)
            context: {
                drawingBufferWidth: this.engine.getRenderWidth(),
                drawingBufferHeight: this.engine.getRenderHeight()
            },
            // CESIUM EXACT: Use camera.frustum.computeCullingVolume() like Scene.js does
            // CONSISTENT: Use fakeCamera properties directly (they're already in Cesium coordinates)
            cullingVolume: (() => {
                // console.log(`🔺 COMPUTING CULLING VOLUME:`);
                
                // Debug: Check all vectors before passing to Cesium
                const pos = fakeCamera.positionWC;
                const dir = fakeCamera.directionWC;
                const up = fakeCamera.upWC;
                
                // console.log(`   Position: (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)})`);
                // console.log(`   Direction: (${dir.x.toFixed(3)}, ${dir.y.toFixed(3)}, ${dir.z.toFixed(3)})`);
                // console.log(`   Up: (${up.x.toFixed(3)}, ${up.y.toFixed(3)}, ${up.z.toFixed(3)})`);
                // console.log(`   Frustum FOV: ${(fakeCamera.frustum.fov * 180 / Math.PI).toFixed(1)}°, near: ${fakeCamera.frustum.near}, far: ${fakeCamera.frustum.far}`);
                
                // Validate vectors before passing to Cesium
                const posValid = isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z);
                const dirValid = isFinite(dir.x) && isFinite(dir.y) && isFinite(dir.z) && (dir.x !== 0 || dir.y !== 0 || dir.z !== 0);
                const upValid = isFinite(up.x) && isFinite(up.y) && isFinite(up.z) && (up.x !== 0 || up.y !== 0 || up.z !== 0);
                
                // console.log(`   Vector validation: pos=${posValid}, dir=${dirValid}, up=${upValid}`);
                
                if (!posValid || !dirValid || !upValid) {
                    console.error('❌ INVALID VECTORS - cannot create culling volume!');
                    throw new Error('Invalid camera vectors for culling volume');
                }
                
                let cullingVolume;
                try {
                    cullingVolume = fakeCamera.frustum.computeCullingVolume(
                        fakeCamera.positionWC,   // Use fakeCamera consistently
                        fakeCamera.directionWC,  // Use fakeCamera consistently  
                        fakeCamera.upWC          // Use fakeCamera consistently
                    );
                    // console.log(`✅ Culling volume created successfully`);
                } catch (error) {
                    console.error('❌ ERROR in computeCullingVolume:', error);
                    console.error('Frustum details:', {
                        fov: fakeCamera.frustum.fov,
                        near: fakeCamera.frustum.near,
                        far: fakeCamera.frustum.far,
                        aspectRatio: fakeCamera.frustum.aspectRatio
                    });
                    throw error;
                }
                
                if (debugFrustum && cullingVolume && cullingVolume.planes) {
                    console.log(`🔺 CULLING VOLUME COMPUTED: ${cullingVolume.planes.length} planes`);
                    
                    // Check all plane distances - they should NOT all be 0
                    const planeNames = ['LEFT', 'RIGHT', 'BOTTOM', 'TOP', 'NEAR', 'FAR'];
                    let allZero = true;
                    for (let i = 0; i < Math.min(cullingVolume.planes.length, 6); i++) {
                        const plane = cullingVolume.planes[i];
                        if (plane && typeof plane.w !== 'undefined') {
                            console.log(`   ${planeNames[i]}: normal(${plane.x?.toFixed(3)}, ${plane.y?.toFixed(3)}, ${plane.z?.toFixed(3)}), distance=${plane.w?.toFixed(0)}`);
                            if (Math.abs(plane.w) > 0.1) allZero = false;
                        }
                    }
                    
                    if (allZero) {
                        console.log(`   ❌ CRITICAL: All frustum plane distances are 0! Camera vectors might not be proper Cartesian3 objects.`);
                        console.log(`   DEBUG: position type: ${fakeCamera.positionWC.constructor.name}, isCartesian3: ${fakeCamera.positionWC instanceof Cartesian3}`);
                        console.log(`   DEBUG: direction type: ${fakeCamera.directionWC.constructor.name}, isCartesian3: ${fakeCamera.directionWC instanceof Cartesian3}`);
                        console.log(`   DEBUG: up type: ${fakeCamera.upWC.constructor.name}, isCartesian3: ${fakeCamera.upWC instanceof Cartesian3}`);
                    } else {
                        console.log(`   ✅ At least some planes have non-zero distances`);
                    }
                }
                
                // FIX: Add debugging wrapper to understand what's happening with culling
                if (cullingVolume && cullingVolume.computeVisibilityWithPlaneMask) {
                    // Store the original method
                    const originalComputeVisibilityWithPlaneMask = cullingVolume.computeVisibilityWithPlaneMask.bind(cullingVolume);
                    
                    // Wrap it with debugging
                    cullingVolume.computeVisibilityWithPlaneMask = (boundingVolume: any, parentPlaneMask: number) => {
                        // Apply Cesium's exact logic with debugging  
                        const shouldDebug = debugFrustum || (this.frameCount % 300 === 0); // Debug every 5 seconds or on demand
                        
                        // DISABLED: Culling wrapper spam reduction
                        
                        if (shouldDebug && boundingVolume?.center) {
                            const center = boundingVolume.center;
                            const radius = boundingVolume.radius || 0;
                            console.log(`🎭 CESIUM CULLING TEST: BV center=(${center.x?.toFixed(0)}, ${center.y?.toFixed(0)}, ${center.z?.toFixed(0)}) radius=${radius?.toFixed(0)}`);
                            console.log(`   Parent plane mask: 0x${parentPlaneMask.toString(16)} (${parentPlaneMask === 0xffffffff ? 'MASK_OUTSIDE' : parentPlaneMask === 0x00000000 ? 'MASK_INSIDE' : 'INTERSECTING'})`);
                            
                            // CRITICAL: Check coordinate space consistency
                            const fakeCamera = frameState?.camera;  
                            if (fakeCamera?.positionWC) {
                                const cameraPos = fakeCamera.positionWC;
                                const dx = center.x - cameraPos.x;
                                const dy = center.y - cameraPos.y; 
                                const dz = center.z - cameraPos.z;
                                const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                                const distanceToSurface = distance - radius;
                                
                                // console.log(`   📍 COORDINATE CHECK:`);
                                // console.log(`     Camera: (${cameraPos.x.toFixed(0)}, ${cameraPos.y.toFixed(0)}, ${cameraPos.z.toFixed(0)})`);
                                // console.log(`     Tile:   (${center.x.toFixed(0)}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)})`);  
                                // console.log(`     Distance to center: ${distance.toFixed(0)}m, to surface: ${distanceToSurface.toFixed(0)}m`);
                                
                                // Check if distance seems reasonable for NYC area
                                const isReasonableDistance = distance > 100 && distance < 50000000; // 100m to 50,000km
                                // console.log(`     Distance reasonable: ${isReasonableDistance ? '✅' : '❌'} (100m < ${distance.toFixed(0)}m < 50Mm)`);
                                
                                // Check if tile is anywhere near camera coordinate-space-wise
                                const isInSameQuadrant = (Math.sign(center.x) === Math.sign(cameraPos.x)) && 
                                                        (Math.sign(center.y) === Math.sign(cameraPos.y)) && 
                                                        (Math.sign(center.z) === Math.sign(cameraPos.z));
                                // console.log(`     Same coord quadrant: ${isInSameQuadrant ? '✅' : '❌'} (signs should match for nearby tiles)`);
                            }
                        }
                        
                        // CESIUM EXACT: Apply the exact same early exit optimization
                        if (parentPlaneMask === 0xffffffff || parentPlaneMask === 0x00000000) { // MASK_OUTSIDE or MASK_INSIDE
                            if (shouldDebug) {
                                const maskName = parentPlaneMask === 0xffffffff ? 'MASK_OUTSIDE' : 'MASK_INSIDE';
                                // console.log(`   🔄 Cesium optimization: parent is ${maskName}, returning same for child`);
                            }
                            return parentPlaneMask;
                        }
                        
                        // Call Cesium's actual implementation
                        const result = originalComputeVisibilityWithPlaneMask(boundingVolume, parentPlaneMask);
                        
                        if (shouldDebug) {
                            let resultName;
                            if (result === 0xffffffff) resultName = 'MASK_OUTSIDE (culled)';
                            else if (result === 0x00000000) resultName = 'MASK_INSIDE (visible)';
                            else resultName = `INTERSECTING (mask=0x${result.toString(16)})`;
                            
                            // console.log(`   ✅ Cesium result: ${resultName}`);
                            
                            // If it's being culled, let's understand why
                            if (result === 0xffffffff) {
                                // console.log(`   ❌ CULLED: Bounding volume outside view frustum (normal Cesium behavior)`);
                            }
                        }
                        
                        return result;
                    };
                }
                
                // CESIUM DIRECT: Log the actual frustum planes that Cesium will use
                if (debugFrustum && cullingVolume?.planes) {
                    // console.log(`\n🔍 CESIUM FRUSTUM PLANES (what tiles will actually be tested against):`);
                    const planeNames = ['LEFT', 'RIGHT', 'BOTTOM', 'TOP', 'NEAR', 'FAR'];
                    for (let i = 0; i < Math.min(cullingVolume.planes.length, 6); i++) {
                        const plane = cullingVolume.planes[i];
                        if (plane) {
                            // console.log(`   ${planeNames[i]}: normal(${plane.x?.toFixed(3)}, ${plane.y?.toFixed(3)}, ${plane.z?.toFixed(3)}), distance=${plane.w?.toFixed(0)}`);
                        }
                    }
                    // console.log(`🔍 END FRUSTUM PLANE ANALYSIS\n`);
                }
                
                return cullingVolume;
            })(),
            pixelRatio: 1.0,
            mode: 3, // SceneMode.SCENE3D
            mapProjection: {
                project: () => new Cartesian3(0, 0, 0),
                unproject: () => {}
            },
            frameNumber: Date.now(),
            afterRender: [],
            
            // CESIUM EXACT: Required properties from FrameState.js constructor
            verticalExaggeration: 1.0,
            verticalExaggerationRelativeHeight: 0.0,
            
            // CRITICAL: Add commandList array (required for tile.update() method)
            commandList: [],
            
            // Additional properties that might be needed
            morphTime: 1.0, // SceneMode.getMorphTime(SceneMode.SCENE3D)
            minimumTerrainHeight: -11000.0, // Mariana Trench depth for proper occluder sizing
            
            // HORIZON CULLING: Add occluder to prevent tiles on far side of Earth
            occluder: (() => {
                try {
                    // Create Earth bounding sphere for horizon culling
                    const earthBoundingSphere = new BoundingSphere(
                        Cartesian3.ZERO, // Earth center
                        Ellipsoid.WGS84.minimumRadius + (-11000.0) // Earth radius + minimum terrain height
                    );
                    
                    // Create occluder from Earth sphere and camera position
                    const occluder = Occluder.fromBoundingSphere(
                        earthBoundingSphere,
                        fakeCamera.positionWC
                    );
                    
                    // if (this.frameCount % 600 === 0) { // Debug every 10 seconds
                        // console.log(`🌍 HORIZON OCCLUDER: Created with Earth radius=${earthBoundingSphere.radius.toFixed(0)}m, camera at distance=${Cartesian3.magnitude(fakeCamera.positionWC).toFixed(0)}m`);
                    // }
                    
                    return occluder;
                } catch (error) {
                    console.error('❌ Failed to create horizon occluder:', error);
                    return undefined;
                }
            })(),
            
            // ELLIPSOIDAL OCCLUDER: For precise tileset horizon culling
            ellipsoidalOccluder: (() => {
                try {
                    const ellipsoidalOccluder = new EllipsoidalOccluder(Ellipsoid.WGS84, fakeCamera.positionWC);
                    
                    // if (this.frameCount % 600 === 0) { // Debug every 10 seconds
                        // console.log(`🌐 ELLIPSOIDAL OCCLUDER: Created for precise tileset horizon culling`);
                    // }
                    
                    return ellipsoidalOccluder;
                } catch (error) {
                    console.error('❌ Failed to create ellipsoidal occluder:', error);
                    return undefined;
                }
            })()
        };

        // DEBUG: Comprehensive validation of frameState and camera for distance calculations
        if (this.frameCount % 600 === 1) { // Log once every 10 seconds
            // console.log('\n🔍 === FRAMESTATE & CAMERA VALIDATION ==='); // Only every 600 frames
            
            // Validate frameState structure
            // console.log('📋 FrameState structure:', {
            //     hasCamera: !!frameState.camera,
            //     hasCullingVolume: !!frameState.cullingVolume,
            //     hasPixelRatio: typeof frameState.pixelRatio !== 'undefined',
            //     hasMode: typeof frameState.mode !== 'undefined',
            //     hasFrameNumber: typeof frameState.frameNumber !== 'undefined',
            //     mode: frameState.mode,
            //     pixelRatio: frameState.pixelRatio
            // });
            
            // DISABLED: Camera validation spam reduction
        }

        // TILESET SELECTION: Run BaseTraversal tile selection with our fake camera/frameState
        this.cesiumTileset.update(frameState);
        
        // DEBUG FRUSTUM: Create visualization when debugging  
        if (debugFrustum) {
            this.createFrustumFromFrameState(frameState);
            
            // HORIZON CULLING DEBUG: Check which tiles are actually being selected
            // console.log(`\n🌍 HORIZON CULLING ANALYSIS:`);
            const selectedTiles = this.cesiumTileset.selectedTiles || [];
            // console.log(`   📊 Total selected tiles: ${selectedTiles.length}`);
            
            if (selectedTiles.length > 0) {
                // Analyze selected tile positions relative to camera
                const cameraPos = fakeCamera.positionWC;
                const cameraDir = fakeCamera.directionWC;
                
                // console.log(`   📍 Camera position: (${cameraPos.x.toFixed(0)}, ${cameraPos.y.toFixed(0)}, ${cameraPos.z.toFixed(0)})`);
                // console.log(`   🧭 Camera direction: (${cameraDir.x.toFixed(3)}, ${cameraDir.y.toFixed(3)}, ${cameraDir.z.toFixed(3)})`);
                
                // Group tiles by hemisphere (those behind vs in front of camera)
                let tilesInFront = 0;
                let tilesBehind = 0;
                let tilesAtSide = 0;
                
                selectedTiles.forEach((tile: any, i: number) => {
                    try {
                        const boundingSphere = tile.boundingSphere;
                        if (boundingSphere) {
                            // Vector from camera to tile center
                            const tileCenter = boundingSphere.center;
                            const cameraToTile = Cartesian3.subtract(tileCenter, cameraPos, new Cartesian3());
                            
                            // Dot product with camera direction (>0 = in front, <0 = behind)
                            const dotProduct = Cartesian3.dot(Cartesian3.normalize(cameraToTile, new Cartesian3()), cameraDir);
                            
                            const distance = Cartesian3.distance(cameraPos, tileCenter);
                            const earthDistance = Cartesian3.magnitude(tileCenter); // Distance from Earth center
                            
                            if (dotProduct > 0.5) {
                                tilesInFront++;
                                // if (i < 3) console.log(`   ✅ Tile ${i+1}: IN FRONT (dot=${dotProduct.toFixed(3)}, dist=${distance.toFixed(0)}m, earthDist=${earthDistance.toFixed(0)}m)`);
                            } else if (dotProduct < -0.5) {
                                tilesBehind++;
                                // if (i < 3) console.log(`   🚨 Tile ${i+1}: BEHIND (dot=${dotProduct.toFixed(3)}, dist=${distance.toFixed(0)}m, earthDist=${earthDistance.toFixed(0)}m)`);
                            } else {
                                tilesAtSide++;
                                // if (i < 3) console.log(`   ↔️ Tile ${i+1}: AT SIDE (dot=${dotProduct.toFixed(3)}, dist=${distance.toFixed(0)}m, earthDist=${earthDistance.toFixed(0)}m)`);
                            }
                        }
                    } catch (e) {
                        // Skip tiles without proper bounding info
                    }
                });
                
                // console.log(`   📈 HORIZON ANALYSIS: ${tilesInFront} in front, ${tilesAtSide} at side, ${tilesBehind} behind camera`);
                if (tilesBehind > 0) {
                    console.log(`   🚨 WARNING: ${tilesBehind} tiles selected BEHIND camera - horizon culling may not be working!`);
                } else {
                    // console.log(`   ✅ SUCCESS: No tiles behind camera - horizon culling appears to be working`);
                }
            }
        }
        
        // DISABLED: Stats logging spam reduction
        if (false) {
            const statsAfter = this.cesiumTileset.statistics;
            console.log(`📊 SELECTION DEBUG:`);
            console.log(`   Tiles selected: ${this.cesiumTileset.selectedTiles?.length || 0}`);
            console.log(`   Tiles visited: ${statsAfter.visited}, requested: ${statsAfter.requested}`);
            
            // Count actually visible meshes
            const visibleTileMeshes = this.scene.meshes.filter(mesh => 
                mesh.isVisible && 
                !mesh.name.startsWith('debug_') && 
                !mesh.name.includes('camera') && 
                !mesh.name.includes('marker') &&
                !mesh.name.includes('ground') &&
                mesh.name !== 'sphere' &&
                mesh.name !== 'box'
            );
            console.log(`   Actually visible meshes: ${visibleTileMeshes.length} (should match selected tiles)`);
            
            // DEBUG: Show screen space error calculation details for first few selected tiles
            const selectedTiles = this.cesiumTileset.selectedTiles || [];
            if (selectedTiles.length > 0) {
                console.log(`📐 SCREEN SPACE ERROR DEBUG (first 3 tiles):`);
                selectedTiles.slice(0, 3).forEach((tile: any, i: number) => {
                    try {
                        const sse = tile.getScreenSpaceError(frameState, true);
                        const distance = tile._distanceToCamera;
                        const geometricError = tile.geometricError;
                        console.log(`   Tile ${i+1}: SSE=${sse?.toFixed(1)}, distance=${distance?.toFixed(0)}, geomError=${geometricError?.toFixed(0)}`);
                        
                        // Manual calculation check: (geometricError * height) / (distance * sseDenominator)
                        const height = this.engine.getRenderHeight();
                        const frustumSSE = (fakeCamera.frustum as any).sseDenominator;
                        if (frustumSSE) {
                            const manualSSE = (geometricError * height) / (distance * frustumSSE);
                            console.log(`     Manual calc: (${geometricError?.toFixed(0)} * ${height}) / (${distance?.toFixed(0)} * ${frustumSSE?.toFixed(2)}) = ${manualSSE?.toFixed(1)}`);
                        }
                    } catch (e: any) {
                        console.log(`   Tile ${i+1}: Error calculating SSE:`, e?.message || e);
                    }
                });
            }
            
            // Each tile typically has 2 meshes, so expected = selected_tiles * 2
            const selectedTilesCount = this.cesiumTileset.selectedTiles?.length || 0;
            const expectedMeshes = selectedTilesCount * 2; // Each tile has ~2 meshes
            
            if (visibleTileMeshes.length !== expectedMeshes) {
                const difference = visibleTileMeshes.length - expectedMeshes;
                console.log(`❌ VISIBILITY MISMATCH: Expected ${expectedMeshes} meshes (${selectedTilesCount} tiles × 2), got ${visibleTileMeshes.length} (difference: ${difference > 0 ? '+' : ''}${difference})`);
            } else {
                console.log(`✅ VISIBILITY CORRECT: ${visibleTileMeshes.length} meshes match ${selectedTilesCount} tiles × 2`);
            }
        }

        // Update tileset (reduced logging - stats available via getStats())
    }

    /**
     * REMOVED: Custom frustum culling - now using Cesium's exact PerspectiveFrustum.computeCullingVolume()
     * Based on PerspectiveOffCenterFrustum.computeCullingVolume from Cesium source
     */
    private _createFrustumCullingVolume_UNUSED(camera: any, debug: boolean = false) {
        const CesiumCartesian3 = Cartesian3;
        
        // CESIUM EXACT: Get camera parameters exactly like Cesium
        const position = camera.positionWC;
        let direction = camera.directionWC;
        let up = camera.upWC;
        const frustum = camera.frustum;
        
        // SAFETY: Ensure camera vectors are normalized (Cesium requirement)
        const dirMagnitude = CesiumCartesian3.magnitude(direction);
        const upMagnitude = CesiumCartesian3.magnitude(up);
        
        if (dirMagnitude === 0 || upMagnitude === 0) {
            console.error('🚫 Invalid camera vectors - zero magnitude');
            return {
                computeVisibilityWithPlaneMask: () => 0,
                computeVisibility: () => 1
            };
        }
        
        // Normalize vectors to be safe
        direction = CesiumCartesian3.normalize(direction, new CesiumCartesian3());
        up = CesiumCartesian3.normalize(up, new CesiumCartesian3());
        
        // CESIUM EXACT: Calculate frustum bounds like PerspectiveOffCenterFrustum
        const fov = frustum.fov;
        const aspectRatio = this.engine.getRenderWidth() / this.engine.getRenderHeight();
        const near = frustum.near;
        const far = frustum.far;
        
        // CESIUM EXACT: Convert symmetric perspective to off-center bounds
        const tanHalfFov = Math.tan(fov / 2.0);
        const top = near * tanHalfFov;
        const bottom = -top;
        const right = aspectRatio * top;
        const left = -right;
        
        // CESIUM EXACT: Calculate right vector (Cesium does cross(direction, up))
        // BUT: Ensure vectors are properly orthogonal first
        let rightVec = CesiumCartesian3.cross(direction, up, new CesiumCartesian3());
        const rightMagnitude = CesiumCartesian3.magnitude(rightVec);
        
        if (rightMagnitude === 0) {
            // Vectors are parallel - fix by adjusting up vector slightly
            const adjustedUp = new CesiumCartesian3(up.x + 0.001, up.y, up.z);
            CesiumCartesian3.normalize(adjustedUp, adjustedUp);
            rightVec = CesiumCartesian3.cross(direction, adjustedUp, new CesiumCartesian3());
            console.log('🔧 FIXED: Adjusted up vector for proper cross product');
        }
        
        // Ensure right vector is normalized
        CesiumCartesian3.normalize(rightVec, rightVec);
        
        // CESIUM EXACT: Calculate near and far centers
        const nearCenter = CesiumCartesian3.multiplyByScalar(direction, near, new CesiumCartesian3());
        CesiumCartesian3.add(position, nearCenter, nearCenter);
        
        const farCenter = CesiumCartesian3.multiplyByScalar(direction, far, new CesiumCartesian3());
        CesiumCartesian3.add(position, farCenter, farCenter);
        
        const planes: any[] = [];
        
        try {
            let normal = new CesiumCartesian3();
            
            // CESIUM EXACT: Left plane computation (planes[0])
            CesiumCartesian3.multiplyByScalar(rightVec, left, normal);
            CesiumCartesian3.add(nearCenter, normal, normal);
            CesiumCartesian3.subtract(normal, position, normal);
            CesiumCartesian3.normalize(normal, normal);
            CesiumCartesian3.cross(normal, up, normal);
            CesiumCartesian3.normalize(normal, normal);
            planes.push(new Plane(normal, -CesiumCartesian3.dot(normal, position)));
            
            // CESIUM EXACT: Right plane computation (planes[1])  
            normal = new CesiumCartesian3();
            CesiumCartesian3.multiplyByScalar(rightVec, right, normal);
            CesiumCartesian3.add(nearCenter, normal, normal);
            CesiumCartesian3.subtract(normal, position, normal);
            CesiumCartesian3.cross(up, normal, normal);
            CesiumCartesian3.normalize(normal, normal);
            planes.push(new Plane(normal, -CesiumCartesian3.dot(normal, position)));
            
            // CESIUM EXACT: Bottom plane computation (planes[2])
            normal = new CesiumCartesian3();
            CesiumCartesian3.multiplyByScalar(up, bottom, normal);
            CesiumCartesian3.add(nearCenter, normal, normal);
            CesiumCartesian3.subtract(normal, position, normal);
            CesiumCartesian3.cross(rightVec, normal, normal);
            CesiumCartesian3.normalize(normal, normal);
            planes.push(new Plane(normal, -CesiumCartesian3.dot(normal, position)));
            
            // CESIUM EXACT: Top plane computation (planes[3])
            normal = new CesiumCartesian3();
            CesiumCartesian3.multiplyByScalar(up, top, normal);
            CesiumCartesian3.add(nearCenter, normal, normal);
            CesiumCartesian3.subtract(normal, position, normal);
            CesiumCartesian3.cross(normal, rightVec, normal);
            CesiumCartesian3.normalize(normal, normal);
            planes.push(new Plane(normal, -CesiumCartesian3.dot(normal, position)));
            
            // CESIUM EXACT: Near plane computation (planes[4])
            planes.push(new Plane(direction, -CesiumCartesian3.dot(direction, nearCenter)));
            
            // CESIUM EXACT: Far plane computation (planes[5])
            normal = CesiumCartesian3.negate(direction, new CesiumCartesian3());
            planes.push(new Plane(normal, -CesiumCartesian3.dot(normal, farCenter)));
            
            if (debug) {
                console.log(`🔍 CESIUM EXACT FRUSTUM: Created ${planes.length} planes`);
                console.log(`   FOV: ${(fov * 180 / Math.PI).toFixed(1)}°, aspect: ${aspectRatio.toFixed(2)}`);
                console.log(`   Near: ${near/1000}km, Far: ${far/1000000}Mkm`);
                console.log(`   Bounds: L=${left.toFixed(0)} R=${right.toFixed(0)} T=${top.toFixed(0)} B=${bottom.toFixed(0)}`);
            }
            
        } catch (error) {
            console.error('Failed to create Cesium-exact frustum planes:', error);
            // Fallback to permissive culling
            return {
                computeVisibilityWithPlaneMask: () => 0, // Not outside
                computeVisibility: () => 1 // Intersecting
            };
        }
        
        return {
            computeVisibilityWithPlaneMask: (boundingVolume: any, _parentPlaneMask: number) => {
                // CESIUM EXACT: Plane mask culling exactly like Cesium CullingVolume
                let planeMask = 0; // MASK_INSIDE (all zeros)
                const planeResults = [];
                for (let i = 0; i < planes.length; i++) {
                    const plane = planes[i];
                    // CESIUM EXACT: intersectPlane returns -1 (OUTSIDE), 0 (INTERSECTING), 1 (INSIDE)
                    const result = boundingVolume.intersectPlane ? boundingVolume.intersectPlane(plane) : 0; // Assume intersecting if no method
                    planeResults.push(result);
                    if (result === -1) { // OUTSIDE
                        planeMask |= (1 << i);
                    }
                }
                console.log(`🎭 PLANE MASK COMPUTATION: planeMask=0x${planeMask.toString(16)}, planeResults=[${planeResults.join(', ')}]`);
                return planeMask;
            },
            computeVisibility: (boundingVolume: any) => {
                // CESIUM EXACT: Returns Intersect values: -1=OUTSIDE, 0=INTERSECTING, 1=INSIDE
                let intersecting = false;
                let planeResults = [];
                
                for (let i = 0; i < planes.length; i++) {
                    const plane = planes[i];
                    // CESIUM EXACT: intersectPlane returns -1 (OUTSIDE), 0 (INTERSECTING), 1 (INSIDE)
                    const result = boundingVolume.intersectPlane ? boundingVolume.intersectPlane(plane) : 0;
                    planeResults.push(result);
                    
                    if (result === -1) { // OUTSIDE
                        // DEBUG: Log first OUTSIDE result with details
                        console.log(`🚫 FRUSTUM CULLED: Bounding volume OUTSIDE plane ${i} (${['left', 'right', 'bottom', 'top', 'near', 'far'][i]})`);
                        console.log(`   Bounding volume type: ${boundingVolume.constructor.name}`);
                        if (boundingVolume.center) console.log(`   BV center: (${boundingVolume.center.x.toFixed(0)}, ${boundingVolume.center.y.toFixed(0)}, ${boundingVolume.center.z.toFixed(0)})`);
                        if (boundingVolume.radius) console.log(`   BV radius: ${boundingVolume.radius.toFixed(0)}`);
                        console.log(`   Plane results: [${planeResults.join(', ')}]`);
                        return -1; // OUTSIDE - cull this tile (Cesium Intersect.OUTSIDE)
                    } else if (result === 0) { // INTERSECTING
                        intersecting = true;
                    }
                    // result === 1 means INSIDE, continue checking other planes
                }
                
                const finalResult = intersecting ? 0 : 1; // INTERSECTING : INSIDE
                console.log(`✅ FRUSTUM PASSED: Bounding volume ${finalResult === 0 ? 'INTERSECTING' : 'INSIDE'} frustum (returning ${finalResult})`);
                if (boundingVolume.center) console.log(`   BV center: (${boundingVolume.center.x.toFixed(0)}, ${boundingVolume.center.y.toFixed(0)}, ${boundingVolume.center.z.toFixed(0)})`);
                console.log(`   Plane results: [${planeResults.join(', ')}]`);
                return finalResult;
            }
        };
    }

    /**
     * Create frustum visualization from frameState (converts Cesium to Babylon coordinates)
     */
    private createFrustumFromFrameState(frameState: any): void {
        try {
            // Extract Cesium camera data from frameState
            const cesiumCamera = frameState.camera;
            const cesiumPos = cesiumCamera.positionWC; // Cesium coordinates
            const cesiumDir = cesiumCamera.directionWC;
            const cesiumUp = cesiumCamera.upWC;
            const cesiumRight = cesiumCamera.rightWC;
            
            // Convert from Cesium coordinates (Z-up) to Babylon coordinates (Y-up)
            // Cesium(X,Y,Z) → Babylon(X,Z,Y)
            const babylonPos = new Vector3(cesiumPos.x, cesiumPos.z, cesiumPos.y);
            const babylonDir = new Vector3(cesiumDir.x, cesiumDir.z, cesiumDir.y);
            const babylonUp = new Vector3(cesiumUp.x, cesiumUp.z, cesiumUp.y);
            const babylonRight = new Vector3(cesiumRight.x, cesiumRight.z, cesiumRight.y);
            
            // Get frustum parameters from frameState
            const frustum = cesiumCamera.frustum;
            const context = frameState.context;
            
            // console.log('🔺 CREATING DEBUG FRUSTUM from frameState:');
            // console.log(`   Position: Cesium(${cesiumPos.x.toFixed(0)}, ${cesiumPos.y.toFixed(0)}, ${cesiumPos.z.toFixed(0)}) → Babylon(${babylonPos.x.toFixed(0)}, ${babylonPos.y.toFixed(0)}, ${babylonPos.z.toFixed(0)})`);
            // console.log(`   FOV: ${(frustum.fov * 180 / Math.PI).toFixed(1)}°, near: ${frustum.near}, far: ${frustum.far}`);
            // console.log(`   Screen: ${context.drawingBufferWidth}x${context.drawingBufferHeight}`);
            
            // Call existing visualization with converted coordinates
            this.createFrustumVisualization(babylonPos, babylonDir, babylonUp, babylonRight, false);
            
        } catch (error) {
            console.error('Error creating frustum from frameState:', error);
        }
    }

    /**
     * Create wireframe visualization of the camera frustum for debugging
     */
    private createFrustumVisualization(babylonPosition: Vector3, babylonDirection: Vector3, babylonUp: Vector3, babylonRight: Vector3, restrictive: boolean): void {
        
        // Clear any existing frustum visualization
        const existingMeshes = this.scene.meshes.filter(m => m.name.startsWith('debug_frustum'));
        for (const mesh of existingMeshes) {
            mesh.dispose();
        }
        
        try {
            // Use the Babylon coordinates directly (no conversion needed)
            const position = babylonPosition;
            const direction = babylonDirection;
            const up = babylonUp;
            const right = babylonRight;
            
            // Get frustum parameters (use restrictive values for debug)
            const nearDistance = 1.0; // Cesium default: 1 meter
            const farDistance = 500000000.0; // Cesium default: 500Mkm
            const fov = Math.PI / 3; // Cesium default: 60 degrees
            const aspectRatio = this.engine.getRenderWidth() / this.engine.getRenderHeight();
            
            // Calculate frustum dimensions
            const nearHeight = 2.0 * nearDistance * Math.tan(fov / 2.0);
            const nearWidth = nearHeight * aspectRatio;
            const farHeight = 2.0 * farDistance * Math.tan(fov / 2.0);
            const farWidth = farHeight * aspectRatio;
            
            // Position and vectors are already in Babylon coordinates - use directly
            const babylonPos = position;
            const babylonDir = direction;
            const babylonUpVec = up;
            const babylonRightVec = right;
            
            // Calculate frustum corner points
            const nearCenter = {
                x: babylonPos.x + babylonDir.x * nearDistance,
                y: babylonPos.y + babylonDir.y * nearDistance,
                z: babylonPos.z + babylonDir.z * nearDistance
            };
            
            const farCenter = {
                x: babylonPos.x + babylonDir.x * farDistance,
                y: babylonPos.y + babylonDir.y * farDistance,
                z: babylonPos.z + babylonDir.z * farDistance
            };
            
            // Near plane corners
            const nearTopLeft = {
                x: nearCenter.x + babylonUpVec.x * (nearHeight/2) - babylonRightVec.x * (nearWidth/2),
                y: nearCenter.y + babylonUpVec.y * (nearHeight/2) - babylonRightVec.y * (nearWidth/2),
                z: nearCenter.z + babylonUpVec.z * (nearHeight/2) - babylonRightVec.z * (nearWidth/2)
            };
            const nearTopRight = {
                x: nearCenter.x + babylonUpVec.x * (nearHeight/2) + babylonRightVec.x * (nearWidth/2),
                y: nearCenter.y + babylonUpVec.y * (nearHeight/2) + babylonRightVec.y * (nearWidth/2),
                z: nearCenter.z + babylonUpVec.z * (nearHeight/2) + babylonRightVec.z * (nearWidth/2)
            };
            const nearBottomLeft = {
                x: nearCenter.x - babylonUpVec.x * (nearHeight/2) - babylonRightVec.x * (nearWidth/2),
                y: nearCenter.y - babylonUpVec.y * (nearHeight/2) - babylonRightVec.y * (nearWidth/2),
                z: nearCenter.z - babylonUpVec.z * (nearHeight/2) - babylonRightVec.z * (nearWidth/2)
            };
            const nearBottomRight = {
                x: nearCenter.x - babylonUpVec.x * (nearHeight/2) + babylonRightVec.x * (nearWidth/2),
                y: nearCenter.y - babylonUpVec.y * (nearHeight/2) + babylonRightVec.y * (nearWidth/2),
                z: nearCenter.z - babylonUpVec.z * (nearHeight/2) + babylonRightVec.z * (nearWidth/2)
            };
            
            // Far plane corners
            const farTopLeft = {
                x: farCenter.x + babylonUpVec.x * (farHeight/2) - babylonRightVec.x * (farWidth/2),
                y: farCenter.y + babylonUpVec.y * (farHeight/2) - babylonRightVec.y * (farWidth/2),
                z: farCenter.z + babylonUpVec.z * (farHeight/2) - babylonRightVec.z * (farWidth/2)
            };
            const farTopRight = {
                x: farCenter.x + babylonUpVec.x * (farHeight/2) + babylonRightVec.x * (farWidth/2),
                y: farCenter.y + babylonUpVec.y * (farHeight/2) + babylonRightVec.y * (farWidth/2),
                z: farCenter.z + babylonUpVec.z * (farHeight/2) + babylonRightVec.z * (farWidth/2)
            };
            const farBottomLeft = {
                x: farCenter.x - babylonUpVec.x * (farHeight/2) - babylonRightVec.x * (farWidth/2),
                y: farCenter.y - babylonUpVec.y * (farHeight/2) - babylonRightVec.y * (farWidth/2),
                z: farCenter.z - babylonUpVec.z * (farHeight/2) - babylonRightVec.z * (farWidth/2)
            };
            const farBottomRight = {
                x: farCenter.x - babylonUpVec.x * (farHeight/2) + babylonRightVec.x * (farWidth/2),
                y: farCenter.y - babylonUpVec.y * (farHeight/2) + babylonRightVec.y * (farWidth/2),
                z: farCenter.z - babylonUpVec.z * (farHeight/2) + babylonRightVec.z * (farWidth/2)
            };
            
            // Create line system to draw the frustum (using Vector3 for Babylon.js)
            const lines = [
                // Near plane rectangle
                [new Vector3(nearTopLeft.x, nearTopLeft.y, nearTopLeft.z), new Vector3(nearTopRight.x, nearTopRight.y, nearTopRight.z)],
                [new Vector3(nearTopRight.x, nearTopRight.y, nearTopRight.z), new Vector3(nearBottomRight.x, nearBottomRight.y, nearBottomRight.z)],
                [new Vector3(nearBottomRight.x, nearBottomRight.y, nearBottomRight.z), new Vector3(nearBottomLeft.x, nearBottomLeft.y, nearBottomLeft.z)],
                [new Vector3(nearBottomLeft.x, nearBottomLeft.y, nearBottomLeft.z), new Vector3(nearTopLeft.x, nearTopLeft.y, nearTopLeft.z)],
                
                // Far plane rectangle
                [new Vector3(farTopLeft.x, farTopLeft.y, farTopLeft.z), new Vector3(farTopRight.x, farTopRight.y, farTopRight.z)],
                [new Vector3(farTopRight.x, farTopRight.y, farTopRight.z), new Vector3(farBottomRight.x, farBottomRight.y, farBottomRight.z)],
                [new Vector3(farBottomRight.x, farBottomRight.y, farBottomRight.z), new Vector3(farBottomLeft.x, farBottomLeft.y, farBottomLeft.z)],
                [new Vector3(farBottomLeft.x, farBottomLeft.y, farBottomLeft.z), new Vector3(farTopLeft.x, farTopLeft.y, farTopLeft.z)],
                
                // Connecting lines from near to far
                [new Vector3(nearTopLeft.x, nearTopLeft.y, nearTopLeft.z), new Vector3(farTopLeft.x, farTopLeft.y, farTopLeft.z)],
                [new Vector3(nearTopRight.x, nearTopRight.y, nearTopRight.z), new Vector3(farTopRight.x, farTopRight.y, farTopRight.z)],
                [new Vector3(nearBottomLeft.x, nearBottomLeft.y, nearBottomLeft.z), new Vector3(farBottomLeft.x, farBottomLeft.y, farBottomLeft.z)],
                [new Vector3(nearBottomRight.x, nearBottomRight.y, nearBottomRight.z), new Vector3(farBottomRight.x, farBottomRight.y, farBottomRight.z)],
                
                // Camera position to near corners (to show viewing direction)
                [new Vector3(babylonPosition.x, babylonPosition.y, babylonPosition.z), new Vector3(nearTopLeft.x, nearTopLeft.y, nearTopLeft.z)],
                [new Vector3(babylonPosition.x, babylonPosition.y, babylonPosition.z), new Vector3(nearTopRight.x, nearTopRight.y, nearTopRight.z)],
                [new Vector3(babylonPosition.x, babylonPosition.y, babylonPosition.z), new Vector3(nearBottomLeft.x, nearBottomLeft.y, nearBottomLeft.z)],
                [new Vector3(babylonPosition.x, babylonPosition.y, babylonPosition.z), new Vector3(nearBottomRight.x, nearBottomRight.y, nearBottomRight.z)]
            ];
            
            // Create wireframe using tubes - much thinner for better visibility
            const tubeRadius = Math.max(nearDistance * 0.001, 1000); // 0.1% of near distance, min 1km
            const frustumMeshes = [];
            
            // Create tubes for each line
            for (const line of lines) {
                const path = [line[0], line[1]]; // line already contains Vector3 objects
                
                try {
                    const tube = MeshBuilder.CreateTube(
                        `debug_frustum_line_${frustumMeshes.length}`, 
                        {
                            path: path,
                            radius: tubeRadius,
                            tessellation: 8,
                            cap: 3 // Both caps
                        }, 
                        this.scene
                    );
                    frustumMeshes.push(tube);
                } catch (error) {
                    // Fallback to line if tube creation fails
                    console.warn('Tube creation failed, using line:', error);
                }
            }
            
            // If no tubes were created, fallback to line system
            if (frustumMeshes.length === 0) {
                const frustumMesh = MeshBuilder.CreateLineSystem('debug_frustum', { lines: lines }, this.scene);
                frustumMeshes.push(frustumMesh);
            }
            
            // Apply material to all frustum meshes
            const material = new StandardMaterial('debug_frustum_material', this.scene);
            material.diffuseColor = restrictive ? new Color3(1, 0, 1) : new Color3(0, 1, 1); // Magenta for restrictive, cyan for normal
            material.emissiveColor = restrictive ? new Color3(0.5, 0, 0.5) : new Color3(0, 0.5, 0.5); // Make it glow
            material.alpha = 0.25; // 75% transparent (25% opaque)
            material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
            
            for (const mesh of frustumMeshes) {
                mesh.material = material;
                // Set visibility based on frustumVisible flag
                mesh.setEnabled(this.frustumVisible);
            }
            
            // console.log(`🔺 FRUSTUM VISUALIZATION: Created Cesium default frustum`);
            // console.log(`   Near: ${nearDistance}m (${nearWidth.toFixed(1)}×${nearHeight.toFixed(1)}m)`);
            // console.log(`   Far: ${farDistance/1000000}Mkm (${farWidth/1000000}×${farHeight/1000000}Mkm)`);
            // console.log(`   Camera position: (${babylonPosition.x.toFixed(0)}, ${babylonPosition.y.toFixed(0)}, ${babylonPosition.z.toFixed(0)})`);
            // console.log(`🔍 === END FRUSTUM DEBUG ===\n`);
            
        } catch (error) {
            console.error('Failed to create frustum visualization:', error);
        }
    }

    /**
     * Create a sphere at the exact camera position for debugging - ONLY ONCE
     */
    private createCameraPositionSphere(babylonPosition: Vector3): void {
        try {
            // Check if sphere already exists (shouldn't happen with our new logic, but safety check)
            const existingSphere = this.scene.getMeshByName("cameraPositionSphere");
            if (existingSphere) {
                console.log(`🔴 CAMERA SPHERE: Already exists, not recreating`);
                return;
            }

            // Create a bright sphere at the exact camera position
            const sphere = MeshBuilder.CreateSphere("cameraPositionSphere", {
                diameter: 100000 // 100km diameter so it's visible
            }, this.scene);

            sphere.position = babylonPosition.clone();

            // Make it bright wireframe for consistency with other debug spheres
            const material = new StandardMaterial("cameraSphereMaterial", this.scene);
            material.diffuseColor = new Color3(1, 0, 0); // Bright red
            material.emissiveColor = new Color3(0.5, 0, 0); // Red glow
            material.wireframe = true; // WIREFRAME for consistency 
            material.backFaceCulling = false; // Show from all angles
            material.disableLighting = true;
            sphere.material = material;

            console.log(`🔴 CAMERA SPHERE: Created ONCE at Babylon position (${babylonPosition.x}, ${babylonPosition.y}, ${babylonPosition.z})`);

        } catch (error) {
            console.error('Failed to create camera position sphere:', error);
        }
    }

    /**
     * Load Google Photorealistic 3D Tiles
     */
    async loadGooglePhotorealistic3DTiles(): Promise<void> {
        await this.loadTileset(2275207);
    }

    /**
     * Load OSM Buildings 3D Tiles
     */
    async loadOSMBuildings3DTiles(): Promise<void> {
        await this.loadTileset(96188);
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            frameCount: this.frameCount,
            selectedTiles: this.cesiumTileset?.selectedTiles?.length || 0,
            tilesetReady: this.cesiumTileset?.ready || false,
            statistics: this.cesiumTileset?.statistics,
            debugSpheresEnabled: this.debugSpheresEnabled
        };
    }

    /**
     * DEBUG: Analyze a clicked tile mesh to understand why it might not be hidden
     */
    analyzePickedTile(pickedMesh: any) {
        if (!this.cesiumTileset || !this.cesiumTileset._loadedTiles) {
            console.log("   🔍 TILE ANALYSIS: No tileset or loaded tiles available");
            return;
        }

        console.log("   🔍 TILE ANALYSIS: Searching for corresponding tile...");
        
        // Find the tile that owns this mesh by searching through loaded content
        let foundTile = null;
        for (const [tileId, tileContent] of this.cesiumTileset._loadedTiles) {
            if (tileContent._meshes && tileContent._meshes.includes(pickedMesh)) {
                foundTile = tileContent._tile;
                break;
            }
        }

        if (!foundTile) {
            console.log("   ❌ Could not find corresponding tile for this mesh");
            return;
        }

        // Analyze the found tile
        const tile = foundTile;
        const tileContent = tile._content;
        
        console.log("   📋 FOUND TILE INFO:");
        console.log(`      Tile ID: ${tile.id || 'unknown'}`);
        console.log(`      Depth: ${tile._depth}`);
        console.log(`      Refine: ${tile.refine === 1 ? 'REPLACE' : 'ADD'}`);
        console.log(`      Has children: ${tile.children?.length || 0}`);
        console.log(`      Content available: ${tile.contentAvailable}`);
        console.log(`      Content show: ${tileContent?.show}`);
        console.log(`      Mesh visible: ${pickedMesh.isVisible}`);
        console.log(`      SSE: ${tile._screenSpaceError?.toFixed(1)}`);
        console.log(`      Distance: ${tile._distanceToCamera?.toFixed(0)}m`);

        // If this tile has children, analyze why it's not hidden
        if (tile.children && tile.children.length > 0) {
            console.log("   👶 CHILDREN ANALYSIS:");
            tile.children.forEach((child: any, i: number) => {
                console.log(`      Child ${i+1}: contentAvailable=${child.contentAvailable}, SSE=${child._screenSpaceError?.toFixed(1)}, distance=${child._distanceToCamera?.toFixed(0)}m, visible=${child.isVisible}`);
            });

            const readyChildren = tile.children.filter((child: any) => child.contentAvailable);
            if (readyChildren.length === 0) {
                console.log("   ✅ PARENT CORRECTLY VISIBLE: No children are ready yet");
            } else {
                console.log(`   ⚠️ PARENT SHOULD BE HIDDEN: ${readyChildren.length}/${tile.children.length} children are ready but parent is still visible!`);
            }
        } else {
            console.log("   ✅ LEAF TILE: No children, correctly visible");
        }

        // 👻 CLICK DEBUG: Make the clicked tile invisible for debugging
        console.log("   👻 MAKING CLICKED TILE INVISIBLE for debugging...");
        
        // Hide the specific mesh that was clicked
        pickedMesh.isVisible = false;
        console.log(`   👻 Hidden clicked mesh: ${pickedMesh.name}`);
        
        // Also hide all meshes from the same tile content for complete debugging
        for (const [tileId, tileContent] of this.cesiumTileset._loadedTiles) {
            if (tileContent._meshes && tileContent._meshes.includes(pickedMesh)) {
                tileContent._meshes.forEach((mesh: any) => {
                    if (mesh && mesh !== pickedMesh) {
                        mesh.isVisible = false;
                        console.log(`   👻 Hidden tile mesh: ${mesh.name}`);
                    }
                });
                break;
            }
        }
        
        console.log("   👻 Clicked tile is now invisible - you can see what's behind it!");
    }

    /**
     * Check if debug spheres are enabled
     */
    get isDebugSpheresEnabled(): boolean {
        return this.debugSpheresEnabled;
    }

    /**
     * Create a Cesium-compatible camera object with proper updateMembers() pattern
     * Based on Cesium Camera.js updateMembers() function
     */
    private createCesiumCompatibleCamera(staticCameraData: any): any {
        // Use imported Cesium classes - they're already imported at the top of the file

        // CESIUM PATTERN: Initialize camera state like real Cesium Camera constructor
        const camera: any = {
            // Internal state variables (like Cesium Camera)
            _mode: SceneMode.SCENE3D,
            _transform: Matrix4.IDENTITY.clone(),
            _actualTransform: Matrix4.IDENTITY.clone(),
            _transformChanged: false,
            _modeChanged: false,

            // Camera base vectors (input coordinates)
            position: staticCameraData.cesiumPosition.clone(),
            direction: Cartesian3.normalize(staticCameraData.cesiumDirection.clone(), new Cartesian3()),
            up: Cartesian3.normalize(staticCameraData.cesiumUp.clone(), new Cartesian3()),
            right: Cartesian3.normalize(staticCameraData.cesiumRight.clone(), new Cartesian3()),

            // Internal state vectors
            _position: new Cartesian3(),
            _direction: new Cartesian3(),
            _up: new Cartesian3(),
            _right: new Cartesian3(),

            // World coordinate vectors (computed by updateMembers)
            _positionWC: new Cartesian3(),
            _directionWC: new Cartesian3(),
            _upWC: new Cartesian3(),
            _rightWC: new Cartesian3(),

            // Other required properties
            positionCartographic: staticCameraData.positionCartographic,
            
            // CRITICAL: Camera movement detection properties for tile refinement
            // Force Cesium's traversal to treat camera as "just moved significantly"
            timeSinceMoved: 0.0,  // Camera just moved (triggers immediate tile refinement)
            positionWCDeltaMagnitude: 1000.0,  // Significant movement magnitude
            positionWCDeltaMagnitudeLastFrame: 0.0,
            
            // Create frustum with validation
            frustum: (() => {
                const width = this.engine.getRenderWidth();
                const height = this.engine.getRenderHeight();
                const aspectRatio = width / height;
                
                // Validate frustum parameters
                if (!isFinite(aspectRatio) || aspectRatio <= 0) {
                    console.error('Invalid aspect ratio:', aspectRatio, 'width:', width, 'height:', height);
                    throw new Error('Invalid aspect ratio for frustum');
                }
                
                // console.log(`📐 Creating frustum: width=${width}, height=${height}, aspect=${aspectRatio.toFixed(3)}`);
                
                // CESIUM AUTHORITATIVE: Match Cesium's adaptive FOV behavior exactly
                // From Cesium source: "horizontal FOV if width > height, otherwise vertical FOV"
                // Cesium.Math.PI_OVER_THREE = Math.PI / 3.0 = 60 degrees
                const cesiumDefaultFOV = Math.PI / 3.0; // Cesium's PI_OVER_THREE
                
                // Babylon always uses vertical FOV, so we need to match what Cesium expects
                let babylonVerticalFOV: number;
                if (aspectRatio > 1) {
                    // Landscape: Cesium treats 60° as horizontal, convert to Babylon's vertical
                    babylonVerticalFOV = 2 * Math.atan(Math.tan(cesiumDefaultFOV / 2) / aspectRatio);
                } else {
                    // Portrait: Cesium treats 60° as vertical, use directly
                    babylonVerticalFOV = cesiumDefaultFOV;
                }
                
                // Update Babylon camera to match what Cesium expects
                this.camera.fov = babylonVerticalFOV;
                
                // Use Cesium's default FOV directly
                const cesiumFOV = cesiumDefaultFOV;
                
                const frustum = new PerspectiveFrustum({
                    fov: cesiumFOV, // Use converted FOV for proper Babylon/Cesium alignment
                    aspectRatio: aspectRatio,
                    near: 1.0, // 1 meter - Cesium's exact default
                    far: 500000000.0, // 500M km - Cesium's Earth-scale default
                    xOffset: 0,
                    yOffset: 0
                });
                
                // CRITICAL: Trigger frustum's internal update by accessing sseDenominator getter
                // This calculates _sseDenominator and prevents "scale must be a finite number" errors
                const sseDenominator = (frustum as any).sseDenominator;
                
                // console.log(`📐 Frustum created and updated: sseDenominator=${sseDenominator}`);
                
                return frustum;
            })()
        };

        // CESIUM PATTERN: Implement updateMembers() logic with validation
        const updateMembers = () => {
            const position = camera.position;
            const direction = camera.direction;
            const up = camera.up;
            const right = camera.right;

            // STEP 1: Copy and validate vectors before normalization
            Cartesian3.clone(position, camera._position);
            
            // Validate and normalize direction - must not be zero length
            const dirMagnitude = Cartesian3.magnitude(direction);
            if (dirMagnitude > 0) {
                Cartesian3.divideByScalar(direction, dirMagnitude, camera._direction);
            } else {
                // Fallback to -Z direction if invalid
                Cartesian3.clone(new Cartesian3(0, 0, -1), camera._direction);
                console.warn('Invalid direction vector, using fallback');
            }
            
            // Validate and normalize up - must not be zero length  
            const upMagnitude = Cartesian3.magnitude(up);
            if (upMagnitude > 0) {
                Cartesian3.divideByScalar(up, upMagnitude, camera._up);
            } else {
                // Fallback to +Y up if invalid
                Cartesian3.clone(new Cartesian3(0, 1, 0), camera._up);
                console.warn('Invalid up vector, using fallback');
            }
            
            // Validate and normalize right - must not be zero length
            const rightMagnitude = Cartesian3.magnitude(right);
            if (rightMagnitude > 0) {
                Cartesian3.divideByScalar(right, rightMagnitude, camera._right);
            } else {
                // Fallback to +X right if invalid
                Cartesian3.clone(new Cartesian3(1, 0, 0), camera._right);
                console.warn('Invalid right vector, using fallback');
            }

            // STEP 2: Apply transform matrix to get world coordinates (Identity transform in SCENE3D)
            // Since we're in SCENE3D mode, _actualTransform should be IDENTITY, so this is just copying
            Cartesian3.clone(camera._position, camera._positionWC);
            Cartesian3.clone(camera._direction, camera._directionWC);  
            Cartesian3.clone(camera._up, camera._upWC);
            Cartesian3.clone(camera._right, camera._rightWC);
            
            // Final validation - ensure no NaN or infinite values
            if (!isFinite(camera._positionWC.x) || !isFinite(camera._positionWC.y) || !isFinite(camera._positionWC.z)) {
                console.error('Invalid positionWC:', camera._positionWC);
            }
            if (!isFinite(camera._directionWC.x) || !isFinite(camera._directionWC.y) || !isFinite(camera._directionWC.z)) {
                console.error('Invalid directionWC:', camera._directionWC);
            }
        };

        // CESIUM PATTERN: Add getters and methods directly to avoid TypeScript issues
        (camera as any).getPixelSize = (boundingSphere: any) => {
            if (!boundingSphere) {
                throw new Error("boundingSphere is required.");
            }
            
            const drawingBufferWidth = this.engine.getRenderWidth();
            const drawingBufferHeight = this.engine.getRenderHeight();
            
            if (!drawingBufferWidth || !drawingBufferHeight) {
                throw new Error("drawingBufferWidth and drawingBufferHeight are required.");
            }
            
            // Calculate distance from camera to front of the bounding sphere
            updateMembers(); // Ensure coordinates are up to date
            const cameraPos = camera._positionWC;
            const cameraDir = camera._directionWC;
            
            // Vector from camera position to sphere center
            const toCenter = Cartesian3.subtract(cameraPos, boundingSphere.center, new Cartesian3());
            
            // Project this vector onto the camera's direction vector
            const dot = Cartesian3.dot(toCenter, cameraDir);
            const proj = Cartesian3.multiplyByScalar(cameraDir, dot, new Cartesian3());
            
            // Distance to front of sphere (ensuring it's not negative)
            const distance = Math.max(0.0, Cartesian3.magnitude(proj) - boundingSphere.radius);
            
            // Get pixel dimensions from the frustum
            const pixelSize = camera.frustum.getPixelDimensions(
                drawingBufferWidth,
                drawingBufferHeight,
                distance,
                1.0, // pixelRatio
                new Cartesian2()
            );
            
            // Return the maximum of x and y pixel dimensions
            return Math.max(pixelSize.x, pixelSize.y);
        };

        // CESIUM PATTERN: Add getter properties
        Object.defineProperty(camera, 'positionWC', {
            get: function() {
                updateMembers();
                return this._positionWC;
            }
        });

        Object.defineProperty(camera, 'directionWC', {
            get: function() {
                updateMembers();
                return this._directionWC;
            }
        });

        Object.defineProperty(camera, 'upWC', {
            get: function() {
                updateMembers();
                return this._upWC;
            }
        });

        Object.defineProperty(camera, 'rightWC', {
            get: function() {
                updateMembers();
                return this._rightWC;
            }
        });

        // CESIUM EXACT: Add ellipsoid property for proper horizon culling
        // EllipsoidalOccluder requires access to scene.ellipsoid for horizon culling
        camera._scene = {
            ellipsoid: Ellipsoid.WGS84,  // Use Earth's WGS84 ellipsoid for horizon culling
            // Add other properties that might be needed by horizon culling
            mode: SceneMode.SCENE3D
        };

        // Initialize the camera by calling updateMembers once
        try {
            updateMembers();
            // console.log(`🎥 CESIUM CAMERA CREATED: position=(${camera._positionWC.x.toFixed(0)}, ${camera._positionWC.y.toFixed(0)}, ${camera._positionWC.z.toFixed(0)}), direction=(${camera._directionWC.x.toFixed(3)}, ${camera._directionWC.y.toFixed(3)}, ${camera._directionWC.z.toFixed(3)})`);
        } catch (error) {
            console.error('Error during updateMembers():', error);
            console.error('Input vectors:', {
                position: staticCameraData.cesiumPosition,
                direction: staticCameraData.cesiumDirection,
                up: staticCameraData.cesiumUp,
                right: staticCameraData.cesiumRight
            });
        }

        return camera;
    }
}