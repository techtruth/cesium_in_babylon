import { Camera, Engine, Vector3, Matrix, MeshBuilder, StandardMaterial, Color3, Scene } from '@babylonjs/core';
import * as Cesium from 'cesium';
import CesiumTilesetDerived from './cesium_derived/CesiumTilesetDerived.js';
import { SimpleBabylonTileContent } from './SimpleBabylonTileContent';

/**
 * Simple Cesium + Babylon integration - trust Cesium completely
 */
export class SimpleIntegration {
    private camera: Camera;
    private engine: Engine;
    private cesiumTileset?: CesiumTilesetDerived;
    private renderTilesetPassState: any;
    private frameCount: number = 0;
    private lastFrameNumber: number = 0;
    // private lastDynamicSSELogTime: number = 0; // Unused for now
    private testedDirectFetch: boolean = false;

    constructor(_scene: any, camera: Camera, engine: Engine) {
        this.camera = camera;
        this.engine = engine;
        
        // Set up Cesium Ion authentication using native Cesium
        Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2ZWE4YWJjYy0wZTg4LTRhMjQtYjVmNy05M2E5NmZlMjczODAiLCJpZCI6MjIwODczLCJpYXQiOjE3MjIwNTEyNDJ9.hlVfaVjkU1E2K507a65UFUrC7Bh8clQJ2B7DrVfSAcw';
        
        // BABYLON.JS: Set up proper Cesium content factory registration
        this.setupBabylonContentFactory();
        
        // Keep minimal debugging for network monitoring
        this.setupCesiumRequestDebugging();
        
        // CRITICAL FIX: Increase RequestScheduler limits for Google 3D Tiles
        this.optimizeRequestSchedulerForGoogle3DTiles();
        
        // Create reusable pass state exactly like Cesium Scene does
        // Access internal classes through Cesium namespace
        const Cesium3DTilePassState = (Cesium as any).Cesium3DTilePassState;
        const Cesium3DTilePass = (Cesium as any).Cesium3DTilePass;
        
        this.renderTilesetPassState = new Cesium3DTilePassState({
            pass: Cesium3DTilePass.RENDER,
            commandList: [] // Required by CesiumTilesetDerived.js
        });
    }

    /**
     * Create Cesium camera with proper vector calculations
     */
    private createCesiumCamera(): any {
        const babylonPos = this.camera.position;
        const babylonDir = this.camera.getDirection(Vector3.Forward());
        const babylonUp = this.camera.upVector || Vector3.Up();

        // Transform Babylon to Cesium: (X, Y, Z) → (X, -Z, Y) - inverse coordinate alignment
        const position = new Cesium.Cartesian3(babylonPos.x, -babylonPos.z, babylonPos.y);
        const direction = new Cesium.Cartesian3(babylonDir.x, -babylonDir.z, babylonDir.y);
        const up = new Cesium.Cartesian3(babylonUp.x, -babylonUp.z, babylonUp.y);
        
        // Coordinate alignment: Babylon view-centered → Cesium Earth-centered
        
        // Normalize vectors
        Cesium.Cartesian3.normalize(direction, direction);
        Cesium.Cartesian3.normalize(up, up);
        
        const right = new Cesium.Cartesian3();
        Cesium.Cartesian3.cross(direction, up, right);
        Cesium.Cartesian3.normalize(right, right);

        // Create frustum
        const frustum = new Cesium.PerspectiveFrustum({
            fov: this.camera.fov,
            aspectRatio: this.engine.getRenderWidth() / this.engine.getRenderHeight(),
            near: this.camera.minZ,
            far: this.camera.maxZ
        });

        // CRITICAL: Trigger SSE denominator calculation like working commit 72dfb2e
        // Access sseDenominator to ensure frustum is properly initialized
        if ((frustum as any).sseDenominator) {
            // Frustum properly initialized with SSE denominator
        }

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
     * Create a mock frameState for testing/debugging purposes
     */
    private createMockFrameState(): any {
        const camera = this.createCesiumCamera();
        if (!camera) return null;
        
        return {
            camera: camera,
            context: {
                drawingBufferWidth: 1920,
                drawingBufferHeight: 1080
            },
            frameNumber: this.frameCount
        };
    }

    /**
     * Load Google Photorealistic 3D Tiles using Cesium's exact configuration
     */
    async loadGooglePhotorealistic3DTiles(assetId: number): Promise<void> {
        try {
            // Use Cesium's standard approach exactly - but with our derived tileset
            const resource = await Cesium.IonResource.fromAssetId(assetId);
            
            // OFFICIAL CESIUM GOOGLE 3D TILES CONFIG: Match createGooglePhotorealistic3DTileset exactly
            console.log('🎯 Using complete Google 3D Tiles config from working commit 1012957');
            this.cesiumTileset = await CesiumTilesetDerived.fromUrl(resource, {
                // OFFICIAL: From createGooglePhotorealistic3DTileset.js
                cacheBytes: 1536 * 1024 * 1024,              // 1.5GB (Google-optimized)
                maximumCacheOverflowBytes: 1024 * 1024 * 1024, // 1GB (Google-optimized)
                enableCollision: true,                        // Official Google config
                
                // OFFICIAL: Cesium3DTileset defaults (confirmed from source)
                maximumScreenSpaceError: 16,                  // Official default
                skipLevelOfDetail: false,                     // Official: Uses BaseTraversal
                baseScreenSpaceError: 1024,                   // Official default
                skipScreenSpaceErrorFactor: 16,               // Official default
                skipLevels: 1,                                // Official default
                immediatelyLoadDesiredLevelOfDetail: false,   // Official default
                loadSiblings: false,                          // Official default (changed from true)
                
                // STANDARD: Keep other working optimizations
                cullWithChildrenBounds: true,
                cullRequestsWhileMoving: true,                // Official default
                cullRequestsWhileMovingMultiplier: 60.0,
                preloadWhenHidden: false,
                preloadFlightDestinations: true,
                preferLeaves: false,
                dynamicScreenSpaceError: true,                // Official default (re-enabled)
                dynamicScreenSpaceErrorDensity: 2.0e-4,
                dynamicScreenSpaceErrorFactor: 24.0,
                dynamicScreenSpaceErrorHeightFalloff: 0.25,
                progressiveResolutionHeightFraction: 0.3,
                foveatedScreenSpaceError: true,
                foveatedConeSize: 0.1,
                foveatedMinimumScreenSpaceErrorRelaxation: 0.0,
                foveatedTimeDelay: 0.2,
                show: true,
                shadows: 1  // ShadowMode.ENABLED
            }) as CesiumTilesetDerived;
            
            // Credits disabled in creditDisplay to prevent image downloads
            
            console.log('Google Photorealistic 3D Tiles created, waiting for ready...');
            
            // Wait for the tileset to be fully ready (like Cesium Scene does)
            await this.cesiumTileset.readyPromise;
            
            console.log('Google Photorealistic 3D Tiles ready!');
            
            // CESIUM EXACT: Observe natural tile state without manipulation
            this.observeRootTileState();
            
        } catch (error) {
            console.error('Failed to load Google Photorealistic 3D Tiles:', error);
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

        // Wait for initial frames like working commit 72dfb2e
        if (this.frameCount <= 10) {
            return; // Silent initialization
        }

        // REMOVED: No longer forcing hasRenderableContent - using proper empty content detection

        // WORKING COMMIT PATTERN: Use createCesiumCamera() method like working commit 1012957
        const camera = this.createCesiumCamera();
        if (!camera) {
            console.error('Failed to create Cesium camera');
            return;
        }

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
            if (this.frameCount % 180 === 0) {
                console.log('🔍 CULLING VOLUME DEBUG:', {
                    hasCullingVolume: !!cullingVolume,
                    hasComputeVisibility: typeof cullingVolume.computeVisibilityWithPlaneMask === 'function',
                    cullingVolumeType: cullingVolume.constructor?.name || 'unknown',
                    frustumType: camera.frustum.constructor?.name || 'unknown',
                    frustumNear: camera.frustum.near,
                    frustumFar: camera.frustum.far,
                    frustumFov: (camera.frustum.fov * 180 / Math.PI).toFixed(1) + '°'
                });
            }
        } catch (error) {
            console.error('❌ Failed to compute culling volume:', error);
            console.error('   This will break tile visibility - stopping update');
            return;
        }

        // VISUALIZE CESIUM FRUSTUM: Create visual markers in Babylon coordinate space  
        this.visualizeCesiumFrustum(camera, camera.frustum);

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

        // CORE ISSUE: Focus on tile selection - why selectedCount = 0?
        
        // RIGHT-HANDED CAMERA TEST: Check tiles + camera positioning
        if (this.frameCount % 300 === 0) {
            const selectedCount = this.cesiumTileset.selectedTiles?.length || 0;
            console.log('🧪 RIGHT-HANDED TEST RESULTS:', {
                frameNumber: frameState.frameNumber,
                selectedTiles: selectedCount,
                geographicTiles: selectedCount > 0 ? 'NYC tiles loading ✅' : 'Still global tiles ❌',
                cameraPosition: `(${camera.position.x.toFixed(0)}, ${camera.position.y.toFixed(0)}, ${camera.position.z.toFixed(0)})`,
                nextStep: 'Check camera positioning over NYC tiles'
            });
        }
        
        // DEBUG: Enhanced request and tile loading monitoring with deep scheduler analysis  
        if (Date.now() % 60000 < 16) { // Every 60 seconds (reduced from 15)
            const RequestScheduler = (Cesium as any).RequestScheduler;
            const stats = this.cesiumTileset?.statistics;
            
            console.log('📊 LOADING PROGRESS ANALYSIS:');
            
            // Enhanced RequestScheduler status with request queue details
            if (RequestScheduler) {
                const active = RequestScheduler.numberOfActiveRequests || 0;
                const pending = RequestScheduler.numberOfPendingRequests || 0;
                console.log('   RequestScheduler:', {
                    active,
                    pending,
                    maxRequests: RequestScheduler.maximumRequests,
                    maxPerServer: RequestScheduler.maximumRequestsPerServer,
                    utilization: RequestScheduler.maximumRequests ? `${((active / RequestScheduler.maximumRequests) * 100).toFixed(1)}%` : 'unknown',
                    serverMap: Object.keys(RequestScheduler.requestsByServer || {}).map(server => ({
                        server: server.substring(0, 30) + '...',
                        count: RequestScheduler.requestsByServer[server]?.length || 0
                    })),
                    throttleRequests: RequestScheduler.throttleRequests,
                    // Deep dive: Are tile requests actually being submitted?
                    requestHeap: RequestScheduler.requestHeap ? `${RequestScheduler.requestHeap.length} queued` : 'none'
                });
                
                // Check if Google tiles are specifically blocked
                const googleServer = 'tile.googleapis.com';
                const googleRequests = RequestScheduler.requestsByServer?.[googleServer];
                if (googleRequests && googleRequests.length > 0) {
                    console.log('   🎯 Google tile requests in queue:', {
                        count: googleRequests.length,
                        firstFew: googleRequests.slice(0, 3).map((req: any) => ({
                            url: req.url?.split('/').pop()?.split('?')[0] || 'unknown',
                            state: req.state,
                            priority: req.priority?.toFixed(2) || 'unknown'
                        }))
                    });
                } else {
                    console.log('   ❌ NO Google tile requests found in RequestScheduler queue');
                    console.log('   🔍 This suggests tiles are not being marked for loading at all');
                }
            }
            
            // Tileset loading statistics
            if (stats) {
                console.log('   Tileset requests:', {
                    tilesRequested: stats.numberOfTilesRequested || 0,
                    tilesProcessing: stats.numberOfTilesProcessing || 0,
                    pendingRequests: stats.numberOfPendingRequests || 0,
                    tilesWithContentReady: stats.numberOfTilesWithContentReady || 0,
                    tilesLoaded: stats.numberOfLoadedTilesTotal || 0
                });
            }
            
            // Root children loading state
            const root = this.cesiumTileset?.root;
            if (root && root.children && root.children.length > 0) {
                const childrenStates = root.children.map((child: any, i: number) => {
                    const Cesium3DTileContentState = (Cesium as any).Cesium3DTileContentState;
                    const stateNames = ['UNLOADED', 'LOADING', 'PROCESSING', 'READY', 'EXPIRED', 'FAILED'];
                    return {
                        id: i,
                        state: stateNames[child._contentState] || child._contentState,
                        contentAvailable: child.contentAvailable,
                        hasContent: !!child._content
                    };
                });
                console.log('   Root children states:', childrenStates);
                
                const readyChildren = childrenStates.filter((c: any) => c.contentAvailable).length;
                console.log(`   Children progress: ${readyChildren}/${root.children.length} ready`);
            }
        }
        

        try {
            
            // DEBUG: Minimal request logging only (no hooks)
            // DEBUG: Add BaseTraversal request decision logging from working commit  
            this.addBaseTraversalRequestLogging();
            
            // PHASE 1: Comprehensive diagnostic logging - DISABLED (tiles working, too verbose)
            // Re-enable this if debugging is needed by changing false to true
            if (false && Date.now() % 3000 < 16) { // Disabled - change false to true if needed
                console.log('\n🔍 === TRAVERSAL DIAGNOSTIC START ===');
                
                // 1. Root Tile Analysis
                const root = this.cesiumTileset.root;
                if (root) {
                    console.log('📍 ROOT TILE ANALYSIS:', {
                        geometricError: root.geometricError,
                        hasChildren: !!root.children && root.children.length > 0,
                        childCount: root.children ? root.children.length : 0,
                        contentAvailable: root.contentAvailable,
                        contentReady: root._contentState,
                        visible: root._visible,
                        boundingVolumeType: root.boundingVolume?.constructor?.name || 'unknown'
                    });
                    
                    // DETAILED contentAvailable debugging
                    console.log('🔍 ROOT TILE contentAvailable BREAKDOWN:', {
                        contentAvailable: root.contentAvailable,
                        hasRenderableContent: root.hasRenderableContent,
                        contentReady: root.contentReady,
                        contentState: root._contentState,
                        readyConstant: (Cesium as any).Cesium3DTileContentState.READY,
                        isContentStateReady: root._contentState === (Cesium as any).Cesium3DTileContentState.READY,
                        hasContent: !!root._content,
                        expiredContent: !!root._expiredContent,
                        contentFailed: root.contentFailed
                    });
                    
                    // Log bounding volume details
                    if (root.boundingSphere) {
                        const bs = root.boundingSphere;
                        console.log('🌐 ROOT BOUNDING SPHERE:', {
                            center: `(${bs.center.x.toFixed(0)}, ${bs.center.y.toFixed(0)}, ${bs.center.z.toFixed(0)})`,
                            radius: bs.radius.toFixed(0),
                            cameraDistance: Cesium.Cartesian3.distance(camera.position, bs.center).toFixed(0)
                        });
                    }
                } else {
                    console.log('❌ ROOT TILE: Does not exist!');
                }
                
                // 2. Tileset Configuration Analysis  
                console.log('⚙️ TILESET CONFIG:', {
                    maximumScreenSpaceError: this.cesiumTileset.maximumScreenSpaceError,
                    isSkippingLOD: (this.cesiumTileset as any).isSkippingLevelOfDetail,
                    traversalType: (this.cesiumTileset as any).isSkippingLevelOfDetail ? 'SkipTraversal' : 'BaseTraversal',
                    show: this.cesiumTileset.show,
                    ready: !!(this.cesiumTileset.root && this.cesiumTileset.asset)
                });
                
                // 3. Camera Analysis
                const camDistance = Math.sqrt(camera.position.x**2 + camera.position.y**2 + camera.position.z**2);
                console.log('📹 CAMERA ANALYSIS:', {
                    position: `(${camera.position.x.toFixed(0)}, ${camera.position.y.toFixed(0)}, ${camera.position.z.toFixed(0)})`,
                    distanceFromOrigin: camDistance.toFixed(0),
                    direction: `(${camera.direction.x.toFixed(3)}, ${camera.direction.y.toFixed(3)}, ${camera.direction.z.toFixed(3)})`,
                    frustumFOV: (camera.frustum.fov * 180 / Math.PI).toFixed(1) + '°',
                    frustumNear: camera.frustum.near,
                    frustumFar: camera.frustum.far
                });
            }
            
            // CESIUM NATIVE: Call the critical functions directly like working MinimalTileset did
            // Instead of calling private prePassesUpdate(), call the essential parts directly:
            
            // 1. CRITICAL: Manually call what prePassesUpdate() would do  
            // Since we can't access the private module functions, let's simulate the key parts:
            
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
            
            // CESIUM SCENE PATTERN: Use proper pass sequence for native behavior
            // 1. prePassesUpdate() - handles dynamic SSE, timing, preprocessing
            if (typeof (this.cesiumTileset as any).prePassesUpdate === 'function') {
                (this.cesiumTileset as any).prePassesUpdate(frameState);
            }
            
            // 2. main update() - performs traversal with correct SSE values  
            this.cesiumTileset.update(frameState);
            
            // 3. postPassesUpdate() - cleanup, request scheduling, cache management
            if (typeof (this.cesiumTileset as any).postPassesUpdate === 'function') {
                (this.cesiumTileset as any).postPassesUpdate(frameState);
            }
            
            // 4. Apply transforms to selected tiles after Cesium processing
            this.applyTransformsToSelectedTiles();
            
            // DEBUG: Check if tileset configuration is preventing tile selection
            if (this.frameCount % 300 === 0 && this.cesiumTileset._selectedTiles.length === 0) {
                console.log('🔧 TILESET CONFIGURATION DEBUG:', {
                    maximumScreenSpaceError: this.cesiumTileset.maximumScreenSpaceError,
                    skipLevelOfDetail: this.cesiumTileset.skipLevelOfDetail,
                    baseScreenSpaceError: this.cesiumTileset.baseScreenSpaceError,
                    skipScreenSpaceErrorFactor: this.cesiumTileset.skipScreenSpaceErrorFactor,
                    skipLevels: this.cesiumTileset.skipLevels,
                    immediatelyLoadDesiredLevelOfDetail: this.cesiumTileset.immediatelyLoadDesiredLevelOfDetail,
                    loadSiblings: this.cesiumTileset.loadSiblings,
                    debugFreezeFrame: this.cesiumTileset.debugFreezeFrame,
                    ready: this.cesiumTileset.ready,
                    show: this.cesiumTileset.show
                });
            }
            
            // PHASE 1: Post-update traversal analysis - DISABLED (tiles working, too verbose)
            // Re-enable this if debugging is needed by changing false to true
            if (false && Date.now() % 3000 < 16) { // Disabled - change false to true if needed
                console.log('\n🔍 POST-UPDATE TRAVERSAL RESULTS:');
                
                // 4. Traversal Statistics  
                const stats = this.cesiumTileset.statistics || {};
                console.log('📊 TRAVERSAL STATS:', {
                    selected: stats.selected || 0,
                    visited: stats.visited || 0,
                    numberOfCommands: stats.numberOfCommands || 0,
                    numberOfPendingRequests: stats.numberOfPendingRequests || 0,
                    numberOfTilesProcessing: stats.numberOfTilesProcessing || 0,
                    // DEBUG: Track content loading progress
                    numberOfTilesWithContent: (this.cesiumTileset.selectedTiles || []).filter((t: any) => t._content).length,
                    numberOfTilesReady: (this.cesiumTileset.selectedTiles || []).filter((t: any) => t._contentState === 3).length // READY = 3
                });
                
                // 5. Selected Tiles Analysis
                const selectedTiles = this.cesiumTileset.selectedTiles || [];
                console.log('🎯 SELECTED TILES:', {
                    count: selectedTiles.length,
                    firstFewTiles: selectedTiles.slice(0, 3).map(tile => ({
                        geometricError: tile.geometricError,
                        contentAvailable: tile.contentAvailable,
                        contentReady: tile._contentState,
                        depth: tile._depth || 'unknown'
                    }))
                });
                
                // DEBUG: Investigate why 0 tiles selected despite correct SSE
                if (selectedTiles.length === 0 && (this.cesiumTileset.statistics?.visited || 0) > 0) {
                    console.log('🔍 SELECTION DEBUG: 0 tiles selected despite visiting tiles');
                    console.log('   Root tile analysis:', {
                        contentAvailable: this.cesiumTileset.root.contentAvailable,
                        hasRenderableContent: this.cesiumTileset.root.hasRenderableContent,
                        refinement: this.cesiumTileset.root.refine,
                        childrenCount: this.cesiumTileset.root.children?.length || 0,
                        geometricError: this.cesiumTileset.root.geometricError
                    });
                    
                    // ENHANCED BASETRAVERSAL DEBUG: Deep analysis of refinement blocking with tile tree traversal
                    const root = this.cesiumTileset.root;
                    if (root && root.refine === 1) { // REPLACE refinement
                        const Cesium3DTileRefine = (Cesium as any).Cesium3DTileRefine;
                        console.log('🔧 ENHANCED REPLACE REFINEMENT DEBUG:');
                        console.log('   Root refinement status:', {
                            refine: root.refine === Cesium3DTileRefine?.REPLACE ? 'REPLACE' : root.refine,
                            _refines: root._refines,
                            hasRenderableContent: root.hasRenderableContent,
                            stoppedRefining: !root._refines && true, // parentRefines is true for root
                            selectionRule: !root._refines ? 'WOULD SELECT (stoppedRefining=true)' : 'BLOCKED (still refining)',
                            geometricError: root.geometricError,
                            boundingSphereRadius: root.boundingSphere?.radius || 'unknown'
                        });
                        
                        // DEEP TREE ANALYSIS: Simulate BaseTraversal's exact algorithm
                        this.analyzeReplaceRefinementTree(root, 0, 5); // Analyze 5 levels deep
                        
                        // Check children loading status
                        if (root.children && root.children.length > 0) {
                            console.log('   Children loading analysis:');
                            root.children.forEach((child: any, i: number) => {
                                console.log(`     Child ${i}:`, {
                                    contentAvailable: child.contentAvailable,
                                    hasRenderableContent: child.hasRenderableContent,
                                    _contentState: child._contentState,
                                    _inRequestVolume: child._inRequestVolume,
                                    isVisible: child._visible,
                                    geometricError: child.geometricError
                                });
                            });
                            
                            const allChildrenAvailable = root.children.every((child: any) => child.contentAvailable);
                            const allChildrenInVolume = root.children.every((child: any) => child._inRequestVolume !== false);
                            console.log('   Children summary:', {
                                total: root.children.length,
                                contentAvailable: root.children.filter((c: any) => c.contentAvailable).length,
                                allChildrenAvailable,
                                allChildrenInVolume,
                                refinementBlocked: !allChildrenAvailable || !allChildrenInVolume
                            });
                            
                            // EXECUTEEMPTYTRAVERSAL DEBUG: Simulate Cesium's exact algorithm
                            console.log('🏗️ DEEP EMPTY TRAVERSAL SIMULATION:');
                            
                            // Simulate executeEmptyTraversal for the root tile
                            let allDescendantsLoaded = true;
                            const traversalStack: any[] = [];
                            
                            // Start with root's children (since root hasEmptyContent=true)
                            root.children.forEach((child: any, i: number) => {
                                traversalStack.push({tile: child, level: 1, parentIndex: i});
                            });
                            
                            console.log(`   Starting traversal with ${traversalStack.length} tiles in stack`);
                            
                            while (traversalStack.length > 0) {
                                const {tile, level, parentIndex} = traversalStack.pop();
                                const canTraverse = tile.children && tile.children.length > 0;
                                const shouldTraverse = !tile.hasRenderableContent && canTraverse;
                                
                                console.log(`   Level ${level} Child ${parentIndex}:`, {
                                    hasEmptyContent: tile.hasEmptyContent,
                                    hasRenderableContent: tile.hasRenderableContent,
                                    contentAvailable: tile.contentAvailable,
                                    childCount: tile.children?.length || 0,
                                    shouldTraverse: shouldTraverse,
                                    wouldBlock: !shouldTraverse && !tile.contentAvailable
                                });
                                
                                // CRITICAL CHECK: Does this tile block the traversal?
                                if (!shouldTraverse && !tile.contentAvailable) {
                                    console.log(`   ❌ BLOCKING TILE FOUND: Level ${level} Child ${parentIndex} - !traverse && !contentAvailable`);
                                    allDescendantsLoaded = false;
                                }
                                
                                // Add grandchildren to stack if we should traverse
                                if (shouldTraverse && tile.children) {
                                    tile.children.forEach((grandchild: any, gcIndex: number) => {
                                        traversalStack.push({tile: grandchild, level: level + 1, parentIndex: `${parentIndex}.${gcIndex}`});
                                    });
                                }
                            }
                            
                            const rootEmptyResult = root.hasEmptyContent || allDescendantsLoaded;
                            console.log(`   🎯 TRAVERSAL RESULT: allDescendantsLoaded=${allDescendantsLoaded}, rootHasEmptyContent=${root.hasEmptyContent}, finalResult=${rootEmptyResult}`);
                        }
                    }
                    
                    // CULLING DEBUG: Test if frustum culling is rejecting all tiles
                    if (cullingVolume && this.cesiumTileset.root.boundingVolume) {
                        const rootBounds = this.cesiumTileset.root.boundingVolume;
                        let cullingResult = 'unknown';
                        try {
                            const Intersect = (Cesium as any).Intersect;
                            cullingResult = cullingVolume.computeVisibility(rootBounds);
                            const cullingText = cullingResult === Intersect?.OUTSIDE ? 'OUTSIDE (culled)' : 
                                               cullingResult === Intersect?.INTERSECTING ? 'INTERSECTING (visible)' : 
                                               cullingResult === Intersect?.INSIDE ? 'INSIDE (visible)' : cullingResult;
                            console.log('   🎯 FRUSTUM CULLING TEST:', {
                                result: cullingText,
                                rawValue: cullingResult
                            });
                        } catch (e: any) {
                            console.log('   🎯 FRUSTUM CULLING TEST: error -', e.message);
                        }
                    }
                }
                
                // 6. Native Cesium Screen Space Error Analysis + prePassesUpdate verification
                const root = this.cesiumTileset.root;
                if (root && root.boundingSphere) {
                    const distance = Cesium.Cartesian3.distance(camera.position, root.boundingSphere.center);
                    const angularSize = root.boundingSphere.radius / distance;
                    const screenSpaceError = angularSize * frameState.context.drawingBufferHeight;
                    
                    // CRITICAL: Check if prePassesUpdate() actually computed dynamic SSE density
                    // const dynamicSSEDensity = (this.cesiumTileset as any)._dynamicScreenSpaceErrorComputedDensity || 0.0;
                    
                    // CRITICAL: Focus on the selection calculation that's failing
                    console.log('🔢 SCREEN SPACE ERROR CALCULATION:');
                    console.log(`   Calculated SSE: ${screenSpaceError.toFixed(2)} pixels`);
                    console.log(`   Maximum SSE threshold: ${(this.cesiumTileset as any).maximumScreenSpaceError}`);
                    console.log(`   Should select based on SSE: ${screenSpaceError > (this.cesiumTileset as any).maximumScreenSpaceError ? 'YES ✅' : 'NO ❌'}`);
                    console.log(`   Root geometric error: ${root.geometricError}`);
                    console.log(`   Bounding sphere radius: ${root.boundingSphere.radius.toFixed(0)}m`);
                    console.log(`   Camera distance: ${distance.toFixed(0)}m`);
                }
                
                console.log('🔍 === TRAVERSAL DIAGNOSTIC END ===\n');
            }
            
            // BABYLON.JS: Content replacement now happens immediately in tile request callback
            // No longer need post-processing replacement - content is created directly when requests complete
            
            // Use native Cesium ready state pattern instead of ready property
            const readyState = !!(this.cesiumTileset.root && this.cesiumTileset.asset);
            // Quiet down the constant logging - only log if tiles are actually selected or every 10 seconds
            const selectedCount = this.cesiumTileset.selectedTiles?.length || 0;
            if (selectedCount > 0 || Date.now() % 10000 < 16) {
                // DEBUG: Comprehensive tile selection analysis
                const stats = this.cesiumTileset.statistics;
                const actualSelectedTiles = this.cesiumTileset.selectedTiles;
                const numberOfTilesSelected = stats ? stats.numberOfTilesSelected : 'undefined';
                
                console.log(`🎯 TILE SELECTION DEBUG: {
                    selectedCount: ${selectedCount},
                    actualSelectedTiles_length: ${actualSelectedTiles ? actualSelectedTiles.length : 'undefined'},
                    statistics_numberOfTilesSelected: ${numberOfTilesSelected},
                    ready: ${readyState}
                }`);
            }
            
            // Update frame tracking for next frame
            this.lastFrameNumber = this.frameCount;
        } catch (error) {
            console.error('Error updating tileset:', error);
        }
    }

    /**
     * SIMPLIFIED: Analysis and debugging only - content replacement handled by factory
     */
    private analyzeProgress(): void {
        if (!this.cesiumTileset || !this.cesiumTileset.root) return;

        // PHASE 1: Log tile tree structure occasionally
        if (Date.now() % 5000 < 16) { // Every 5 seconds
            console.log('\n🌳 TILE TREE ANALYSIS:');
            this.analyzeTileTree(this.cesiumTileset.root, 0, 3); // Analyze first 3 levels
            
            // DEBUG: Count tiles by content state for replacement analysis
            const counts = this.countTileStates(this.cesiumTileset.root);
            console.log(`🔍 CONTENT STATE SUMMARY: Total: ${counts.total}, With Content: ${counts.withContent}, Ready: ${counts.ready}, Empty: ${counts.empty}`);
            
            // DEBUG: Check if pending requests are stuck
            const stats = this.cesiumTileset.statistics || {};
            if (stats.numberOfPendingRequests > 0) {
                console.log(`⏳ PENDING REQUESTS: ${stats.numberOfPendingRequests} requests have been pending - checking for stuck requests...`);
                this.analyzePendingRequests();
                
                // DEBUGGING: Check Cesium RequestScheduler state
                this.debugRequestSchedulerState();
                
                // TEST: Try to fetch one URL directly to check CORS/network issues
                if (!this.testedDirectFetch) {
                    this.testedDirectFetch = true;
                    this.testDirectFetch();
                }
            }
        }
        
        // SIMPLIFIED: Force debug every 3 seconds for more frequent debugging
        const now = Date.now();
        const lastDebugTime = (this as any)._lastDistanceDebugTime || 0;
        const timeSinceLastDebug = now - lastDebugTime;
        
        // FORCE IMMEDIATE DEBUG on first few frames to test the code
        const shouldForceDebug = this.frameCount <= 10 || timeSinceLastDebug > 3000;
        
        if (shouldForceDebug) {
            if (this.frameCount <= 10) {
                console.log('🚀 FORCING IMMEDIATE DEBUG - Frame', this.frameCount);
            }
            (this as any)._lastDistanceDebugTime = now;
            
            console.log('🔄 DISTANCE DEBUG TRIGGER - Starting analysis...');
            
            try {
                this.monitorTileSelection();
                
                // CRITICAL: Check if root tile distance is being calculated
                const rootTile = this.cesiumTileset.root;
                if (!rootTile) {
                    console.error('❌ No root tile found!');
                    return;
                }
                
                console.log('🚨 ROOT TILE DISTANCE DEBUG:', {
                    frameNumber: this.frameCount,
                    hasDistanceToCamera: rootTile.distanceToCamera !== undefined,
                    distanceToCamera: rootTile.distanceToCamera,
                    geometricError: rootTile.geometricError
                });
                
                // Check bounding volume
                const boundingVolume = rootTile._boundingVolume;
                const boundingSphere = boundingVolume?.boundingSphere;
                
                console.log('🔍 BOUNDING VOLUME DEBUG:', {
                    hasBoundingVolume: !!boundingVolume,
                    boundingVolumeType: boundingVolume?.constructor?.name,
                    hasBoundingSphere: !!boundingSphere,
                    sphereCenter: boundingSphere?.center,
                    sphereRadius: boundingSphere?.radius
                });
                
                // Check camera using the current frameState from update method  
                const currentCamera = this.createCesiumCamera();
                console.log('📷 CAMERA DEBUG:', {
                    hasCamera: !!currentCamera,
                    hasPositionWC: !!currentCamera?.positionWC,
                    positionWC: currentCamera?.positionWC,
                    cameraType: currentCamera?.constructor?.name || typeof currentCamera
                });
                
                // MANUAL DISTANCE CALCULATION TEST
                if (boundingSphere && currentCamera?.positionWC) {
                    try {
                        const distance = Cesium.Cartesian3.distance(
                            boundingSphere.center, 
                            currentCamera.positionWC
                        );
                        const finalDistance = Math.max(0, distance - boundingSphere.radius);
                        
                        console.log('🧮 MANUAL DISTANCE CALCULATION:', {
                            rawDistance: distance,
                            sphereRadius: boundingSphere.radius,
                            finalDistance: finalDistance
                        });
                    } catch (error) {
                        console.error('❌ Manual distance calculation failed:', error);
                    }
                } else {
                    console.warn('⚠️ Cannot calculate manual distance - missing bounding sphere or camera position');
                }
                
                // TEST: Try calling Cesium's distance method directly with a mock frameState
                try {
                    const mockFrameState = this.createMockFrameState(); 
                    const cesiumDistance = rootTile.distanceToTile(mockFrameState);
                    console.log('🎯 CESIUM distanceToTile() RESULT:', cesiumDistance);
                } catch (error) {
                    console.error('❌ Cesium distanceToTile() failed:', error);
                }
                
            } catch (error) {
                console.error('❌ Distance debug analysis failed:', error);
            }
        }
    }

    /**
     * Debug Cesium RequestScheduler internal state
     */
    private debugRequestSchedulerState(): void {
        const RequestScheduler = (Cesium as any).RequestScheduler;
        if (RequestScheduler) {
            console.log('🔍 CESIUM REQUEST SCHEDULER STATE:', {
                maximumRequests: RequestScheduler.maximumRequests,
                maximumRequestsPerServer: RequestScheduler.maximumRequestsPerServer,
                requestsByServer: Object.keys(RequestScheduler.requestsByServer || {}),
                numberOfActiveRequests: RequestScheduler.numberOfActiveRequests || 0,
                numberOfActiveRequestsByType: RequestScheduler.numberOfActiveRequestsByType || {},
                throttleRequests: RequestScheduler.throttleRequests
            });
            
            // Check if Google requests are being throttled
            const googleRequests = RequestScheduler.requestsByServer?.['tile.googleapis.com'];
            if (googleRequests) {
                console.log('🔍 GOOGLE TILE REQUESTS:', {
                    count: googleRequests.length,
                    states: googleRequests.map((req: any) => ({ url: req.url, state: req.state, type: req.requestType }))
                });
            }
        }
    }

    /**
     * Test direct fetch to check CORS/network issues
     */
    private async testDirectFetch(): Promise<void> {
        const testUrl = 'https://tile.googleapis.com/v1/3dtiles/datasets/CgIYAQ/files/AJVsH2yWFFvgGfzeb9ahPmR-XoKB6aOxWlKoxBfdfXLJhZToHU0H5tH-2Ai4tD_miFQ5FZIk26n4qcm1--blTLzKlGN7nItOictUJ4A3CgPbjRG_ISq85FGVPVXy.glb?session=CMrJzO2l9P2bBxD8paDJBg&key=AIzaSyAuJtuLbQ1mMTDg9aEAbYP0HQJLYTbjybg';
        
        try {
            console.log(`🧪 TESTING: Direct fetch to Google tile server...`);
            const response = await fetch(testUrl, {
                method: 'HEAD', // Just check headers, don't download data
                mode: 'cors'
            });
            console.log(`✅ FETCH SUCCESS: ${response.status} ${response.statusText}`);
            console.log(`   Response headers:`, Object.fromEntries(response.headers.entries()));
        } catch (error) {
            console.error(`❌ FETCH FAILED: ${error}`);
            console.log(`🚨 NETWORK ISSUE: This explains why tiles aren't loading!`);
        }
    }

    /**
     * Analyze pending requests to see why content isn't loading
     */
    private analyzePendingRequests(): void {
        // Look for tiles that are requesting content but stuck
        if (this.cesiumTileset?.root) {
            this.findTilesWithPendingRequests(this.cesiumTileset.root, 0);
        }
    }
    
    private findTilesWithPendingRequests(tile: any, depth: number): void {
        if (depth > 5) return; // Limit depth to avoid spam
        
        // Check if this tile has a pending content request
        if (tile._contentState === 1 || tile._contentState === 2) { // LOADING = 1, PROCESSING = 2
            console.log(`🔄 PENDING: Depth ${depth}, State: ${tile._contentState}, URL: ${tile._contentResource?.url || 'no URL'}`);
        }
        
        if (tile.children) {
            for (const child of tile.children) {
                this.findTilesWithPendingRequests(child, depth + 1);
            }
        }
    }

    /**
     * Count tiles by content state for debugging
     */
    private countTileStates(tile: any): {total: number, withContent: number, ready: number, empty: number} {
        let counts = {total: 1, withContent: 0, ready: 0, empty: 0};
        
        if (tile._content) {
            counts.withContent++;
            if (tile._contentState === 3) counts.ready++; // READY = 3
            if (tile._content.constructor?.name === 'Empty3DTileContent') counts.empty++;
        }
        
        if (tile.children) {
            for (const child of tile.children) {
                const childCounts = this.countTileStates(child);
                counts.total += childCounts.total;
                counts.withContent += childCounts.withContent;
                counts.ready += childCounts.ready;
                counts.empty += childCounts.empty;
            }
        }
        
        return counts;
    }

    /**
     * PHASE 1: Analyze tile tree structure for diagnostics
     */
    private analyzeTileTree(tile: any, depth: number, maxDepth: number): void {
        if (depth > maxDepth) return;
        
        const indent = '  '.repeat(depth);
        const contentType = tile._content?.constructor?.name || 'none';
        const isSelected = this.cesiumTileset?.selectedTiles?.includes(tile) || false;
        
        console.log(`${indent}📦 Depth ${depth}: geomError=${tile.geometricError}, ` +
                   `children=${tile.children?.length || 0}, content=${contentType}, ` +
                   `selected=${isSelected}, visible=${tile._visible}`);
        
        // Recurse into children
        if (tile.children) {
            for (const child of tile.children) {
                this.analyzeTileTree(child, depth + 1, maxDepth);
            }
        }
    }



    /**
     * Create complete Cesium camera matching working commit 72dfb2e
     */


    // REMOVED: Manual dynamic SSE calculation - now handled by native prePassesUpdate()

    /**
     * Handle canvas resize
     */
    handleCanvasResize(): void {
        // Nothing needed - Cesium will handle it
    }

    /**
     * Get tileset statistics
     */
    getStats(): any {
        if (!this.cesiumTileset) return null;
        return {
            selectedTiles: this.cesiumTileset.selectedTiles?.length || 0,
            ready: !!(this.cesiumTileset.root && this.cesiumTileset.asset)
        };
    }

    /**
     * BABYLON.JS: Set up proper Cesium content factory to create BabylonTileContent
     */
    private setupBabylonContentFactory(): void {
        console.log('🏗️ Setting up Babylon content factory...');
        
        const Cesium3DTileContentFactory = (Cesium as any).Cesium3DTileContentFactory;
        
        if (!Cesium3DTileContentFactory) {
            console.error('❌ Cesium3DTileContentFactory not found - trying alternative approaches...');
            
            // Try to find content factories in different ways
            const alternativeFactories = [
                'Cesium3DTileB3dmContent',
                'Cesium3DTileGltfContent', 
                'Cesium3DTileModelContent',
                'Cesium3DTileContentFactory'
            ];
            
            alternativeFactories.forEach(name => {
                const factory = (Cesium as any)[name];
                console.log(`🔍 ALTERNATIVE ${name}:`, {
                    exists: !!factory,
                    type: typeof factory,
                    methods: factory ? Object.keys(factory) : 'N/A'
                });
            });
            
            return;
        }
        
        const babylonScene = this.camera.getScene();
        
        // CESIUM EXACT PATTERN: Replace factory methods with our implementations
        // Following the exact same approach as Cesium's Cesium3DTileContentFactory.js
        
        // Store originals for fallback and tracking
        const originalB3dm = Cesium3DTileContentFactory.b3dm;
        const originalGlb = Cesium3DTileContentFactory.glb;
        const originalPnts = Cesium3DTileContentFactory.pnts;
        const originalI3dm = Cesium3DTileContentFactory.i3dm;
        const originalGltf = Cesium3DTileContentFactory.gltf;
        
        // Track ALL factory method calls to understand coverage
        const factoryCallCounts = { b3dm: 0, glb: 0, pnts: 0, i3dm: 0, gltf: 0, other: 0 };
        
        // RE-ENABLE FACTORY: Use working commit's pattern with proper Cesium interface
        console.log('🔧 FACTORY: Re-enabling with proper Cesium integration');
        console.log('   Following working commit pattern - let Cesium handle tile properties');
        
        // Replace B3DM factory method  
        Cesium3DTileContentFactory.b3dm = function(tileset: any, tile: any, resource: any, arrayBuffer: ArrayBuffer, byteOffset: number) {
            factoryCallCounts.b3dm++;
            console.log(`🏭 CESIUM B3DM FACTORY: Called with Babylon override (${factoryCallCounts.b3dm})`);
            return SimpleBabylonTileContent.fromB3dm(tileset, tile, resource, arrayBuffer, byteOffset, babylonScene);
        };
        
        // Replace GLB factory method
        Cesium3DTileContentFactory.glb = function(tileset: any, tile: any, resource: any, arrayBuffer: ArrayBuffer, byteOffset: number) {
            factoryCallCounts.glb++;
            // GLB factory creating Babylon content
            
            // Extract GLB data from the offset
            const glbData = arrayBuffer.slice(byteOffset);
            return SimpleBabylonTileContent.fromGltf(tileset, tile, resource, glbData, babylonScene);
        };
        
        // Hook other factory methods for tracking (without replacing functionality)
        Cesium3DTileContentFactory.pnts = function(tileset: any, tile: any, resource: any, arrayBuffer: ArrayBuffer, byteOffset: number) {
            factoryCallCounts.pnts++;
            console.log(`📍 CESIUM PNTS FACTORY: Called (${factoryCallCounts.pnts}) - using original`);
            return originalPnts.call(this, tileset, tile, resource, arrayBuffer, byteOffset);
        };
        
        Cesium3DTileContentFactory.i3dm = function(tileset: any, tile: any, resource: any, arrayBuffer: ArrayBuffer, byteOffset: number) {
            factoryCallCounts.i3dm++;
            console.log(`🏗️ CESIUM I3DM FACTORY: Called (${factoryCallCounts.i3dm}) - using original`);
            return originalI3dm.call(this, tileset, tile, resource, arrayBuffer, byteOffset);
        };
        
        Cesium3DTileContentFactory.gltf = function(tileset: any, tile: any, resource: any, json: any) {
            factoryCallCounts.gltf++;
            console.log(`🎭 CESIUM GLTF FACTORY: Called (${factoryCallCounts.gltf}) - using original`);
            return originalGltf.call(this, tileset, tile, resource, json);
        };
        
        // Add periodic factory call summary
        setInterval(() => {
            const totalCalls = Object.values(factoryCallCounts).reduce((sum, count) => sum + count, 0);
            if (totalCalls > 0) {
                console.log(`📊 FACTORY CALL SUMMARY: Total=${totalCalls}`, factoryCallCounts);
            }
        }, 10000); // Every 10 seconds
        
        const hooksApplied = 5; // B3DM + GLB + PNTS + I3DM + GLTF tracking
        
        console.log(`✅ Babylon factory ready (${hooksApplied} methods hooked with tracking)`);
    }


    /**
     * DEBUGGING: Add tile content request promise monitoring
     */
    private setupCesiumRequestDebugging(): void {
        // Monitor successful content loading only (undefined returns are normal throttling)
        const Cesium3DTilePrototype = (Cesium as any).Cesium3DTile?.prototype;
        if (Cesium3DTilePrototype?.requestContent) {
            const originalRequestContent = Cesium3DTilePrototype.requestContent;
            Cesium3DTilePrototype.requestContent = function() {
                if (this._contentResource?.url?.includes('tile.googleapis.com')) {
                    // DEBUG: Check tile priority before request
                    let tileInfo = '';
                    if (this._priority !== undefined) {
                        tileInfo = `priority=${this._priority.toFixed(2)}, depth=${this._depth || 0}`;
                    }
                    
                    const promise = originalRequestContent.call(this);
                    
                    // Only log when content actually loads (factory gets called)
                    if (promise && typeof promise.then === 'function') {
                        promise.then((content: any) => {
                        }).catch((error: any) => {
                            console.error('❌ Content failed:', error.message || error);
                        });
                    } else {
                        // Throttling is normal - no logging needed
                    }
                    
                    return promise;
                }
                return originalRequestContent.call(this);
            };
            
            console.log('✅ Monitoring tile content requests (throttling is normal)');
            console.log('   Expecting some tiles to eventually succeed and trigger factory...');
            
            // DEBUG: Check RequestScheduler configuration
            const RequestScheduler = (Cesium as any).RequestScheduler;
            if (RequestScheduler) {
                console.log('🔧 RequestScheduler config:', {
                    maximumRequests: RequestScheduler.maximumRequests,
                    maximumRequestsPerServer: RequestScheduler.maximumRequestsPerServer,
                    numberOfActiveRequests: RequestScheduler.numberOfActiveRequests,
                    numberOfPendingRequests: RequestScheduler.numberOfPendingRequests
                });
            }
        }
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
        
        // NO MANUAL MANIPULATION - Let Cesium handle everything naturally
    }

    // REMOVED: ensureRootTileHasRenderableContent - using proper empty content detection instead

    // Removed old complex tile request hooking - now using proper content factory

    /**
     * DEBUG: Add BaseTraversal request decision logging to understand tile loading choices
     */
    private addBaseTraversalRequestLogging(): void {
        if (!(this.cesiumTileset as any)._requestLoggingSetup) {
            (this.cesiumTileset as any)._requestLoggingSetup = true;
            
            // REMOVED: BaseTraversal.selectTiles hook was interfering with tile selection
            // Let Cesium's native tile selection logic run unimpeded
            
            // Hook into individual tile loading decision - Cesium3DTilesetTraversal.loadTile()
            // DISABLED: Too verbose now that tiles are working
            // const TilesetTraversal = (Cesium as any).Cesium3DTilesetTraversal;
            // if (TilesetTraversal && TilesetTraversal.loadTile) {
            //     console.log('✅ TilesetTraversal.loadTile() monitoring available but disabled for noise reduction');
            // }
            
            // Hook into tile request content - this is where tiles actually get queued for loading
            const Cesium3DTilePrototype = (Cesium as any).Cesium3DTile?.prototype;
            if (Cesium3DTilePrototype && Cesium3DTilePrototype.requestContent && !(Cesium3DTilePrototype as any)._requestContentLogged) {
                (Cesium3DTilePrototype as any)._requestContentLogged = true;
                
                const originalRequestContent = Cesium3DTilePrototype.requestContent;
                Cesium3DTilePrototype.requestContent = function() {
                    // REDUCED LOGGING: Only log results, not every request attempt
                    const promise = originalRequestContent.call(this);
                    
                    if (promise) {
                        promise.then((content: any) => {
                        }).catch((error: any) => {
                            console.error('❌ Tile loading failed:', {
                                depth: this._depth || 'unknown', 
                                error: error.message || error,
                                url: this._contentResource?.url?.split('/').pop()?.split('?')[0] || 'unknown'
                            });
                        });
                    }
                    // No longer log throttling - it's normal and too noisy
                    
                    return promise;
                };
                console.log('✅ Enhanced tile request logging');
            }
            
            // Hook BaseTraversal's key decision points for REPLACE refinement
            this.hookReplaceRefinementLogging();
        }
    }
    
    /**
     * DEEP ANALYSIS: Simulate BaseTraversal's REPLACE refinement algorithm exactly
     */
    private analyzeReplaceRefinementTree(tile: any, depth: number, maxDepth: number): void {
        if (depth > maxDepth) return;
        
        const indent = '  '.repeat(depth + 1);
        const Cesium3DTileRefine = (Cesium as any).Cesium3DTileRefine;
        const isReplace = tile.refine === Cesium3DTileRefine?.REPLACE;
        
        console.log(`${indent}📋 DEPTH ${depth} TILE ANALYSIS:`);
        console.log(`${indent}   ID: ${tile.id || 'unknown'}`);
        console.log(`${indent}   Refinement: ${isReplace ? 'REPLACE' : tile.refine}`);
        console.log(`${indent}   GeometricError: ${tile.geometricError}`);
        console.log(`${indent}   HasRenderableContent: ${tile.hasRenderableContent}`);
        console.log(`${indent}   HasEmptyContent: ${tile.hasEmptyContent}`);
        console.log(`${indent}   ContentAvailable: ${tile.contentAvailable}`);
        console.log(`${indent}   ContentState: ${tile._contentState}`);
        console.log(`${indent}   InRequestVolume: ${tile._inRequestVolume}`);
        console.log(`${indent}   Children: ${tile.children?.length || 0}`);
        
        if (isReplace && tile.hasRenderableContent && tile.children) {
            console.log(`${indent}   🔍 REPLACE REFINEMENT ANALYSIS:`);
            
            // Simulate BaseTraversal's exact logic
            let refines = true;
            const blockingChildren = [];
            
            for (let i = 0; i < tile.children.length; i++) {
                const child = tile.children[i];
                let childRefines = false;
                let blockingReason = '';
                
                if (!child._inRequestVolume) {
                    childRefines = false;
                    blockingReason = '_inRequestVolume=false';
                } else if (!child.hasRenderableContent) {
                    // This would trigger executeEmptyTraversal
                    childRefines = this.simulateExecuteEmptyTraversal(child);
                    blockingReason = childRefines ? 'executeEmptyTraversal=true' : 'executeEmptyTraversal=false (blocking)';
                } else {
                    childRefines = child.contentAvailable;
                    blockingReason = child.contentAvailable ? 'contentAvailable=true' : 'contentAvailable=false (blocking)';
                }
                
                refines = refines && childRefines;
                
                console.log(`${indent}     Child ${i}:`, {
                    childRefines,
                    blockingReason,
                    hasRenderableContent: child.hasRenderableContent,
                    contentAvailable: child.contentAvailable,
                    contentState: child._contentState,
                    inRequestVolume: child._inRequestVolume
                });
                
                if (!childRefines) {
                    blockingChildren.push({index: i, reason: blockingReason, child});
                }
            }
            
            console.log(`${indent}   🎯 REFINEMENT RESULT:`);
            console.log(`${indent}     AllChildrenRefine: ${refines}`);
            console.log(`${indent}     TileCanSelect: ${!refines} (stoppedRefining)`);
            console.log(`${indent}     BlockingChildren: ${blockingChildren.length}/${tile.children.length}`);
            
            if (blockingChildren.length > 0) {
                console.log(`${indent}   ❌ BLOCKING CHILDREN ANALYSIS:`);
                blockingChildren.forEach(({index, reason, child}) => {
                    console.log(`${indent}     Child ${index} blocks because: ${reason}`);
                    if (!child.hasRenderableContent) {
                        console.log(`${indent}       └── Needs executeEmptyTraversal (structural tile)`);
                        console.log(`${indent}           └── This should recurse to grandchildren...`);
                    } else if (!child.contentAvailable) {
                        console.log(`${indent}       └── Needs content loading (hasRenderableContent=true but not loaded)`);
                        console.log(`${indent}           └── Should trigger requestContent()...`);
                    }
                });
            }
        }
        
        // Recurse to children
        if (tile.children && depth < maxDepth - 1) {
            tile.children.forEach((child: any) => {
                this.analyzeReplaceRefinementTree(child, depth + 1, maxDepth);
            });
        }
    }
    
    /**
     * Simulate executeEmptyTraversal algorithm to understand blocking
     */
    private simulateExecuteEmptyTraversal(tile: any): boolean {
        // If tile has empty content, it can always refine
        if (tile.hasEmptyContent) {
            return true;
        }
        
        // If tile has renderable content, check if it's available
        if (tile.hasRenderableContent) {
            return tile.contentAvailable;
        }
        
        // If tile has children, recursively check them
        if (tile.children && tile.children.length > 0) {
            return tile.children.every((child: any) => this.simulateExecuteEmptyTraversal(child));
        }
        
        // Leaf tile with no content - can refine
        return true;
    }
    
    /**
     * DEBUG: Hook REPLACE refinement decision making in BaseTraversal
     */
    private hookReplaceRefinementLogging(): void {
        // Try to find and hook the executeEmptyTraversal function
        const executeEmptyTraversalKey = Object.getOwnPropertyNames(Cesium).find(key => 
            key.includes('executeEmptyTraversal') || key.includes('EmptyTraversal')
        );
        
        if (executeEmptyTraversalKey && (Cesium as any)[executeEmptyTraversalKey]) {
            console.log(`🎯 Found executeEmptyTraversal at: ${executeEmptyTraversalKey}`);
            
            const originalExecuteEmptyTraversal = (Cesium as any)[executeEmptyTraversalKey];
            (Cesium as any)[executeEmptyTraversalKey] = function(tile: any, frameState: any) {
                console.log('🏗️ executeEmptyTraversal() CALLED:', {
                    tileId: tile.id || 'unknown',
                    depth: tile._depth || 'unknown',
                    hasEmptyContent: tile.hasEmptyContent,
                    hasRenderableContent: tile.hasRenderableContent,
                    childrenCount: tile.children?.length || 0
                });
                
                const result = originalExecuteEmptyTraversal.call(this, tile, frameState);
                
                console.log('🏗️ executeEmptyTraversal() RESULT:', {
                    tileId: tile.id || 'unknown',
                    canRefine: result,
                    reason: result ? 'All descendants loaded or empty' : 'Some descendants still need loading'
                });
                
                return result;
            };
            
            console.log('✅ Hooked executeEmptyTraversal()');
        }
        
        // REMOVED: BaseTraversal.selectTiles hook was interfering with tile selection
        // Let Cesium's native tile selection logic run unimpeded
        console.log('🎯 TILE SELECTION: Using native Cesium algorithms without interference');
        
        // Look for other BaseTraversal internal functions
        Object.getOwnPropertyNames(Cesium).forEach(key => {
            if (key.toLowerCase().includes('traversal') || key.toLowerCase().includes('refine') || key.toLowerCase().includes('select')) {
                const obj = (Cesium as any)[key];
                if (typeof obj === 'function' || (obj && typeof obj === 'object')) {
                    console.log(`   Found traversal-related: ${key} (${typeof obj})`);
                }
            }
        });
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
     * Monitor tile selection for parent hiding issues
     */
    private monitorTileSelection(): void {
        if (!this.cesiumTileset) return;
        
        // Check selected tiles for parent-child overlap
        const selectedTiles = this.cesiumTileset.selectedTiles || [];
        const stats = this.cesiumTileset.statistics;
        
        if (selectedTiles.length > 0) {
            // Group tiles by depth
            const tilesByDepth: { [depth: number]: any[] } = {};
            const parentChildPairs: Array<{parent: any, children: any[]}> = [];
            
            for (const tile of selectedTiles) {
                const depth = tile._depth || 0;
                if (!tilesByDepth[depth]) {
                    tilesByDepth[depth] = [];
                }
                tilesByDepth[depth].push(tile);
                
                // Check if this tile has selected children
                if (tile.children) {
                    const selectedChildren = tile.children.filter((child: any) => 
                        child._selectedFrame === this.cesiumTileset._selectedFrame
                    );
                    
                    if (selectedChildren.length > 0) {
                        parentChildPairs.push({ parent: tile, children: selectedChildren });
                    }
                }
            }
            
            console.log('🔍 TILE SELECTION ANALYSIS:', {
                totalSelected: selectedTiles.length,
                tilesByDepth: Object.keys(tilesByDepth).map(depth => 
                    `Depth ${depth}: ${tilesByDepth[parseInt(depth)].length} tiles`
                ),
                parentChildOverlaps: parentChildPairs.length,
                memoryUsage: `${(stats.geometryByteLength || 0) / 1024 / 1024} MB`,
                refinementStrategy: this.cesiumTileset.skipLevelOfDetail ? 'SkipTraversal' : 'BaseTraversal'
            });
            
            // Report parent-child overlap issues
            if (parentChildPairs.length > 0) {
                console.log('⚠️ PARENT-CHILD OVERLAP DETECTED:', {
                    count: parentChildPairs.length,
                    examples: parentChildPairs.slice(0, 3).map(pair => ({
                        parentDepth: pair.parent._depth,
                        parentId: pair.parent.id || 'no-id',
                        selectedChildrenCount: pair.children.length,
                        childDepths: pair.children.map((c: any) => c._depth)
                    }))
                });
                
                console.log('💡 REFINEMENT HINT: In REPLACE refinement, parent tiles should be hidden when children are selected');
            }
        }
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

    /**
     * Log geographic bounds mismatch between camera position and loaded tiles
     */
    private logTileGeographicMismatch(cameraLat: number, cameraLon: number): void {
        if (!this.cesiumTileset) {
            console.log('❌ No cesiumTileset for geographic analysis');
            return;
        }
        
        console.log('🌍 GEOGRAPHIC BOUNDS ANALYSIS:');
        console.log(`   Camera Position: ${cameraLat.toFixed(4)}°, ${cameraLon.toFixed(4)}° (NYC expected)`);
        
        // COORDINATE DEBUG: Log camera ECEF for comparison with tile ECEF
        const cameraECEF = this.createCesiumCamera().position;
        console.log(`   Camera ECEF: (${cameraECEF.x.toFixed(0)}, ${cameraECEF.y.toFixed(0)}, ${cameraECEF.z.toFixed(0)})`);
        console.log(`   Expected NYC ECEF: (1333425, -4663874, 4142833) - should be close to camera`);
        
        // Get all loaded/ready tiles and their geographic bounds
        const allTiles = this.getAllTilesWithContent();
        const selectedTiles = this.cesiumTileset.selectedTiles || [];
        const nycBounds = { latMin: 40.0, latMax: 41.0, lonMin: -75.0, lonMax: -73.0 }; // Approximate NYC area
        
        console.log(`   Total tiles with content: ${allTiles.length}`);
        console.log(`   Selected tiles: ${selectedTiles.length}`);
        
        if (allTiles.length === 0) {
            console.log('   ⚠️ No tiles loaded yet - skipping geographic analysis');
            return;
        }
        
        let nycAreaTiles = 0;
        let wrongRegionTiles = 0;
        const regions: any = {};
        
        allTiles.forEach((tile, i) => {
            if (tile.boundingSphere && i < 15) { // Log first 15 tiles for detailed analysis
                const center = tile.boundingSphere.center;
                const cartographic = Cesium.Cartographic.fromCartesian(center);
                if (cartographic) {
                    const lat = Cesium.Math.toDegrees(cartographic.latitude);
                    const lon = Cesium.Math.toDegrees(cartographic.longitude);
                    const radius = tile.boundingSphere.radius;
                    
                    const isNYCArea = lat >= nycBounds.latMin && lat <= nycBounds.latMax && 
                                     lon >= nycBounds.lonMin && lon <= nycBounds.lonMax;
                    
                    if (isNYCArea) nycAreaTiles++;
                    else wrongRegionTiles++;
                    
                    // Track regions
                    const region = `${Math.round(lat/45)*45}°/${Math.round(lon/45)*45}°`;
                    regions[region] = (regions[region] || 0) + 1;
                    
                    // COORDINATE DEBUG: Log both ECEF and Geographic for comparison
                    const cameraECEF = this.createCesiumCamera().position;
                    const distanceKm = Cesium.Cartesian3.distance(center, cameraECEF) / 1000;
                    console.log(`     Tile ${i}: ${lat.toFixed(1)}°, ${lon.toFixed(1)}° (r=${(radius/1000).toFixed(0)}km) ${isNYCArea ? '✅NYC' : '❌WRONG'}`);
                    console.log(`       ECEF: (${center.x.toFixed(0)}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)}) dist=${distanceKm.toFixed(0)}km`);
                }
            }
        });
        
        console.log(`   NYC Area Tiles: ${nycAreaTiles} / ${allTiles.length} (${(100*nycAreaTiles/Math.max(allTiles.length,1)).toFixed(1)}%)`);
        console.log(`   Wrong Region Tiles: ${wrongRegionTiles} / ${allTiles.length} (${(100*wrongRegionTiles/Math.max(allTiles.length,1)).toFixed(1)}%)`);
        console.log(`   Geographic Distribution:`, Object.keys(regions).map(r => `${r}:${regions[r]}`).join(', '));
        
        if (wrongRegionTiles > nycAreaTiles) {
            console.log('   🚨 CRITICAL: More wrong-region tiles than NYC tiles! Tile selection algorithm issue.');
        }
        
        // DEBUG: Check selected vs loaded tiles
        console.log(`   SELECTION ISSUE: ${selectedTiles.length} selected vs ${allTiles.length} loaded`);
        if (selectedTiles.length === 0 && allTiles.length > 0) {
            console.log('   🔍 HYPOTHESIS: Tiles loaded but none selected - coordinate or culling issue');
        }
        
        // COORDINATE VERIFICATION: Convert expected NYC ECEF back to lat/lon
        const expectedNYC_ECEF = new Cesium.Cartesian3(1333425, -4663874, 4142833);
        const expectedCartographic = Cesium.Cartographic.fromCartesian(expectedNYC_ECEF);
        if (expectedCartographic) {
            const expectedLat = Cesium.Math.toDegrees(expectedCartographic.latitude);
            const expectedLon = Cesium.Math.toDegrees(expectedCartographic.longitude);
            console.log(`   Reverse check NYC ECEF → ${expectedLat.toFixed(4)}°, ${expectedLon.toFixed(4)}° (should be 40.69°, -74.04°)`);
        }
    }
    
    /**
     * Get all tiles that have loaded content (for geographic analysis)
     */
    private getAllTilesWithContent(): any[] {
        if (!this.cesiumTileset) return [];
        
        const tilesWithContent: any[] = [];
        let totalTilesChecked = 0;
        
        const collectTiles = (tile: any) => {
            totalTilesChecked++;
            if (tile._content && tile._content.ready) {
                tilesWithContent.push(tile);
            }
            if (tile.children) {
                tile.children.forEach(collectTiles);
            }
        };
        
        if (this.cesiumTileset.root) {
            collectTiles(this.cesiumTileset.root);
        }
        
        // Debug tile collection
        if (this.frameCount % 180 === 0) {
            console.log(`🔍 TILE COLLECTION: Found ${tilesWithContent.length} ready tiles out of ${totalTilesChecked} total checked`);
        }
        
        return tilesWithContent;
    }
}