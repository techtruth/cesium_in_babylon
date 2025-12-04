import { Camera, Engine, Vector3, Matrix, MeshBuilder, StandardMaterial, Color3, Scene, Mesh } from '@babylonjs/core';
import * as Cesium from 'cesium';
import { SimpleBabylonTileContent } from './SimpleBabylonTileContent';
import CesiumTilesetDerived from './cesium_derived/CesiumTilesetDerived.js';

/**
 * Simple Cesium + Babylon integration - trust Cesium completely
 */
export class SimpleIntegration {
    private camera: Camera;
    private engine: Engine;
    private babylonScene: any;
    private cesiumTileset?: CesiumTilesetDerived;
    private renderTilesetPassState: any;
    private frameCount: number = 0;
    private lastFrameNumber: number = 0;

    constructor(babylonScene: any, camera: Camera, engine: Engine) {
        this.camera = camera;
        this.engine = engine;
        this.babylonScene = babylonScene;
        
        // Set up Cesium Ion authentication using native Cesium
        // TODO: Update with your new Cesium Ion token from https://cesium.com/ion/tokens
        Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4ZWNjOTdkOS03ODQ2LTRiYzAtOGNiZC0yMmUwY2ZiOTM2M2MiLCJpZCI6MjIwODczLCJpYXQiOjE3NjQ2OTMxODh9.QlACQnWP4oWZCFQKuR2FXWw_KiLJwm9wsg6U6ynqIw4';
        
        // BABYLON.JS: Set up proper Cesium content factory registration
        this.setupBabylonContentFactory();
        
        // CRITICAL FIX: Increase RequestScheduler limits for Google 3D Tiles
        this.optimizeRequestSchedulerForGoogle3DTiles();
        
        // Create reusable pass state exactly like Cesium Scene does
        // Access internal classes through Cesium namespace
        const Cesium3DTilePassState = (Cesium as any).Cesium3DTilePassState;
        const Cesium3DTilePass = (Cesium as any).Cesium3DTilePass;
        
        this.renderTilesetPassState = new Cesium3DTilePassState({
            pass: Cesium3DTilePass.RENDER,
            commandList: [], // Required by CesiumTilesetDerived.js
            camera: null, // Will be set during update
            cullingVolume: null // Will be set during update  
        });
    }

    /**
     * Create Cesium camera with proper vector calculations
     */
    private createCesiumCamera(): any {
        const babylonPos = this.camera.position;
        
        // For UniversalCamera, get the actual look direction from position to target
        const babylonTarget = this.camera.getTarget();
        const babylonDir = babylonTarget.subtract(babylonPos).normalize();
        const babylonUp = this.camera.upVector || Vector3.Up();

        // Simple coordinate transformation: Babylon → Cesium ECEF
        const position = new Cesium.Cartesian3(babylonPos.x, -babylonPos.z, babylonPos.y);
        
        // Transform direction vector (from camera toward target)
        const direction = new Cesium.Cartesian3(babylonDir.x, -babylonDir.z, babylonDir.y);
        Cesium.Cartesian3.normalize(direction, direction);
        
        const up = new Cesium.Cartesian3(babylonUp.x, -babylonUp.z, babylonUp.y);
        Cesium.Cartesian3.normalize(up, up);
        
        // Calculate right vector
        const right = new Cesium.Cartesian3();
        Cesium.Cartesian3.cross(direction, up, right);
        Cesium.Cartesian3.normalize(right, right);
        
        // Recalculate up to ensure orthogonality
        Cesium.Cartesian3.cross(right, direction, up);
        Cesium.Cartesian3.normalize(up, up);
        
        // Create frustum
        const frustum = new Cesium.PerspectiveFrustum({
            fov: this.camera.fov,
            aspectRatio: this.engine.getRenderWidth() / this.engine.getRenderHeight(),
            near: this.camera.minZ, // Now consistent: both use 0.1
            far: this.camera.maxZ
        });

        // Calculate cartographic position for geographic reference
        const positionCartographic = Cesium.Cartographic.fromCartesian(position, Cesium.Ellipsoid.WGS84);

        return {
            // Basic vectors
            position,
            direction,
            up,
            right,
            frustum,
            // World coordinate versions
            positionWC: position,
            directionWC: direction,
            upWC: up,
            rightWC: right,
            // CRITICAL: Camera movement detection properties for tile refinement
            timeSinceMoved: 0.0,  // Just moved, trigger tile refinement
            positionWCDeltaMagnitude: 1000.0,  // Significant movement detected
            positionWCDeltaMagnitudeLastFrame: 0.0,  // Previous frame delta
            // Additional properties from working commit
            positionCartographic: positionCartographic
        };
    }

    /**
     * Load Google Photorealistic 3D Tiles using Cesium's exact configuration
     */
    async loadGooglePhotorealistic3DTiles(assetId: number): Promise<void> {
        try {
            // Use Cesium's standard approach exactly - but with our derived tileset
            const resource = await Cesium.IonResource.fromAssetId(assetId);
            
            // NATIVE CESIUM GOOGLE 3D TILES CONFIG: Match createGooglePhotorealistic3DTileset exactly
            console.log('🎯 Using native Cesium config - trusting dynamic SSE system');
            this.cesiumTileset = await CesiumTilesetDerived.fromUrl(resource, {
                // ONLY settings that createGooglePhotorealistic3DTileset actually sets:
                cacheBytes: 1536 * 1024 * 1024,              // 1.5GB (Google-optimized)
                maximumCacheOverflowBytes: 1024 * 1024 * 1024, // 1GB (Google-optimized)
                enableCollision: true,                        // Official Google config
                
                // CESIUM DEFAULT: Use correct value for Google tiles' geometric error scale (262k-525k range)
                maximumScreenSpaceError: 16,                  // Restored to Cesium default - Google tiles optimized for this value
                                
                show: true,
                shadows: 1  // ShadowMode.ENABLED
            }) as CesiumTilesetDerived;
            
            // Credits disabled in creditDisplay to prevent image downloads
            
            // Google Photorealistic 3D Tiles created, waiting for ready...
            
            // Wait for the tileset to be fully ready (like Cesium Scene does)
            await this.cesiumTileset.readyPromise;
            
            // Google Photorealistic 3D Tiles ready!
            
            // CESIUM EXACT: Observe natural tile state without manipulation
            this.observeRootTileState();
            
        } catch (error) {
            console.error('Failed to load Google Photorealistic 3D Tiles:', error);
            throw error;
        }
    }

    /**
     * Load any Cesium Ion asset with default tileset configuration
     */
    async loadCesiumIonAsset(assetId: number, description: string = 'Cesium Ion Asset'): Promise<void> {
        try {
            // Use standard Cesium Ion asset loading
            const resource = await Cesium.IonResource.fromAssetId(assetId);
            
            console.log(`🎯 Loading ${description} (Asset ID: ${assetId})`);
            this.cesiumTileset = await CesiumTilesetDerived.fromUrl(resource, {
                // Use Cesium defaults for all settings
                show: true,
                shadows: 1  // ShadowMode.ENABLED
            }) as CesiumTilesetDerived;
            
            // Wait for the tileset to be fully ready
            await this.cesiumTileset.readyPromise;
            
            console.log(`${description} ready!`);
            
            // Observe natural tile state
            this.observeRootTileState();
            
        } catch (error) {
            console.error(`Failed to load ${description}:`, error);
            throw error;
        }
    }

    /**
     * Update tileset with frame counting like working commit 72dfb2e
     */
    update(): void {
        this.frameCount++;
        
        if (!this.cesiumTileset) {
            console.log('⏳ No tileset yet...');
            return;
        }
        
        // Use native Cesium pattern - tileset is ready when root and asset exist
        if (!this.cesiumTileset.root || !this.cesiumTileset.asset) {
            console.log('⏳ Tileset loading...');
            return;
        }

        // Check if camera updates are paused (spacebar control)
        if (this.cameraUpdatePaused && !this.forceOneUpdate) {
            return; // Skip update when paused
        }
        
        if (this.forceOneUpdate) {
            this.forceOneUpdate = false; // Reset force flag
        }

        const camera = this.createCesiumCamera();

        let cullingVolume;
        try {
            // Restore culling volume computation - Cesium requires this for tile visibility
            cullingVolume = camera.frustum.computeCullingVolume(camera.position, camera.direction, camera.up);
            
            // Validate culling volume has required methods
            if (!cullingVolume || typeof cullingVolume.computeVisibilityWithPlaneMask !== 'function') {
                console.error('❌ Invalid culling volume - missing computeVisibilityWithPlaneMask method');
                return;
            }
            
            // DEBUG: Log culling volume properties for analysis
            // Removed frequent culling volume debug logging
        } catch (error) {
            console.error('❌ Failed to compute culling volume:', error);
            console.error('   This will break tile visibility - stopping update');
            return;
        }

        // VISUALIZE CESIUM FRUSTUM: Create visual markers in Babylon coordinate space  
        this.visualizeCesiumFrustum(camera, camera.frustum);

        // Update pass state with current camera and culling volume
        this.renderTilesetPassState.camera = camera;
        this.renderTilesetPassState.cullingVolume = cullingVolume;

        // Complete frameState matching working commit 72dfb2e, using Cesium's default SSE
        const frameState = {
            camera: camera,
            context: {
                drawingBufferWidth: this.engine.getRenderWidth(),
                drawingBufferHeight: this.engine.getRenderHeight()
            },
            cullingVolume: cullingVolume,
            mode: Cesium.SceneMode.SCENE3D,
            frameNumber: ++this.frameCount,
            // CRITICAL: Add JulianDate time for BaseTraversal tile prioritization
            time: Cesium.JulianDate.now(),
            // CESIUM EXACT: newFrame flag - true only for actual new frames
            newFrame: this.frameCount !== this.lastFrameNumber,
            // CRITICAL: Add pass information that SkipTraversal needs
            pass: (Cesium as any).Pass ? (Cesium as any).Pass.RENDER : 0,
            // Let Cesium use its default maximumScreenSpaceError for Google tiles
            tilesetPassState: this.renderTilesetPassState, // Required by CesiumTilesetDerived
            // CREDIT DISPLAY: Disabled to prevent image downloads
            creditDisplay: {
                addCreditToNextFrame: (_credit: any) => {
                    // Don't process credits to avoid downloading credit images
                }
            },
            // Additional properties from working commit 72dfb2e:
            pixelRatio: 1.0,
            mapProjection: new Cesium.GeographicProjection(),
            verticalExaggeration: 1.0,
            verticalExaggerationRelativeHeight: 0.0,
            commandList: [],
            morphTime: 1.0,
            minimumTerrainHeight: -11000.0,
            occluder: undefined,  // Cesium will populate if needed
            // CRITICAL: Add afterRender function that SkipTraversal may need
            afterRender: []
        };

        try {            
                        
            // Set up load timestamp if needed (from prePassesUpdate)
            if (!(this.cesiumTileset as any)._loadTimestamp) {
                (this.cesiumTileset as any)._loadTimestamp = Cesium.JulianDate.clone(frameState.time);
            }
            
            // Calculate time since load (from prePassesUpdate) 
            const timeSinceLoad = Math.max(
                Cesium.JulianDate.secondsDifference(frameState.time, (this.cesiumTileset as any)._loadTimestamp) * 1000,
                0.0
            );
            (this.cesiumTileset as any)._timeSinceLoad = timeSinceLoad;
            
            // NATIVE CESIUM PATTERN: Follow exact sequence like native Cesium Scene
            // 1. prePassesUpdate() - processes tiles in PROCESSING state to READY
            if (typeof (this.cesiumTileset as any).prePassesUpdate === 'function') {
                (this.cesiumTileset as any).prePassesUpdate(frameState);
            }
            
            // 2. main update() - traversal, selection, and content loading
            this.cesiumTileset.update(frameState);
            
            // 2.1. NATIVE CLEANUP PATTERN: Hide meshes for unselected tiles
            // This mimics Cesium's native behavior where unselected tiles don't render
            this.cleanupUnselectedTileMeshes(frameState.frameNumber);
            
            // 3. postPassesUpdate() - cleanup, request scheduling, cache management
            (this.cesiumTileset as any).postPassesUpdate(frameState);
            
            // 4. Apply transforms to selected tiles after Cesium processing
            this.applyTransformsToSelectedTiles();
            
            // 5. Update bounding volume wireframes if visible
            if (this.showBoundingVolumes) {
                this.createBoundingVolumeWireframes();
            }
            
            // 6. Update frustum wireframe if visible
            if (this.showFrustumWireframe) {
                this.createFrustumWireframe();
            }
            
            // Update frame tracking for next frame
            this.lastFrameNumber = this.frameCount;
        } catch (error) {
            console.error('Error updating tileset:', error);
        }
    }

    /**
     * BABYLON.JS: Set up proper Cesium content factory to create BabylonTileContent
     */
    private setupBabylonContentFactory(): void {
        console.log('🏗️ Setting up Babylon content factory...');
        
        const Cesium3DTileContentFactory = (Cesium as any).Cesium3DTileContentFactory;
        
        const babylonScene = this.camera.getScene();
        
        // CESIUM EXACT PATTERN: Replace factory methods with our implementations
        // Following the exact same approach as Cesium's Cesium3DTileContentFactory.js
        
        // Replace B3DM factory method  
        Cesium3DTileContentFactory.b3dm = function(tileset: any, tile: any, resource: any, arrayBuffer: ArrayBuffer, byteOffset: number) {
            // Factory call logged silently to reduce console spam
            return SimpleBabylonTileContent.fromB3dm(tileset, tile, resource, arrayBuffer, byteOffset, babylonScene);
        };
        
        // Replace GLB factory method
        // Send whole arraydata? Yes?
        Cesium3DTileContentFactory.glb = function(tileset: any, tile: any, resource: any, arrayBuffer: ArrayBuffer, byteOffset: number) {
            // Extract GLB data from the offset
            const glbData = arrayBuffer.slice(byteOffset);
            return SimpleBabylonTileContent.fromGltf(tileset, tile, resource, glbData, babylonScene);
        };
        
        console.log(`✅ Babylon factory ready`);
    }
    
    /**
     * CESIUM EXACT: Observe natural tile state without manipulation
     */
    private observeRootTileState(): void {
        if (!this.cesiumTileset || !this.cesiumTileset.root) {
            console.log('❌ Cannot observe root tile - no tileset or root tile');
            return;
        }

        const rootTile = this.cesiumTileset.root;
        
        console.log('🔍 NATURAL ROOT TILE STATE (no manipulation):', {
            hasRenderableContent: rootTile.hasRenderableContent,
            hasEmptyContent: rootTile.hasEmptyContent,
            contentState: rootTile._contentState,
            hasContent: !!rootTile._content,
            contentAvailable: rootTile.contentAvailable,
            refinement: rootTile.refine === 1 ? 'REPLACE' : rootTile.refine,
            contentUrl: rootTile._contentResource?.url || 'none'
        });
        
        // OBSERVATION ONLY: Note what Cesium naturally sets
        if (rootTile._content && !rootTile.hasRenderableContent) {
            console.log('🏗️ OBSERVATION: Tile has content but hasRenderableContent=false');
            console.log(`   hasEmptyContent=${rootTile.hasEmptyContent} (Cesium's natural setting)`);
            console.log('   Trusting Cesium to handle this via executeEmptyTraversal');
        }        
    }
               
    /**
     * CRITICAL FIX: Optimize RequestScheduler for Google 3D Tiles massive tile hierarchy
     */
    private optimizeRequestSchedulerForGoogle3DTiles(): void {
        const RequestScheduler = (Cesium as any).RequestScheduler;
        if (!RequestScheduler) {
            console.error('❌ RequestScheduler not found - cannot optimize');
            return;
        }
        
        const originalLimits = {
            maximumRequests: RequestScheduler.maximumRequests,
            maximumRequestsPerServer: RequestScheduler.maximumRequestsPerServer
        };
        
        // CRITICAL: Increase limits specifically for Google 3D Tiles hierarchical loading
        // Google Photorealistic 3D Tiles have deep hierarchies that need many simultaneous requests
        RequestScheduler.maximumRequests = 100;           // Default: 50, increase for parallel loading
        RequestScheduler.maximumRequestsPerServer = 36;   // Default: 18, increase for Google tiles
        
        console.log('🚀 OPTIMIZED RequestScheduler for Google 3D Tiles:', {
            before: originalLimits,
            after: {
                maximumRequests: RequestScheduler.maximumRequests,
                maximumRequestsPerServer: RequestScheduler.maximumRequestsPerServer
            },
            improvement: `${((RequestScheduler.maximumRequests / originalLimits.maximumRequests) * 100).toFixed(0)}% more total requests, ${((RequestScheduler.maximumRequestsPerServer / originalLimits.maximumRequestsPerServer) * 100).toFixed(0)}% more per server`
        });
        
        // ADDITIONAL: Disable throttling for critical requests if available
        if ('throttleRequests' in RequestScheduler && RequestScheduler.throttleRequests !== false) {
            console.log('📡 DISABLING RequestScheduler throttling for maximum loading speed');
            RequestScheduler.throttleRequests = false;
        }
        
        // TIMING: Reduce request delays if configurable
        const schedulerProps = ['requestDelayOnFailure', 'maximumRequestDelay', 'minimumRequestDelay'];
        schedulerProps.forEach(prop => {
            if (prop in RequestScheduler && RequestScheduler[prop] > 100) {
                const original = RequestScheduler[prop];
                RequestScheduler[prop] = Math.min(100, RequestScheduler[prop] / 2);
                console.log(`⏱️ OPTIMIZED ${prop}: ${original}ms → ${RequestScheduler[prop]}ms`);
            }
        });
    }

    
    /**
     * Clean up
     */
    destroy(): void {
        if (this.cesiumTileset && !this.cesiumTileset.isDestroyed()) {
            this.cesiumTileset.destroy();
        }
    }

    /**
     * NATIVE CESIUM CLEANUP PATTERN: Hide meshes for tiles not selected by Cesium
     * This follows the exact pattern discovered from Model3DTileContent research:
     * - Cesium only calls update() on selected tiles via updateTiles()
     * - For unselected tiles, we need to clean up and hide their meshes
     * - This mimics how Cesium's native models get hidden when their tiles aren't selected
     */
    private cleanupUnselectedTileMeshes(currentFrame: number): void {
        if (!this.cesiumTileset || !this.cesiumTileset.root) return;

        // Traverse all tiles with content to check their selection state
        const visitTile = (tile: any) => {
            if (tile._content && 
                tile._content.constructor.name === 'SimpleBabylonTileContent' &&
                typeof tile._content.checkAndHideIfNotSelected === 'function') {
                
                // Call the native cleanup pattern on each tile content
                tile._content.checkAndHideIfNotSelected(currentFrame);
            }
            
            // Recursively visit children
            if (tile.children && tile.children.length > 0) {
                tile.children.forEach(visitTile);
            }
        };

        // Start traversal from root
        visitTile(this.cesiumTileset.root);
    }

    /**
     * Apply transforms to selected tiles' meshes during render loop
     * This replaces the early transform application in SimpleBabylonTileContent
     */
    private applyTransformsToSelectedTiles(): void {
        if (!this.cesiumTileset || !this.cesiumTileset._selectedTiles) return;

        const selectedTiles = this.cesiumTileset._selectedTiles;
        
        // Apply transforms only to newly selected tiles to avoid redundant work
        selectedTiles.forEach((tile: any) => {
            if (tile._content && 
                tile._content.constructor.name === 'SimpleBabylonTileContent' &&
                typeof tile._content.getBabylonMeshes === 'function' &&
                typeof tile._content.getStoredTransform === 'function') {
                
                const meshes = tile._content.getBabylonMeshes();
                const cesiumTransform = tile._content.getStoredTransform() || tile.computedTransform;
                
                if (meshes.length > 0 && cesiumTransform && !tile._babylonTransformApplied) {
                    this.applyTransformToMeshes(meshes, cesiumTransform, tile);
                    tile._babylonTransformApplied = true;
                }
            }
        });
    }

    /**
     * Apply Cesium transform matrix to Babylon meshes
     */
    private applyTransformToMeshes(meshes: any[], cesiumTransform: any, tile: any): void {
        try {
            // Convert Cesium's Matrix4 to Babylon's Matrix
            // Cesium uses column-major matrices, Babylon uses row-major
            const cesiumArray = cesiumTransform;
            
            // Convert Cesium column-major Matrix4 to Babylon row-major Matrix (transpose)
            const babylonMatrix = Matrix.FromArray([
                cesiumArray[0], cesiumArray[4], cesiumArray[8],  cesiumArray[12],
                cesiumArray[1], cesiumArray[5], cesiumArray[9],  cesiumArray[13], 
                cesiumArray[2], cesiumArray[6], cesiumArray[10], cesiumArray[14],
                cesiumArray[3], cesiumArray[7], cesiumArray[11], cesiumArray[15]
            ]);

            // Apply the transform to all meshes
            meshes.forEach((mesh, index) => {
                if (mesh && mesh.setPreTransformMatrix) {
                    mesh.setPreTransformMatrix(babylonMatrix);
                } else if (mesh) {
                    // Fallback: directly set the world matrix
                    mesh.setAbsolutePosition(Vector3.Zero());
                    mesh.freezeWorldMatrix(babylonMatrix);
                }
            });

            // Silent transform application (depth=${tile._depth}, meshes=${meshes.length})

        } catch (error) {
            console.error('❌ Failed to apply transform in render loop:', error);
        }
    }

    /**
     * Visualize Cesium frustum in Babylon coordinate space
     */
    private frustumVisualization: any = null;
    
    private visualizeCesiumFrustum(cesiumCamera: any, frustum: any): void {
        // Only update visualization every 120 frames to reduce spam
        if (this.frameCount % 120 !== 0) return;
        
        try {
            // Remove old visualization
            if (this.frustumVisualization) {
                this.frustumVisualization.dispose();
                this.frustumVisualization = null;
            }
            
            const scene = this.camera.getScene() as Scene;
            if (!scene) {
                console.warn('⚠️ No scene available for frustum visualization');
                return;
            }
            
            // Get frustum corners in Cesium ECEF coordinates
            const corners = this.getFrustumCorners(cesiumCamera, frustum);
            
            // Transform corners from Cesium ECEF to Babylon coordinates (Y↔Z swap)
            const babylonCorners = corners.map(corner => ({
                x: corner.x,
                y: corner.z, // Z → Y
                z: corner.y  // Y → Z
            }));
            
            // Create frustum visualization parent
            this.frustumVisualization = MeshBuilder.CreateBox("frustumViz", {size: 0.1}, scene);
            this.frustumVisualization.setEnabled(false); // Just a parent node
            
            // Create material for frustum lines with improved visibility
            const frustumMaterial = new StandardMaterial("frustumMaterial", scene);
            frustumMaterial.emissiveColor = new Color3(1, 0, 1); // Magenta
            frustumMaterial.disableLighting = true;
            frustumMaterial.backFaceCulling = false;
            
            // Draw frustum edges
            this.drawFrustumLines(babylonCorners, frustumMaterial, scene);
            
            // Create direction vector visualization
            const directionLength = 10000; // 10km line
            const directionEnd = {
                x: babylonCorners[0].x + cesiumCamera.direction.x * directionLength,
                y: babylonCorners[0].y + cesiumCamera.direction.z * directionLength, // Y↔Z
                z: babylonCorners[0].z + cesiumCamera.direction.y * directionLength  // Y↔Z
            };
            
            const directionLine = MeshBuilder.CreateLines("directionVector", {
                points: [
                    new Vector3(babylonCorners[0].x, babylonCorners[0].y, babylonCorners[0].z),
                    new Vector3(directionEnd.x, directionEnd.y, directionEnd.z)
                ]
            }, scene);
            
            const directionMaterial = new StandardMaterial("directionMaterial", scene);
            directionMaterial.emissiveColor = new Color3(0, 1, 1); // Cyan for direction
            directionMaterial.disableLighting = true;
            directionLine.material = directionMaterial;
            directionLine.parent = this.frustumVisualization;
            
            console.log('🎯 FRUSTUM VIZ:', {
                position: `(${cesiumCamera.position.x.toFixed(0)}, ${cesiumCamera.position.y.toFixed(0)}, ${cesiumCamera.position.z.toFixed(0)})`,
                direction: `(${cesiumCamera.direction.x.toFixed(3)}, ${cesiumCamera.direction.y.toFixed(3)}, ${cesiumCamera.direction.z.toFixed(3)})`,
                created: !!this.frustumVisualization,
                childMeshes: this.frustumVisualization ? this.frustumVisualization.getChildMeshes().length : 0,
                babylonSceneMeshes: scene.meshes.filter(m => m.name.includes('frustum')).length
            });
            
        } catch (error) {
            console.error('❌ Failed to create frustum visualization:', error);
        }
    }
    
    /**
     * Calculate frustum corner points in Cesium ECEF coordinates
     */
    private getFrustumCorners(cesiumCamera: any, frustum: any): any[] {
        const position = cesiumCamera.position;
        const direction = cesiumCamera.direction;
        const up = cesiumCamera.up;
        const right = cesiumCamera.right;
        
        // Calculate frustum dimensions at near and far planes
        const nearHeight = 2 * Math.tan(frustum.fov / 2) * frustum.near;
        const nearWidth = nearHeight * frustum.aspectRatio;
        const farHeight = 2 * Math.tan(frustum.fov / 2) * frustum.far;
        const farWidth = farHeight * frustum.aspectRatio;
        
        // Near plane center
        const nearCenter = {
            x: position.x + direction.x * frustum.near,
            y: position.y + direction.y * frustum.near,
            z: position.z + direction.z * frustum.near
        };
        
        // Far plane center
        const farCenter = {
            x: position.x + direction.x * frustum.far,
            y: position.y + direction.y * frustum.far,
            z: position.z + direction.z * frustum.far
        };
        
        // Calculate corner offsets
        const nearHalfWidth = nearWidth / 2;
        const nearHalfHeight = nearHeight / 2;
        const farHalfWidth = farWidth / 2;
        const farHalfHeight = farHeight / 2;
        
        // Return frustum corners (camera position + 4 near corners + 4 far corners)
        return [
            position, // Camera position
            // Near plane corners
            {
                x: nearCenter.x - right.x * nearHalfWidth - up.x * nearHalfHeight,
                y: nearCenter.y - right.y * nearHalfWidth - up.y * nearHalfHeight,
                z: nearCenter.z - right.z * nearHalfWidth - up.z * nearHalfHeight
            },
            {
                x: nearCenter.x + right.x * nearHalfWidth - up.x * nearHalfHeight,
                y: nearCenter.y + right.y * nearHalfWidth - up.y * nearHalfHeight,
                z: nearCenter.z + right.z * nearHalfWidth - up.z * nearHalfHeight
            },
            {
                x: nearCenter.x + right.x * nearHalfWidth + up.x * nearHalfHeight,
                y: nearCenter.y + right.y * nearHalfWidth + up.y * nearHalfHeight,
                z: nearCenter.z + right.z * nearHalfWidth + up.z * nearHalfHeight
            },
            {
                x: nearCenter.x - right.x * nearHalfWidth + up.x * nearHalfHeight,
                y: nearCenter.y - right.y * nearHalfWidth + up.y * nearHalfHeight,
                z: nearCenter.z - right.z * nearHalfWidth + up.z * nearHalfHeight
            },
            // Far plane corners
            {
                x: farCenter.x - right.x * farHalfWidth - up.x * farHalfHeight,
                y: farCenter.y - right.y * farHalfWidth - up.y * farHalfHeight,
                z: farCenter.z - right.z * farHalfWidth - up.z * farHalfHeight
            },
            {
                x: farCenter.x + right.x * farHalfWidth - up.x * farHalfHeight,
                y: farCenter.y + right.y * farHalfWidth - up.y * farHalfHeight,
                z: farCenter.z + right.z * farHalfWidth - up.z * farHalfHeight
            },
            {
                x: farCenter.x + right.x * farHalfWidth + up.x * farHalfHeight,
                y: farCenter.y + right.y * farHalfWidth + up.y * farHalfHeight,
                z: farCenter.z + right.z * farHalfWidth + up.z * farHalfHeight
            },
            {
                x: farCenter.x - right.x * farHalfWidth + up.x * farHalfHeight,
                y: farCenter.y - right.y * farHalfWidth + up.y * farHalfHeight,
                z: farCenter.z - right.z * farHalfWidth + up.z * farHalfHeight
            }
        ];
    }
    
    /**
     * Draw frustum wireframe lines
     */
    private drawFrustumLines(corners: any[], material: any, scene: Scene): void {
        try {
        
        // Near plane edges (corners 1-4)
        for (let i = 1; i <= 4; i++) {
            const next = i === 4 ? 1 : i + 1;
            const line = MeshBuilder.CreateLines(`nearEdge${i}`, {
                points: [
                    new Vector3(corners[i].x, corners[i].y, corners[i].z),
                    new Vector3(corners[next].x, corners[next].y, corners[next].z)
                ]
            }, scene);
            line.material = material;
            line.parent = this.frustumVisualization;
        }
        
        // Far plane edges (corners 5-8)
        for (let i = 5; i <= 8; i++) {
            const next = i === 8 ? 5 : i + 1;
            const line = MeshBuilder.CreateLines(`farEdge${i}`, {
                points: [
                    new Vector3(corners[i].x, corners[i].y, corners[i].z),
                    new Vector3(corners[next].x, corners[next].y, corners[next].z)
                ]
            }, scene);
            line.material = material;
            line.parent = this.frustumVisualization;
        }
        
        // Connecting edges from near to far plane
        for (let i = 1; i <= 4; i++) {
            const line = MeshBuilder.CreateLines(`connectEdge${i}`, {
                points: [
                    new Vector3(corners[i].x, corners[i].y, corners[i].z),
                    new Vector3(corners[i + 4].x, corners[i + 4].y, corners[i + 4].z)
                ]
            }, scene);
            line.material = material;
            line.parent = this.frustumVisualization;
        }
        
        // Camera position to near plane corners
        for (let i = 1; i <= 4; i++) {
            const line = MeshBuilder.CreateLines(`cameraLine${i}`, {
                points: [
                    new Vector3(corners[0].x, corners[0].y, corners[0].z),
                    new Vector3(corners[i].x, corners[i].y, corners[i].z)
                ]
            }, scene);
            line.material = material;
            line.parent = this.frustumVisualization;
        }
        } catch (error) {
            console.error('❌ Failed to draw frustum lines:', error);
        }
    }

    // ========================================
    // INTERACTIVE DEBUG CONTROLS
    // ========================================
    
    private cameraUpdatePaused: boolean = false;
    private lastBabylonCameraState: any = null;
    private boundingVolumeWireframes: any[] = [];
    private showBoundingVolumes: boolean = false;
    private frustumWireframes: any[] = [];
    private showFrustumWireframe: boolean = false;
    
    /**
     * Step camera update - spacebar control
     * Pauses continuous updates and steps one frame at a time
     */
    stepCameraUpdate(): void {
        if (!this.cameraUpdatePaused) {
            // First spacebar press - pause and capture current state
            this.cameraUpdatePaused = true;
            this.lastBabylonCameraState = {
                position: this.camera.position.clone(),
                target: this.camera.getTarget().clone(),
                fov: this.camera.fov
            };
            console.log('⏸️ CAMERA UPDATE PAUSED - Press spacebar to step');
            return;
        }
         
        // Force one update cycle
        this.forceOneUpdate = true;
    }
    
    private forceOneUpdate: boolean = false;
    
    /**
     * Toggle bounding volume visibility - B key control
     */
    toggleBoundingVolumes(): void {
        if (!this.cesiumTileset) {
            console.log('❌ No tileset loaded');
            return;
        }
        
        this.showBoundingVolumes = !this.showBoundingVolumes;
        
        if (this.showBoundingVolumes) {
            console.log('🔳 BOUNDING VOLUMES: VISIBLE (Babylon.js wireframes)');
            this.createBoundingVolumeWireframes();
        } else {
            console.log('🔳 BOUNDING VOLUMES: HIDDEN');
            this.clearBoundingVolumeWireframes();
        }
    }
    
    /**
     * Create Babylon.js wireframe spheres for tile bounding volumes
     */
    private createBoundingVolumeWireframes(): void {
        this.clearBoundingVolumeWireframes();
        
        const selectedTiles = (this.cesiumTileset as any)?._selectedTiles || [];
        console.log(`🔧 Creating bounding volume wireframes for ${selectedTiles.length} selected tiles`);
            
        selectedTiles.forEach((tile: any, index: number) => {
            const boundingVolume = tile.boundingVolume;
            if (!boundingVolume || !boundingVolume.boundingSphere) {
                return;
            }
            
            const sphere = boundingVolume.boundingSphere;
            const cesiumCenter = sphere.center;
            const cesiumRadius = sphere.radius;
            
            // Use the SAME coordinate transformation as tile content positioning
            // This should match how SimpleBabylonTileContent positions meshes
            const babylonCenter = new Vector3(cesiumCenter.x, cesiumCenter.z, -cesiumCenter.y);
            
            // Just make a normal wireframe sphere - no fancy stuff
            const wireframeSphere = MeshBuilder.CreateSphere(`boundingVolume_${index}`, {
                diameter: cesiumRadius * 2,
                segments: 16
            }, this.babylonScene);
            
            wireframeSphere.position = babylonCenter;
            
            // Just make a normal material
            const material = new StandardMaterial(`boundingMaterial_${index}`, this.babylonScene);
            material.wireframe = true;
            material.backFaceCulling = false;
            
            // Simple colors
            const depthNormalized = Math.min(tile._depth / 10, 1);
            material.diffuseColor = new Color3(1 - depthNormalized, 0.5, depthNormalized);
            
            wireframeSphere.material = material;
            
            this.boundingVolumeWireframes.push(wireframeSphere);
            
            console.log(`   [${index}] Depth ${tile._depth}: center=(${cesiumCenter.x.toFixed(0)}, ${cesiumCenter.y.toFixed(0)}, ${cesiumCenter.z.toFixed(0)}), radius=${(cesiumRadius/1000).toFixed(1)}km`);
        });
    }
    
    /**
     * Clear all bounding volume wireframes
     */
    private clearBoundingVolumeWireframes(): void {
        this.boundingVolumeWireframes.forEach(wireframe => {
            if (wireframe.material) {
                wireframe.material.dispose();
            }
            wireframe.dispose();
        });
        this.boundingVolumeWireframes = [];
    }
    
    /**
     * Toggle frustum wireframe visibility - F key control
     */
    toggleFrustumWireframe(): void {
        if (!this.cesiumTileset) {
            console.log('❌ No tileset loaded');
            return;
        }
        
        this.showFrustumWireframe = !this.showFrustumWireframe;
        
        if (this.showFrustumWireframe) {
            console.log('🔺 FRUSTUM WIREFRAME: VISIBLE');
            this.createFrustumWireframe();
        } else {
            console.log('🔺 FRUSTUM WIREFRAME: HIDDEN');
            this.clearFrustumWireframe();
        }
    }
    
    /**
     * Create Babylon.js wireframe for Cesium camera frustum
     */
    private createFrustumWireframe(): void {
        this.clearFrustumWireframe();
        
        // Get the current Cesium camera
        const cesiumCamera = this.createCesiumCamera();
        if (!cesiumCamera) {
            console.log('❌ Could not create Cesium camera for frustum');
            return;
        }
        
        const frustum = cesiumCamera.frustum;
        // Quiet frustum creation
        
        // Calculate frustum corner points
        const near = frustum.near;
        const far = frustum.far;
        const fov = frustum.fov;
        const aspectRatio = frustum.aspectRatio;
        
        // Half heights and widths at near and far planes
        const nearHalfHeight = near * Math.tan(fov * 0.5);
        const nearHalfWidth = nearHalfHeight * aspectRatio;
        const farHalfHeight = far * Math.tan(fov * 0.5);
        const farHalfWidth = farHalfHeight * aspectRatio;
        
        // USE CESIUM'S CORRECTED VECTORS for frustum visualization
        // Transform Cesium vectors back to Babylon coordinates using INVERSE transform
        // Forward: Babylon (X,Y,Z) → Cesium (X,-Z,Y)  
        // Inverse: Cesium (X,Y,Z) → Babylon (X,Z,-Y)
        const cesiumPos = cesiumCamera.position;
        const cesiumDir = cesiumCamera.direction; 
        const cesiumUp = cesiumCamera.up;
        
        // Apply INVERSE coordinate transformation: (X,Y,Z) → (X,Z,-Y)
        const camPos = new Vector3(cesiumPos.x, cesiumPos.z, -cesiumPos.y);
        const camDir = new Vector3(cesiumDir.x, cesiumDir.z, -cesiumDir.y);
        const camUp = new Vector3(cesiumUp.x, cesiumUp.z, -cesiumUp.y);
        const camRight = Vector3.Cross(camDir, camUp).normalize();
        
        // Calculate frustum centers using Cesium's corrected direction
        const nearCenter = camPos.add(camDir.scale(near));
        const farCenter = camPos.add(camDir.scale(far));
        
        // Near plane corners - using Cesium's corrected vectors
        const nearTL = nearCenter.add(camUp.scale(nearHalfHeight)).subtract(camRight.scale(nearHalfWidth));
        const nearTR = nearCenter.add(camUp.scale(nearHalfHeight)).add(camRight.scale(nearHalfWidth));
        const nearBL = nearCenter.subtract(camUp.scale(nearHalfHeight)).subtract(camRight.scale(nearHalfWidth));
        const nearBR = nearCenter.subtract(camUp.scale(nearHalfHeight)).add(camRight.scale(nearHalfWidth));
        
        // Far plane corners - using Cesium's corrected vectors  
        const farTL = farCenter.add(camUp.scale(farHalfHeight)).subtract(camRight.scale(farHalfWidth));
        const farTR = farCenter.add(camUp.scale(farHalfHeight)).add(camRight.scale(farHalfWidth));
        const farBL = farCenter.subtract(camUp.scale(farHalfHeight)).subtract(camRight.scale(farHalfWidth));
        const farBR = farCenter.subtract(camUp.scale(farHalfHeight)).add(camRight.scale(farHalfWidth));
        
        // Create wireframe lines
        const points = [
            // Near plane rectangle
            nearTL, nearTR, nearBR, nearBL, nearTL,
            // Lines to far plane
            farTL, nearTL,
            farTR, nearTR,
            farBR, nearBR, 
            farBL, nearBL,
            // Far plane rectangle  
            farTL, farTR, farBR, farBL, farTL
        ];
        
        const frustumLines = MeshBuilder.CreateLines('frustumWireframe', {
            points: points
        }, this.babylonScene);
        
        // Bright magenta material
        const material = new StandardMaterial('frustumMaterial', this.babylonScene);
        material.emissiveColor = new Color3(1, 0, 1); // Bright magenta
        material.disableLighting = true;
        frustumLines.color = new Color3(1, 0, 1);
        
        this.frustumWireframes.push(frustumLines);
    }
    
    /**
     * Clear all frustum wireframes
     */
    private clearFrustumWireframe(): void {
        this.frustumWireframes.forEach(wireframe => {
            wireframe.dispose();
        });
        this.frustumWireframes = [];
    }

    /**
     * Cleanup resources
     */
    dispose(): void {
        this.clearBoundingVolumeWireframes();
        this.clearFrustumWireframe();
    }
}