import { Camera, Engine, Vector3 } from '@babylonjs/core';
import * as Cesium from 'cesium';
import CesiumTilesetDerived from './cesium_derived/CesiumTilesetDerived.js';
import { BabylonTileContent } from './BabylonTileContent';

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
     * Load Google Photorealistic 3D Tiles using Cesium's exact configuration
     */
    async loadGooglePhotorealistic3DTiles(assetId: number): Promise<void> {
        try {
            // Use Cesium's standard approach exactly - but with our derived tileset
            const resource = await Cesium.IonResource.fromAssetId(assetId);
            
            // OFFICIAL CESIUM GOOGLE 3D TILES CONFIG: Match createGooglePhotorealistic3DTileset exactly
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

        // Create frameState exactly like Cesium Scene does
        const camera = this.createCesiumCamera();
        if (!camera) {
            console.error('Failed to create Cesium camera');
            return;
        }

        let cullingVolume;
        try {
            cullingVolume = camera.frustum.computeCullingVolume(camera.position, camera.direction, camera.up);
        } catch (error) {
            console.error('Failed to compute culling volume:', error);
            return;
        }

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
        
        // DEBUG: Enhanced request and tile loading monitoring with deep scheduler analysis
        if (Date.now() % 15000 < 16) { // Every 15 seconds
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
                
                const readyChildren = childrenStates.filter(c => c.contentAvailable).length;
                console.log(`   Children progress: ${readyChildren}/${root.children.length} ready`);
            }
        }
        
        // DEBUG: FRUSTUM ALIGNMENT - Compare Babylon vs Cesium 
        if (Date.now() % 15000 < 16) { // Every 15 seconds
            const babylonCamera = this.camera;
            console.log('🔍 FRUSTUM ALIGNMENT CHECK:');
            console.log('   Babylon Camera:', {
                fov: `${(babylonCamera.fov * 180 / Math.PI).toFixed(1)}°`,
                minZ: babylonCamera.minZ,
                maxZ: babylonCamera.maxZ,
                position: `(${babylonCamera.position.x.toFixed(0)}, ${babylonCamera.position.y.toFixed(0)}, ${babylonCamera.position.z.toFixed(0)})`
            });
            console.log('   Cesium Camera:', {
                fov: `${(camera.frustum.fov * 180 / Math.PI).toFixed(1)}°`,
                near: camera.frustum.near,
                far: camera.frustum.far,
                aspectRatio: camera.frustum.aspectRatio?.toFixed(3) || 'undefined',
                position: `(${camera.position.x.toFixed(0)}, ${camera.position.y.toFixed(0)}, ${camera.position.z.toFixed(0)})`
            });
            console.log('   Context:', {
                drawingBufferWidth: frameState.context.drawingBufferWidth,
                drawingBufferHeight: frameState.context.drawingBufferHeight,
                computedAspectRatio: (frameState.context.drawingBufferWidth / frameState.context.drawingBufferHeight).toFixed(3),
                cullingVolumeExists: !!cullingVolume,
                // NEW: Show the missing properties we added
                hasTime: !!frameState.time,
                newFrame: frameState.newFrame,
                timeSeconds: frameState.time ? Cesium.JulianDate.toDate(frameState.time).getTime() : 'none'
            });
        }

        try {
            // Log camera position occasionally to verify setup
            if (Date.now() % 5000 < 16) { // ~Every 5 seconds
                console.log('🎥 Camera position check:', {
                    cesiumPos: { x: camera.position.x.toFixed(0), y: camera.position.y.toFixed(0), z: camera.position.z.toFixed(0) },
                    direction: { x: camera.direction.x.toFixed(3), y: camera.direction.y.toFixed(3), z: camera.direction.z.toFixed(3) },
                    babylonPos: { x: this.camera.position.x.toFixed(0), y: this.camera.position.y.toFixed(0), z: this.camera.position.z.toFixed(0) }
                });
            }
            
            // DEBUG: Add BaseTraversal request decision logging  
            this.addBaseTraversalRequestLogging();
            
            // PHASE 1: Comprehensive diagnostic logging
            if (Date.now() % 3000 < 16) { // Every 3 seconds
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
            
            // PHASE 1: Post-update traversal analysis
            if (Date.now() % 3000 < 16) { // Every 3 seconds - same timing as pre-update
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
                console.log(`🎯 Tiles: ${selectedCount} selected, ready: ${readyState}`);
            }
            
            // Update frame tracking for next frame
            this.lastFrameNumber = this.frameCount;
        } catch (error) {
            console.error('Error updating tileset:', error);
        }
    }

    /**
     * BABYLON.JS: Replace native Cesium tile content with BabylonTileContent
     * This intercepts tiles after native processing and replaces their content
     */
    private replaceTileContent(): void {
        if (!this.cesiumTileset || !this.cesiumTileset.root) return;

        // Get Babylon scene from camera
        const babylonScene = this.camera.getScene();
        const Cesium3DTileContentState = (Cesium as any).Cesium3DTileContentState;

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

        // Traverse all tiles to find ones with native content that need replacement
        this.traverseTilesForContentReplacement(this.cesiumTileset.root, babylonScene, Cesium3DTileContentState);
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
     * Recursively traverse tiles to replace native content with BabylonTileContent
     */
    private traverseTilesForContentReplacement(tile: any, babylonScene: any, Cesium3DTileContentState: any): void {
        // Check if tile has native content that needs replacement with Babylon content
        if (tile._content && 
            tile._contentState === Cesium3DTileContentState.READY &&
            !(tile._content instanceof BabylonTileContent)) {
            
            // Skip Empty3DTileContent - these are structural/placeholder tiles with no data
            if (tile._content.constructor?.name === 'Empty3DTileContent') {
                // Quiet down - only log empty tiles occasionally to avoid spam
                if (Date.now() % 15000 < 16) { // Every 15 seconds
                    console.log('📭 Skipping Empty3DTileContent (structural tile with no data)');
                }
                return;
            }
            
            try {
                // DEBUG: Log native content structure to understand what data is available
                console.log('🔍 Native content structure:', {
                    contentType: tile._content.constructor?.name,
                    hasArrayBuffer: !!tile._content._arrayBuffer,
                    hasRequest: !!tile._content._request,
                    hasResource: !!tile._content._resource,
                    hasUrl: !!tile._content._url,
                    properties: Object.keys(tile._content).filter(key => !key.startsWith('_')),
                    privateProperties: Object.keys(tile._content).filter(key => key.startsWith('_'))
                });

                // Try to extract ArrayBuffer from different possible locations in native content
                let arrayBuffer = null;
                
                // Check common locations where Cesium might store the raw data
                if (tile._content._arrayBuffer) {
                    arrayBuffer = tile._content._arrayBuffer;
                    console.log('📦 Found ArrayBuffer in _arrayBuffer property');
                } else if (tile._content._request && tile._content._request.response) {
                    arrayBuffer = tile._content._request.response;
                    console.log('📦 Found ArrayBuffer in _request.response');
                } else if (tile._content.arrayBuffer) {
                    arrayBuffer = tile._content.arrayBuffer;
                    console.log('📦 Found ArrayBuffer in arrayBuffer property');
                } else {
                    // If no ArrayBuffer found, create empty one and log warning
                    arrayBuffer = new ArrayBuffer(0);
                    console.warn('⚠️ No ArrayBuffer found in native content, using empty buffer');
                }

                console.log('📦 ArrayBuffer info:', {
                    size: arrayBuffer?.byteLength || 0,
                    type: arrayBuffer?.constructor?.name || 'null'
                });
                
                // Create BabylonTileContent to replace native content
                console.log(`🔄 REPLACING: Creating BabylonTileContent for tile ${tile.id || 'unknown'} with ${arrayBuffer?.byteLength || 0} bytes`);
                const babylonContent = new BabylonTileContent(babylonScene, tile, arrayBuffer, this.cesiumTileset);
                
                // Replace the content
                tile._content.destroy?.(); // Destroy native content if it has destroy method
                tile._content = babylonContent;
                
                console.log(`🔄 Replaced native content with BabylonTileContent for tile`);
            } catch (error) {
                console.error('Failed to replace tile content:', error);
            }
        }

        // Traverse child tiles
        if (tile.children) {
            for (const child of tile.children) {
                this.traverseTilesForContentReplacement(child, babylonScene, Cesium3DTileContentState);
            }
        }
    }


    /**
     * Create complete Cesium camera matching working commit 72dfb2e
     */
    private createCesiumCamera(): any {
        // Get Babylon camera position and direction
        const babylonPos = this.camera.position;
        const babylonDir = this.camera.getDirection(Vector3.Forward());
        const babylonUp = this.camera.upVector || Vector3.Up();

        // Transform to Cesium coordinates (Y-up to Z-up)
        const position = new Cesium.Cartesian3(babylonPos.x, babylonPos.z, babylonPos.y);
        const direction = new Cesium.Cartesian3(babylonDir.x, babylonDir.z, babylonDir.y);
        const up = new Cesium.Cartesian3(babylonUp.x, babylonUp.z, babylonUp.y);
        
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
        
        // Hook common content type methods that might be used for Google 3D Tiles
        const potentialMethods = ['b3dm', 'gltf', 'glb', 'model3d', 'model', 'createContent', 'create'];
        let hooksApplied = 0;
        
        potentialMethods.forEach(methodName => {
            const originalMethod = Cesium3DTileContentFactory[methodName];
            if (typeof originalMethod === 'function') {
                Cesium3DTileContentFactory[methodName] = function(...args: any[]) {
                    // Enhanced debugging: Log all factory calls with details
                    const arrayBuffer = args.find((arg: any) => arg instanceof ArrayBuffer);
                    const tile = args.find((arg: any) => arg && typeof arg === 'object' && arg.geometricError !== undefined);
                    const tileset = args.find((arg: any) => arg && typeof arg === 'object' && arg.asset !== undefined);
                    
                    console.log(`🏭 FACTORY CALL: ${methodName}() - Args:`, {
                        argsCount: args.length,
                        hasArrayBuffer: !!arrayBuffer,
                        arrayBufferSize: arrayBuffer ? arrayBuffer.byteLength : 'none',
                        hasTile: !!tile,
                        tileId: tile ? tile.id || 'no-id' : 'none',
                        tileGeomError: tile ? tile.geometricError : 'none',
                        hasTileset: !!tileset
                    });
                    
                    if (arrayBuffer && tile) {
                        console.log(`🎯 CREATING BABYLON CONTENT: ${methodName} for tile ${tile.id || 'unknown'}`);
                        // Creating Babylon content
                        return new BabylonTileContent(babylonScene, tile, arrayBuffer, tileset || this.cesiumTileset);
                    }
                    
                    console.log(`⚠️ FALLBACK: ${methodName} using original method (no arrayBuffer or tile)`);
                    // Fall back to original method
                    return originalMethod.apply(this, args);
                };
                
                hooksApplied++;
            }
        });
        
        console.log(`✅ Babylon factory ready (${hooksApplied} methods hooked)`);
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
                            console.log('✅ Content loaded:', this._contentResource.url?.split('/').pop()?.split('?')[0] || 'unknown');
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
            
            // Hook into Cesium3DTilesetBaseTraversal.selectTiles() if available
            const BaseTraversal = (Cesium as any).Cesium3DTilesetBaseTraversal;
            if (BaseTraversal && BaseTraversal.selectTiles) {
                const originalSelectTiles = BaseTraversal.selectTiles;
                BaseTraversal.selectTiles = function(tileset: any, frameState: any) {
                    console.log('🎯 BaseTraversal.selectTiles() CALLED:', {
                        rootExists: !!tileset.root,
                        frameNumber: frameState.frameNumber,
                        cameraPosition: frameState.camera.position ? 
                            `(${frameState.camera.position.x.toFixed(0)}, ${frameState.camera.position.y.toFixed(0)}, ${frameState.camera.position.z.toFixed(0)})` : 
                            'unknown'
                    });
                    
                    const result = originalSelectTiles.call(this, tileset, frameState);
                    
                    // Log results after traversal
                    console.log('🎯 BaseTraversal.selectTiles() COMPLETE:', {
                        selectedTiles: tileset.selectedTiles?.length || 0,
                        visitedTiles: tileset.statistics?.visited || 0,
                        requestedTiles: tileset.statistics?.numberOfTilesRequested || 0
                    });
                    
                    return result;
                };
                console.log('✅ Hooked BaseTraversal.selectTiles()');
            }
            
            // Hook into individual tile loading decision - Cesium3DTilesetTraversal.loadTile()
            const TilesetTraversal = (Cesium as any).Cesium3DTilesetTraversal;
            if (TilesetTraversal && TilesetTraversal.loadTile) {
                const originalLoadTile = TilesetTraversal.loadTile;
                TilesetTraversal.loadTile = function(tile: any, frameState: any) {
                    console.log('🔄 TilesetTraversal.loadTile() CALLED:', {
                        tileId: tile.id || 'unknown',
                        depth: tile._depth || 'unknown',
                        geometricError: tile.geometricError,
                        hasContent: !!tile._content,
                        contentState: tile._contentState,
                        hasRenderableContent: tile.hasRenderableContent,
                        contentAvailable: tile.contentAvailable
                    });
                    
                    const result = originalLoadTile.call(this, tile, frameState);
                    
                    console.log('🔄 TilesetTraversal.loadTile() RESULT:', {
                        tileId: tile.id || 'unknown',
                        wasLoaded: !!result,
                        newContentState: tile._contentState
                    });
                    
                    return result;
                };
                console.log('✅ Hooked TilesetTraversal.loadTile()');
            }
            
            // Hook into tile request content - this is where tiles actually get queued for loading
            const Cesium3DTilePrototype = (Cesium as any).Cesium3DTile?.prototype;
            if (Cesium3DTilePrototype && Cesium3DTilePrototype.requestContent && !(Cesium3DTilePrototype as any)._requestContentLogged) {
                (Cesium3DTilePrototype as any)._requestContentLogged = true;
                
                const originalRequestContent = Cesium3DTilePrototype.requestContent;
                Cesium3DTilePrototype.requestContent = function() {
                    console.log('📡 Cesium3DTile.requestContent() CALLED:', {
                        tileId: this.id || 'unknown',
                        depth: this._depth || 'unknown',
                        geometricError: this.geometricError,
                        priority: this._priority,
                        url: this._contentResource?.url?.split('/').pop()?.split('?')[0] || 'unknown',
                        contentState: this._contentState
                    });
                    
                    const promise = originalRequestContent.call(this);
                    
                    if (promise) {
                        promise.then((content: any) => {
                            console.log('📡 Cesium3DTile.requestContent() SUCCESS:', {
                                tileId: this.id || 'unknown',
                                contentType: content?.constructor?.name || 'unknown',
                                newContentState: this._contentState
                            });
                        }).catch((error: any) => {
                            console.log('📡 Cesium3DTile.requestContent() FAILED:', {
                                tileId: this.id || 'unknown',
                                error: error.message || error
                            });
                        });
                    } else {
                        console.log('📡 Cesium3DTile.requestContent() THROTTLED:', {
                            tileId: this.id || 'unknown',
                            note: 'RequestScheduler deferred request'
                        });
                    }
                    
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
        
        // Look for BaseTraversal refinement decision code
        console.log('🔍 Searching for BaseTraversal internal functions...');
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
     * Clean up
     */
    destroy(): void {
        if (this.cesiumTileset && !this.cesiumTileset.isDestroyed()) {
            this.cesiumTileset.destroy();
        }
    }
}