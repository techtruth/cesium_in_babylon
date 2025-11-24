// CESIUM MODULE IMPORTS - Following reference implementation exactly
import {
    // Core utilities
    Event,
    IonResource,
    Matrix4,
    Resource,
    defined,
    
    // 3D Tiles core
    Cesium3DTile,
    
    // Core math
    Cartesian3,
    Math as CesiumMath,
    
    // Request management - like reference implementation
    RequestScheduler,
    Request,
    RequestType,
    RequestState
} from 'cesium';

// EXTRACTED CESIUM MODULES - Internal modules not exported by cesium
import { ManagedArray } from '../cesium_extracted/ManagedArray_extracted';
import { Cesium3DTilesetStatistics } from '../cesium_extracted/Cesium3DTilesetStatistics_extracted';
import { Cesium3DTilesetCache } from '../cesium_extracted/Cesium3DTilesetCache_extracted_v2';
import { Cesium3DTilePass, getPassOptions } from '../cesium_extracted/Cesium3DTilePass_extracted';
import { Cesium3DTileContentState } from '../cesium_extracted/Cesium3DTileContentState_extracted';
import { Cesium3DTileRefine } from '../cesium_extracted/Cesium3DTileRefine_extracted';
// BABYLON DERIVED: Use derived traversal with horizon culling modifications
import Cesium3DTilesetBaseTraversal from '../cesium_derived/Cesium3DTilesetTraversal_derived';
import Cesium3DTilesetSkipTraversal from '../cesium_extracted/Cesium3DTilesetSkipTraversal_extracted';

import { preprocess3DTileContent, Cesium3DTileContentType } from '../cesium_extracted/preprocess3DTileContent_extracted';
import { BabylonTileContent } from '../BabylonTileContent';
import { BabylonModel3DTileContent } from './BabylonModel3DTileContent';
import { Scene as BabylonScene } from '@babylonjs/core';



/**
 * A tileset that conforms to the 3D Tiles specification.
 * Based on Cesium3DTileset implementation for compatibility with Cesium tile management.
 * 
 * @alias MinimalTileset
 * @constructor
 */
export default class MinimalTileset {
    private _url: string | IonResource;
    private _root?: Cesium3DTile;
    private _ready: boolean = false;
    private _readyPromise: Promise<void>;
    private _resource!: Resource | IonResource;
    private _asset: any = undefined;
    private _properties: any = undefined;
    private _geometricError: number = 0;
    private _scaledGeometricError: number = 0;
    
    private _cache: Cesium3DTilesetCache;
    private _statistics: Cesium3DTilesetStatistics;
    private _statisticsLast: Cesium3DTilesetStatistics;
    private _statisticsPerPass: Cesium3DTilesetStatistics[];
    
    public _updatedVisibilityFrame: number = 0;
    private _updatedModelMatrixFrame: number = 0;
    private _modelMatrixChanged: boolean = false;
    private _previousModelMatrix?: Matrix4;
    
    public modelMatrix: Matrix4 = Matrix4.IDENTITY.clone();
    private _modelMatrix: Matrix4 = Matrix4.IDENTITY.clone();
    
    public progressiveResolutionHeightFraction: number = 0.3;
    public isSkippingLevelOfDetail: boolean = true;
    public cullRequestsWhileMoving: boolean = true;
    public cullRequestsWhileMovingMultiplier: number = 60.0;
    public preferLeaves: boolean = false;
    
    // Enable loadSiblings to reduce gaps
    // When true, forces sibling tiles to load together, reducing coverage holes
    public loadSiblings: boolean = true; // Ensure sibling tiles load together to prevent gaps
    
    // CESIUM EXACT: Dynamic screen space error properties exactly like Cesium3DTileset.js
    public dynamicScreenSpaceError: boolean = true;
    public dynamicScreenSpaceErrorDensity: number = 2.0e-4;
    public dynamicScreenSpaceErrorFactor: number = 24.0;
    public dynamicScreenSpaceErrorHeightFalloff: number = 0.25;
    
    // CESIUM EXACT: Updated based on the camera position and direction
    public _dynamicScreenSpaceErrorComputedDensity: number = 0.0;
    
    // REFERENCE CLONE: Core tileset properties - CESIUM DEFAULT
    public maximumScreenSpaceError: number = 16; // Cesium default: 16  
    private _maximumScreenSpaceError: number = 16;
    
    private _memoryAdjustedScreenSpaceError: number = 16;
    
    // CESIUM EXACT: Properties that Cesium's BaseTraversal expects  
    public memoryAdjustedScreenSpaceError: number = 16;
    public debugFreezeFrame: boolean = false;
    public hasMixedContent: boolean = false;
    
    // CESIUM EXACT: Core Cesium3DTileset properties
    public show: boolean = true;
    public _pass: number = 0;
    
    // CESIUM EXACT: Backface commands like reference implementation
    private _backfaceCommands: any[] = [];
    
    // CESIUM EXACT: Heatmap for debug coloring (expected by applyDebugSettings)
    public _heatmap: any = {
        tilePropertyName: undefined
    };
    
    // REFERENCE CLONE: Cache settings
    private _cacheBytes: number = 512 * 1024 * 1024; // 512MB default
    private _maximumCacheOverflowBytes: number = 512 * 1024 * 1024;
    
    // REFERENCE CLONE: Event handlers exactly like reference
    public tileLoad: Event = new Event();
    public tileFailed: Event = new Event();
    public allTilesLoaded: Event = new Event();
    public initialTilesLoaded: Event = new Event();
    public loadProgress: Event = new Event();
    public tileset: Event = new Event();
    
    // REFERENCE CLONE: Tile tracking arrays matching reference exactly
    private _selectedTiles: Cesium3DTile[] = [];
    private _emptyTiles: Cesium3DTile[] = [];
    private _requestedTiles: Cesium3DTile[] = [];
    private _selectedTilesToStyle: Cesium3DTile[] = [];
    private _requestedTilesInFlight: Cesium3DTile[] = [];
    private _processingQueue: any[] = [];
    
    // REFERENCE CLONE: Priority tracking like reference
    private _maximumPriority = {
        foveatedFactor: -Number.MAX_VALUE,
        depth: -Number.MAX_VALUE,
        distance: -Number.MAX_VALUE,
        reverseScreenSpaceError: -Number.MAX_VALUE
    };
    private _minimumPriority = {
        foveatedFactor: Number.MAX_VALUE,
        depth: Number.MAX_VALUE,
        distance: Number.MAX_VALUE,
        reverseScreenSpaceError: Number.MAX_VALUE
    };
    
    // REFERENCE CLONE: Loading state tracking
    private _tilesLoaded: boolean = false;
        private _tilesLoadedCount: number = 0;
    private _initialTilesLoaded: boolean = false;
    private _loadTimestamp?: number;
    private _timeSinceLoad: number = 0.0;
    
    // Custom additions for Babylon.js integration
    private _loadedTiles: Map<string, any> = new Map();
    private _babylonScene?: BabylonScene;
    private _frameNumber: number = 0;
    private _tilesUnloadedCount: number = 0;
    private _lastSelectedTiles: Set<string> = new Set();
    
    constructor(options: { 
        url: string | IonResource, 
        maximumScreenSpaceError?: number, 
        babylonScene?: BabylonScene,
        // CESIUM EXACT: Fog-related options matching Cesium3DTileset exactly
        dynamicScreenSpaceError?: boolean,
        dynamicScreenSpaceErrorDensity?: number,
        dynamicScreenSpaceErrorFactor?: number,
        dynamicScreenSpaceErrorHeightFalloff?: number
    }) {
        // REFERENCE CLONE: Initialize core properties exactly like reference
        this._url = options.url;
        this.maximumScreenSpaceError = options.maximumScreenSpaceError ?? 16; // CESIUM DEFAULT
        this._maximumScreenSpaceError = this.maximumScreenSpaceError;
        this._memoryAdjustedScreenSpaceError = this.maximumScreenSpaceError;
        
        // CESIUM EXACT: Initialize fog-related properties exactly like Cesium3DTileset.js
        this.dynamicScreenSpaceError = options.dynamicScreenSpaceError ?? true;
        this.dynamicScreenSpaceErrorDensity = options.dynamicScreenSpaceErrorDensity ?? 2.0e-4;
        this.dynamicScreenSpaceErrorFactor = options.dynamicScreenSpaceErrorFactor ?? 24.0;
        this.dynamicScreenSpaceErrorHeightFalloff = options.dynamicScreenSpaceErrorHeightFalloff ?? 0.25;
        this._dynamicScreenSpaceErrorComputedDensity = 0.0; // CESIUM EXACT: Updated based on camera position and direction
        
        // CESIUM EXACT: Set up properties for BaseTraversal
        this.memoryAdjustedScreenSpaceError = this.maximumScreenSpaceError;
        this._babylonScene = options.babylonScene;
        
        // REFERENCE CLONE: Initialize statistics system using extracted classes
        this._statistics = new Cesium3DTilesetStatistics();
        this._statisticsLast = new Cesium3DTilesetStatistics();
        this._statisticsPerPass = new Array(Cesium3DTilePass.NUMBER_OF_PASSES);
        for (let i = 0; i < Cesium3DTilePass.NUMBER_OF_PASSES; ++i) {
            this._statisticsPerPass[i] = new Cesium3DTilesetStatistics();
        }
        
        // REFERENCE CLONE: Initialize cache system using extracted class
        this._cache = new Cesium3DTilesetCache();
        
        // Initialize the tileset by loading the root
        this._readyPromise = this.initialize();
    }
    
    private async initialize(): Promise<void> {
        try {
            // Get the resource (whether it's a URL string or IonResource)
            if (typeof this._url === 'string') {
                // Simple URL case - create a proper Resource
                this._resource = new Resource({ url: this._url });
            } else {
                // IonResource case
                this._resource = this._url;
            }
            
            // Fetch the tileset.json
            const tilesetUrl = this._resource.url || this._resource.toString();
            
            const response = await fetch(tilesetUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch tileset: ${response.status}`);
            }
            
            const tilesetJson = await response.json();
            
            // CESIUM EXACT: Set up tileset properties like reference implementation
            this._asset = tilesetJson.asset;
            this._properties = tilesetJson.properties;
            this._geometricError = tilesetJson.geometricError || 0;
            this._scaledGeometricError = this._geometricError; // This is key for BaseTraversal!
            
            // CESIUM BEHAVIOR: For extreme tileset geometric errors, Cesium relies on child tiles having reasonable errors
            // We match this by ensuring the tileset references itself correctly for root tile calculations
            
            // Create the root tile from the JSON - pass the main resource as baseResource
            this._root = this.createTileFromJson(tilesetJson.root, this._resource, undefined);
            
            // Initialize root tile properties needed by getPriorityReverseScreenSpaceError (reference line 1012)
            (this._root as any)._screenSpaceError = 0;
            
            
            this._ready = true;
            
        } catch (error) {
            console.error('Failed to initialize MinimalTileset:', error);
            throw error;
        }
    }
    
    /**
     * Create a Cesium3DTile from JSON data - follows reference makeTile pattern exactly
     * @param tileJson The tile JSON data from tileset.json
     * @param baseResource The base resource to use for this tile (for proper resolution context)
     * @param parent The parent tile (optional)
     */
    private createTileFromJson(tileJson: any, baseResource: Resource | IonResource, parent?: Cesium3DTile): Cesium3DTile {
        
        // Create a proper header object with the tile JSON data
        // CRITICAL: Pass raw URI from JSON - let Cesium handle ALL resolution
        const tileHeader = {
            geometricError: tileJson.geometricError,
            boundingVolume: tileJson.boundingVolume,
            content: tileJson.content ? {
                uri: tileJson.content.uri  // ✅ FIXED: Use raw URI, no custom resolution
            } : undefined,
            refine: tileJson.refine,
            transform: tileJson.transform,
            children: tileJson.children
        };

        // Debug: Log bounding volume data to verify it's correct
        if (!parent) {
        }

        // Create the tile with proper constructor parameters exactly like reference makeTile:
        // Cesium3DTile(tileset, baseResource, header, parent)
        const tile = new Cesium3DTile(
            this as any,        // tileset (MinimalTileset acts as the tileset)
            baseResource,       // ✅ FIXED: Use the passed baseResource, not this._resource
            tileHeader,         // header
            parent as any       // parent (can be undefined)
        );
        
        
        // ✅ CESIUM EXACT: All properties are initialized by Cesium3DTile constructor
        // ✅ contentAvailable, contentReady, contentVisibility are already on prototype
        // ✅ _distanceToCamera, _centerZDepth, _refines, _shouldSelect, etc. are set in constructor
        // ✅ hasRenderableContent is set correctly by constructor based on hasEmptyContent
        
        // CESIUM PATTERN: Tiles with content URIs should have hasRenderableContent = true
        // Override only if Cesium constructor incorrectly set it to false
        if (tileJson.content && tileJson.content.uri && !(tile as any).hasRenderableContent) {
            (tile as any).hasRenderableContent = true;
        }

        
        // Reference implementation does NOTHING after constructor call
        
        // Cesium3DTile constructor handles ALL setup: _contentResource, _priority, _serverKey, etc.
        
        // Add children if they exist - pass the same baseResource for consistency
        if (tileJson.children) {
            for (const childJson of tileJson.children) {
                const childTile = this.createTileFromJson(childJson, baseResource, tile);
                tile.children.push(childTile);
                // CESIUM EXACT: Set child depth - critical for loading priority
                (childTile as any)._depth = (tile as any)._depth + 1;
            }
        }
        
        return tile;
    }
    
    
    
    /**
     * Core update method - this is where tile selection happens
     */
    /**
     * CESIUM EXACT: Main update method - matches Cesium3DTileset.prototype.update exactly
     */
    update(frameState: any): void {
        // CESIUM EXACT: Just call updateForPass like real Cesium3DTileset
        this.updateForPass(frameState, frameState.tilesetPassState || {});
    }

    /**
     * CESIUM EXACT: updateForPass - matches Cesium3DTileset.prototype.updateForPass exactly  
     */
    updateForPass(frameState: any, tilesetPassState: any): void {
        if (!this._ready || !this._root) {
            return;
        }

        // CESIUM EXACT: Setup pass state like real Cesium
        const pass = tilesetPassState.pass || 0; // Default to first pass
        const passOptions = getPassOptions(pass);
        const passStatistics = this._statisticsPerPass[pass] || this._statistics;

        if (this.show || passOptions.ignoreCommands) {
            this._pass = pass;
            // CESIUM EXACT: Call internal update function like reference
            this.internalUpdate(frameState, passStatistics, passOptions);
        }
    }

    /**
     * CESIUM EXACT: Internal update - matches internal update(tileset, frameState, passStatistics, passOptions)
     */
    private internalUpdate(frameState: any, passStatistics: any, passOptions: any): void {
        // CESIUM EXACT: Process Cesium's request queue first
        (RequestScheduler as any).update();
        
        // CESIUM EXACT: Increment visibility frame counter like reference  
        ++this._updatedVisibilityFrame;
        
        // CESIUM EXACT: Update memory-adjusted screen space error dynamically
        // This is critical for BaseTraversal tile selection logic
        this.updateMemoryAdjustedScreenSpaceError();
        this.memoryAdjustedScreenSpaceError = this._memoryAdjustedScreenSpaceError;
        
        // CESIUM EXACT: Update dynamic screen space error density exactly like Cesium3DTileset.js
        if (this.dynamicScreenSpaceError) {
            this.updateDynamicScreenSpaceError(frameState);
        }
        
        this._frameNumber++;

        // DISABLED: Root tile debugging - too verbose
        if (false && this._root && this._frameNumber % 600 === 1) { // Focus on core issue - every 10 seconds
            const rootTile = this._root as any;
            
            // Test updateVisibility and focus on the _visible contradiction  
            rootTile.updateVisibility(frameState);
            
        }
        
        // CESIUM EXACT: Let BaseTraversal handle visibility naturally
        // Don't force-reset all tiles - Cesium doesn't do this
        // BaseTraversal will only call update() on selected tiles, others remain hidden naturally
        
        // CESIUM EXACT: Use getTraversal() like real Cesium to choose traversal algorithm
        const traversal = this.getTraversal({ pass: 0, requestTiles: true, ignoreCommands: false });
        traversal.selectTiles(this as any, frameState);
        
        // BaseTraversal working - logging disabled
        
        // CESIUM-STYLE: Viewport coverage analysis for edge gap debugging
        if (this._updatedVisibilityFrame % 120 === 0) {
            let visibleTiles = 0;
            let edgeTiles = 0;
            let centerTiles = 0;
            
            const camera = frameState.camera;
            const frameWidth = frameState.context.drawingBufferWidth;
            const frameHeight = frameState.context.drawingBufferHeight;
            const tanHalfFOV = Math.tan(camera.frustum.fov * 0.5);
            const aspectRatio = frameWidth / frameHeight;
            
            this._selectedTiles.forEach(tile => {
                if ((tile as any).isVisible && (tile as any).contentAvailable) {
                    visibleTiles++;
                    
                    const boundingSphere = (tile as any).boundingSphere;
                    if (boundingSphere?.center) {
                        const tileVector = Cartesian3.subtract(boundingSphere.center, camera.positionWC, new Cartesian3());
                        const forward = Cartesian3.dot(tileVector, camera.directionWC);
                        
                        if (forward > camera.frustum.near) {
                            const right = Cartesian3.dot(tileVector, camera.rightWC);
                            const up = Cartesian3.dot(tileVector, camera.upWC);
                            
                            // Cesium-style screen space projection
                            const projectedX = right / (forward * tanHalfFOV * aspectRatio);
                            const projectedY = up / (forward * tanHalfFOV);
                            
                            const screenX = (projectedX + 1.0) * 0.5 * frameWidth;
                            const screenY = (1.0 - projectedY) * 0.5 * frameHeight;
                            const screenRadius = (boundingSphere.radius * frameHeight) / (2.0 * forward * tanHalfFOV);
                            
                            // Check viewport edge proximity
                            const edgeBuffer = 10;
                            const isNearEdge = (
                                screenX - screenRadius < edgeBuffer || 
                                screenX + screenRadius > frameWidth - edgeBuffer ||
                                screenY - screenRadius < edgeBuffer || 
                                screenY + screenRadius > frameHeight - edgeBuffer
                            );
                            
                            if (isNearEdge) edgeTiles++;
                            else centerTiles++;
                        }
                    }
                }
            });
            
            console.log(`🕳️ GAPS: ${visibleTiles}/${this._selectedTiles.length} tiles visible (${edgeTiles} near edges, ${centerTiles} in center)`);
        }

        // CESIUM EXACT: Process tiles like Cesium does
        this.processTiles(frameState);

        // CESIUM EXACT: Update tile content like reference implementation
        this.updateTileContent(frameState);

        // CESIUM EXACT: Update statistics like reference implementation
        this.updateStatistics();
        // Debug logging disabled for clean output
        
        // REFERENCE CLONE: Update cache like reference (trim unused tiles)  
        // Note: Cesium3DTilesetCache doesn't have trim(), it has unloadTiles()
        // The cache management is handled elsewhere in the reference implementation
    }
    

    /**
     * REFERENCE CLONE: Update statistics exactly like reference implementation
     */
    private updateStatistics(): void {
        // Clone current stats to last frame like reference
        Cesium3DTilesetStatistics.clone(this._statistics, this._statisticsLast);
        
        // Clear current frame and update statistics
        this._statistics.clear();
        this._statistics.selected = this._selectedTiles.length;
        this._statistics.numberOfAttemptedRequests = this._requestedTiles.length;
        this._statistics.visited = this._selectedTiles.length + this._emptyTiles.length;
    }

    // ✅ REMOVED: updateRequestFlightTracking() - not in Cesium structure
    
    /**
     * CESIUM EXACT: Process tiles with proper request prioritization and limits
     */
    private processTiles(frameState: any): void {
        // CESIUM PRIORITIZATION: Sort requested tiles by priority (distance, screen space error)
        const prioritizedTiles = this._requestedTiles.slice().sort((a: any, b: any) => {
            // Primary: Distance to camera (closer tiles first)
            const distDiff = a._distanceToCamera - b._distanceToCamera;
            if (Math.abs(distDiff) > 1000) { // 1km threshold
                return distDiff;
            }
            
            // Secondary: Screen space error (higher error = more important)
            return (b._screenSpaceError || 0) - (a._screenSpaceError || 0);
        });
        
        // CESIUM LIMITS: Only process a limited number of tiles per frame to prevent distant tile spam
        const maxRequestsPerFrame = 8; // Cesium typically limits concurrent tile requests
        const frameBudget = Math.min(prioritizedTiles.length, maxRequestsPerFrame);
        
        // TEMPORARILY DISABLED: Distance culling to test pure frustum culling
        const camera = frameState.camera;
        // const maxLoadDistance = 50000; // 50km max load distance for street-level view
        
        let processedCount = 0;
        let noContentResourceCount = 0;
        let distanceCulledCount = 0;
        
        for (let i = 0; i < frameBudget; i++) {
            const tile = prioritizedTiles[i];
            const contentState = (tile as any)._contentState;
            const hasRequest = defined((tile as any)._request);
            const hasContentResource = defined((tile as any)._contentResource);
            
            // TEMPORARILY DISABLED: Distance culling to test pure frustum culling
            // const tileDistance = tile._distanceToCamera || 0;
            // if (tileDistance > maxLoadDistance) {
            //     distanceCulledCount++;
            //     continue;
            // }
            
            // Only process unloaded tiles that don't have an active request (like reference)
            if (contentState === Cesium3DTileContentState.UNLOADED && !hasRequest) {
                if (!hasContentResource) {
                    noContentResourceCount++;
                    continue;
                }
                
                processedCount++;
                
                // Request raw ArrayBuffer without letting Cesium process into 3D models
                // We want the raw data for Babylon.js, not processed Cesium content
                try {
                    // Clone the resource exactly like reference implementation
                    // "it is important to clone here. The fetchArrayBuffer() below uses
                    // throttling, but other uses of the resources do not."
                    const resource = (tile as any)._contentResource.clone();
                    
                    // Create priority function like reference implementation
                    const createPriorityFunction = (tile: any) => {
                        return function() {
                            return tile._priority;
                        };
                    };
                    
                    // Create Request object exactly like reference implementation
                    const request = new Request({
                        throttle: true,
                        throttleByServer: true,
                        type: RequestType.TILES3D,
                        priorityFunction: createPriorityFunction(tile),
                        serverKey: (tile as any)._serverKey
                    });
                    
                    // Assign request to tile to prevent duplicates (like reference)
                    (tile as any)._request = request;
                    resource.request = request;
                    
                    const promise = resource.fetchArrayBuffer();
                    if (!defined(promise)) {
                        // No promise returned, like reference implementation
                        return;
                    }
                    
                    // Add to flight tracking
                    this._requestedTilesInFlight.push(tile);
                    
                    // Process the promise like reference processArrayBuffer function
                    this.processArrayBuffer(tile, request, promise);
                } catch (error) {
                    console.error('Error requesting tile content:', error);
                    this.tileFailed.raiseEvent(tile);
                }
            }
        }
        
        // Log prioritization and processing results
        if (processedCount > 0 || noContentResourceCount > 0 || distanceCulledCount > 0) {
            
        }
    }
    
    /**
     * Update tile content - calls tile._content.update() just like Cesium3DTileset does
     */
    private updateTileContent(frameState: any): void {
        // CESIUM EXACT: Reset the visible count each frame for accurate debugging
        (BabylonModel3DTileContent as any)._visibleCount = 0;
        
        // REMOVED: Non-Cesium tile hiding logic - let Cesium handle visibility naturally
        
        // CESIUM EXACT: Setup before updateTiles like Cesium reference does
        // tileset._styleEngine.applyStyle(tileset); - Skip for now, we don't have a style engine
        
        // CESIUM EXACT: Initialize backface commands like reference
        if (!this._backfaceCommands) {
            this._backfaceCommands = [];
        }
        this._backfaceCommands.length = 0;
        
        // CESIUM EXACT: Get passOptions like Cesium reference does
        const pass = Cesium3DTilePass.RENDER; // Default render pass
        const passOptions = getPassOptions(pass);
        
        // CESIUM EXACT: ONLY update selected tiles - this is the core visibility pattern!
        // Non-selected tiles never get update() called, which automatically makes them invisible
        for (const tile of this._selectedTiles) {
            try {
                // This is the key call that matches Cesium exactly!
                // In Cesium: tile.update(tileset, frameState, passOptions)
                (tile as any).update(this, frameState, passOptions);
            } catch (error) {
                console.error('Error updating selected tile:', error);
            }
        }
        
        // NOTE: We deliberately DO NOT update _emptyTiles here!
        // According to Cesium reference, only selected tiles get updated each frame.
        // This is how tiles become invisible - by not getting their update() method called.
        
        // Trust Cesium: Let it handle all state transitions naturally
        // Cesium's tile.update() will call updateContent() which handles state transitions
    }
    
    // REMOVED: hideDeselectedTiles() - Non-Cesium logic removed, let Cesium handle tile visibility naturally



    
    /**
     * Handle proper tile unloading when Cesium unloads tiles
     * This disposes of Babylon meshes for tiles that are no longer needed
     */
    private _handleTileUnloading(unloadedTileIds: string[]): void {
        
        // Find tiles that have content and dispose their Babylon meshes
        for (const tileId of unloadedTileIds) {
            // Find all tiles (selected + requested + any others) that match this ID
            const allTiles = [...this._selectedTiles, ...this._requestedTiles, ...this._emptyTiles];
            const tileToUnload = allTiles.find(tile => (tile as any).id === tileId);
            
            if (tileToUnload && (tileToUnload as any)._content) {
                const content = (tileToUnload as any)._content;
                
                // Hide the content immediately
                if (content.visible !== undefined) {
                    content.visible = false;
                }
                
                // Destroy the content if it has a destroy method
                if (typeof content.destroy === 'function') {
                    try {
                        content.destroy();
                    } catch (error) {
                        console.error(`❌ Error disposing tile content for ${tileId}:`, error);
                    }
                }
                
                // Clear the content reference
                (tileToUnload as any)._content = null;
            }
        }
    }
    
    // CESIUM EXACT: Cesium does not filter selected tiles - removed custom filtering methods
    
    // CESIUM EXACT: Removed custom visibility management methods - Cesium handles this in tile content
    
    // ✅ REMOVED: makeContent() - not in Cesium structure, content created directly by factories

    /**
     * Process ArrayBuffer promise - matches reference implementation exactly
     */
    private async processArrayBuffer(tile: Cesium3DTile, request: any, requestPromise: Promise<ArrayBuffer>): Promise<void> {
        const previousState = (tile as any)._contentState;
        (tile as any)._contentState = Cesium3DTileContentState.LOADING;
        
        let arrayBuffer: ArrayBuffer;
        try {
            arrayBuffer = await requestPromise;
        } catch (error) {
            if ((tile as any).isDestroyed()) {
                // Tile is unloaded before the content can process
                return;
            }
            
            if (request.cancelled || request.state === RequestState.CANCELLED) {
                // Cancelled due to low priority - try again later.
                (tile as any)._contentState = previousState;
                return;
            }
            
            (tile as any)._contentState = Cesium3DTileContentState.FAILED;
            console.error(`Tile content request failed:`, error);
            this.tileFailed.raiseEvent(tile);
            return;
        }
        
        if ((tile as any).isDestroyed()) {
            // Tile is unloaded before the content can process
            return;
        }
        
        if (request.cancelled || request.state === RequestState.CANCELLED) {
            // Cancelled due to low priority - try again later.
            (tile as any)._contentState = previousState;
            return;
        }
        
        try {
            // BABYLON DEVIATION: Create BabylonTileContent instead of Cesium's content factories
            // Reference: Cesium creates content via createContent() factories in Cesium3DTileset.js
            // We create BabylonTileContent for Babylon.js mesh rendering instead of WebGL
            const content = new BabylonTileContent(this._babylonScene!, tile, arrayBuffer, this);
            
            if ((tile as any).isDestroyed()) {
                return;
            }
            
            // CESIUM EXACT: Follow Cesium's exact pattern from processArrayBuffer
            (tile as any)._content = content;
            (tile as any)._contentState = Cesium3DTileContentState.PROCESSING;
            
            // CESIUM EXACT: Synchronously transition to READY if content is immediately ready
            // This matches how Cesium handles content that's ready synchronously
            if (content.ready) {
                (tile as any)._contentState = Cesium3DTileContentState.READY;
            }
            // If not ready, content will handle its own state transition via update() calls
            
            this._tilesLoadedCount++;
            
            // Process external tilesets like reference implementation  
            this.processExternalTileset(tile, arrayBuffer);
            
            // Fire tile loaded event
            this.tileLoad.raiseEvent(tile);
            
        } catch (error) {
            if ((tile as any).isDestroyed()) {
                return;
            }
            
            (tile as any)._contentState = Cesium3DTileContentState.FAILED;
            console.error(`Tile content processing failed:`, error);
            this.tileFailed.raiseEvent(tile);
        }
    }
    
    // Custom selectTiles method removed - BaseTraversal handles all tile selection
    
    // Custom evaluateChildren, requestVisibleChildren, and isTileVisible methods removed - BaseTraversal handles all tile logic
    
    // ✅ REMOVED: computeScreenSpaceError() - Cesium tiles have getScreenSpaceError() method built-in
    
    // Public getters to match Cesium3DTileset interface
    get ready(): boolean {
        return this._ready;
    }
    
    get root(): Cesium3DTile | undefined {
        return this._root;
    }
    
    // CESIUM EXACT: Additional properties that BaseTraversal expects
    get asset() {
        return this._asset;
    }
    
    get cache() {
        return this._cache;
    }
    
    get readyPromise(): Promise<void> {
        return this._readyPromise;
    }
    
    /**
     * CESIUM EXACT: Add missing boundingSphere getter that updates transforms
     * CESIUM REFERENCE: @cesium/engine/Source/Scene/Cesium3DTileset.js lines 1663-1664
     * 
     * This is CRITICAL for proper bounding sphere coordinates!
     * Without this, tile bounding spheres stay at (0,0,0) instead of world positions.
     */
    get boundingSphere() {
        // CESIUM EXACT: Update transform hierarchy before returning bounding sphere
        if (this._root) {
            // Type cast needed since updateTransform exists but TS doesn't see it in the exported interface
            (this._root as any).updateTransform(this._modelMatrix);
            
            // boundingSphere getter working - debug output disabled
        }
        return this._root?.boundingSphere;
    }
    
    get selectedTiles(): Cesium3DTile[] {
        return this._selectedTiles;
    }
    
    get loadedTiles(): Map<string, any> {
        return this._loadedTiles;
    }
    
    get statistics() {
        return {
            selected: this._statistics.selected,
            requested: this._statistics.numberOfAttemptedRequests,
            visited: this._statistics.visited,
            loaded: this._tilesLoadedCount,
            commands: this._statistics.numberOfCommands,
            features: this._statistics.numberOfFeaturesSelected,
            points: this._statistics.numberOfPointsSelected,
            triangles: this._statistics.numberOfTrianglesSelected,
            geometryBytes: this._statistics.geometryByteLength,
            texturesBytes: this._statistics.texturesByteLength
        };
    }
    
    /**
     * CESIUM EXACT: Update memory-adjusted screen space error based on cache usage
     * From Cesium3DTileset.js line 2903: tileset._memoryAdjustedScreenSpaceError *= 1.02
     */
    private updateMemoryAdjustedScreenSpaceError(): void {
        // CESIUM EXACT: Reset to base value (memory tracking not implemented)
        this._memoryAdjustedScreenSpaceError = this.maximumScreenSpaceError;
        
        // SSE threshold tracking disabled for clean output
    }

    /**
     * CESIUM EXACT: Update dynamic screen space error density - exact copy from Cesium3DTileset.js
     * @private
     */
    private updateDynamicScreenSpaceError(frameState: any): void {
        let up: Cartesian3;
        let direction: Cartesian3;
        let height: number;
        let minimumHeight: number;
        let maximumHeight: number;

        const camera = frameState.camera;
        const root = this._root;
        if (!root) return;

        const tileBoundingVolume = (root as any).contentBoundingVolume;

        // CESIUM EXACT: Handle different bounding volume types (simplified for this implementation)
        // For now, we'll assume it's a bounding sphere and approximate like Cesium does
        const boundingVolume = tileBoundingVolume?.boundingVolume || (root as any).boundingSphere;
        if (boundingVolume) {
            // CESIUM EXACT: Approximate height calculations like Cesium does for non-region volumes
            up = Cartesian3.normalize(camera.positionWC, new Cartesian3());
            direction = camera.directionWC;
            height = camera.positionCartographic?.height || 0;
            
            // Simplified height calculation based on bounding sphere
            const centerHeight = boundingVolume.center ? 
                Cartesian3.magnitude(boundingVolume.center) - 6371000 : 0; // Approximate earth radius
            minimumHeight = 0.0;
            maximumHeight = centerHeight * 2.0;
        } else {
            // Fallback when no bounding volume is available
            up = Cartesian3.UNIT_Z;
            direction = camera.directionWC;
            height = camera.positionCartographic?.height || 0;
            minimumHeight = 0.0;
            maximumHeight = 1000.0; // Default fallback
        }

        // CESIUM EXACT: The range where the density starts to lessen. Start at the quarter height of the tileset.
        const heightFalloff = this.dynamicScreenSpaceErrorHeightFalloff;
        const heightClose = minimumHeight + (maximumHeight - minimumHeight) * heightFalloff;
        const heightFar = maximumHeight;

        const t = CesiumMath.clamp(
            (height - heightClose) / (heightFar - heightClose),
            0.0,
            1.0,
        );

        // CESIUM EXACT: Increase density as the camera tilts towards the horizon
        let horizonFactor = 1.0 - Math.abs(Cartesian3.dot(direction, up));

        // CESIUM EXACT: Weaken the horizon factor as the camera height increases, implying the camera is further away from the tileset.
        // The goal is to increase density for the "street view", not when viewing the tileset from a distance.
        horizonFactor = horizonFactor * (1.0 - t);

        // CESIUM EXACT: Final computation exactly like Cesium
        this._dynamicScreenSpaceErrorComputedDensity = this.dynamicScreenSpaceErrorDensity * horizonFactor;
        
        // Fog density calculation complete - debug output disabled
    }
    
    private processExternalTileset(parentTile: Cesium3DTile, content: ArrayBuffer): void {
        try {
            const preprocessed = preprocess3DTileContent(content);
            if (preprocessed.contentType === Cesium3DTileContentType.EXTERNAL_TILESET && preprocessed.jsonPayload) {
                this.loadTileset((parentTile as any)._contentResource, preprocessed.jsonPayload, parentTile);
            }
        } catch (error) {
            console.error('Failed to process external tileset:', error);
        }
    }
    
    private loadTileset(resource: Resource, json: any, parentTile: Cesium3DTile): void {
        if (!json?.root) return;
        const rootTile = this.createTileFromJson(json.root, resource, parentTile);
        parentTile.children.push(rootTile);
    }
    
    // REMOVED: resetTileVisibility() - Non-Cesium manual tile hiding logic removed
    
    /**
     * CESIUM EXACT: Choose traversal algorithm like real Cesium3DTileset
     */
    getTraversal(passOptions: { pass: number, requestTiles: boolean, ignoreCommands: boolean }): typeof Cesium3DTilesetBaseTraversal {
        // For now, we don't handle MOST_DETAILED passes, so just choose Skip vs Base
        return this.isSkippingLevelOfDetail 
            ? Cesium3DTilesetSkipTraversal
            : Cesium3DTilesetBaseTraversal;
    }
    
    destroy(): void {
        // Clean up resources
        this._root = undefined;
        this._selectedTiles = [];
        this._requestedTiles = [];
        this._requestedTilesInFlight = [];
        this._loadedTiles.clear();
    }
}