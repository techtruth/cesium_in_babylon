import { Scene as BabylonScene, AbstractMesh, MeshBuilder, Color3, StandardMaterial } from '@babylonjs/core';
import { BabylonModel3DTileContent } from './cesium_derived/BabylonModel3DTileContent';
import type { Babylon3DTileContentInterface } from './cesium_derived/Babylon3DTileContent';
import { preprocess3DTileContent, Cesium3DTileContentType } from './cesium_extracted/preprocess3DTileContent_extracted';
// CESIUM NATIVE: Import from cesium instead of extracted  
import * as Cesium from 'cesium';
const Cesium3DTileContentState = (Cesium as any).Cesium3DTileContentState;

/**
 * BabylonTileContent - Follows the Cesium content pattern exactly
 * 
 * PURPOSE:
 * - Acts as a drop-in replacement for Cesium3DTileContent classes
 * - Manages Babylon.js mesh creation and rendering from tile ArrayBuffer data
 * - Follows the exact same interface as Cesium content: update(), destroy(), ready property
 * - Called by Cesium3DTile.update() via tile._content.update(tileset, frameState)
 */
export class BabylonTileContent {
    private static debugLogCount: number = 0;
    private static showLogCount: number = 0;
    private _babylonScene: BabylonScene;
    // Removed BabylonTilesOrchestrator - direct content creation like Cesium
    private _tile: any; // The Cesium3DTile that owns this content
    private _arrayBuffer: ArrayBuffer;
    private _ready: boolean = false;
    private _tileContent: Babylon3DTileContentInterface | undefined;
    private _debugSphere: AbstractMesh | undefined;
    private _visible: boolean = true;
    private _tileset?: any; // MinimalTileset reference
    
    constructor(
        babylonScene: BabylonScene, 
        tile: any, 
        arrayBuffer: ArrayBuffer,
        tileset?: any  // MinimalTileset reference for content registration
    ) {
        this._babylonScene = babylonScene;
        // Direct initialization - no orchestrator needed
        this._tile = tile;
        this._arrayBuffer = arrayBuffer;
        this._tileset = tileset; // Store tileset reference for registration
        
        // Start processing the content asynchronously
        this.initializeContent();
    }
    
    /**
     * Initialize the Babylon content from ArrayBuffer
     */
    private async initializeContent(): Promise<void> {
        try {
            // CESIUM EXACT: Direct content creation using Cesium's factory pattern
            // Reference: Cesium creates content directly via static factory methods
            const contentUri = this._tile._contentResource?.url || 'unknown';
            
            // Check if this is renderable content
            const preprocessed = preprocess3DTileContent(this._arrayBuffer);
            
            if (preprocessed.contentType === Cesium3DTileContentType.EXTERNAL_TILESET) {
                // CESIUM EXACT: External tileset - set flags like Cesium does
                this._tile.hasTilesetContent = true;
                this._tile.hasRenderableContent = false;  // Not renderable content
                this._ready = true;
                return;
            }
            
            // CESIUM PATTERN: Handle tiles with no renderable content (structural/placeholder tiles)
            if (!preprocessed.binaryPayload || preprocessed.binaryPayload.length === 0) {
                // Empty content - this is a structural tile like Cesium handles
                this._tile.hasRenderableContent = false;  // No renderable content
                this._ready = true;
                console.log(`📦 STRUCTURAL TILE: No renderable content (${preprocessed.contentType})`);
                return;
            }
            
            // CESIUM PATTERN: Only create content for supported renderable types
            if (preprocessed.contentType === Cesium3DTileContentType.GLTF_BINARY || 
                preprocessed.contentType === Cesium3DTileContentType.BATCHED_3D_MODEL) {
                
                // CESIUM EXACT: Use factory methods like Cesium does
                if (preprocessed.contentType === Cesium3DTileContentType.GLTF_BINARY) {
                    // Use fromGltf factory method for GLB content
                    this._tileContent = await BabylonModel3DTileContent.fromGltf(
                        this._babylonScene,
                        this, // tileset (BabylonTileContent acts as tileset)
                        this._tile,
                        { getUrlComponent: () => contentUri }, // mock resource
                        this._arrayBuffer
                    );
                } else if (preprocessed.contentType === Cesium3DTileContentType.BATCHED_3D_MODEL) {
                    // Use fromB3dm factory method for B3DM content  
                    this._tileContent = await BabylonModel3DTileContent.fromB3dm(
                        this._babylonScene,
                        this, // tileset
                        this._tile,
                        { getUrlComponent: () => contentUri }, // mock resource
                        this._arrayBuffer,
                        0 // byteOffset
                    );
                }
                
                if (!this._tileContent) {
                    // Content creation failed - treat as structural tile
                    console.warn(`⚠️ Content creation failed for: ${contentUri}`);
                    this._tile.hasRenderableContent = false;
                    this._ready = true;
                    return;
                }
                
                // BABYLON DEVIATION: Register content with tileset for visibility management
                if (this._tileset && this._tileset._loadedTiles) {
                    const tileId = this._tile.id || `tile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    this._tileset._loadedTiles.set(tileId, this._tileContent);
                    // DISABLED: Registration logs (too spammy)
                    // console.log(`📝 REGISTERED: Tile content ${tileId} added to _loadedTiles (total: ${this._tileset._loadedTiles.size})`);
                }
                
                // CESIUM PATTERN: Immediately mark as ready like Cesium does
                // GLB loading happens async in background but doesn't block tile state transitions
                this._ready = true;
                this._tile.hasRenderableContent = true;
                this._tile._content = this; // CRITICAL: Set tile._content so contentAvailable becomes true
                this._tile._contentState = Cesium3DTileContentState.READY;
                // console.log(`🚀 SYNC: Tile immediately marked READY (contentState=${this._tile._contentState}, contentAvailable=${this._tile.contentAvailable})`);
                
            } else {
                // Unsupported content type - treat as structural tile like Cesium does
                console.log(`📦 UNSUPPORTED CONTENT: ${preprocessed.contentType} - treating as structural tile`);
                this._tile.hasRenderableContent = false;
                this._ready = true;
                return;
            }
            
        } catch (error) {
            console.error('Failed to initialize Babylon content:', error);
            // Don't mark as ready on error - let it retry or fail properly
        }
    }

    // Removed generateTileId - no longer needed without orchestrator
    
    /**
     * Main update method - called by Cesium3DTile.update() exactly like Cesium content
     * This is the key method that follows the Cesium pattern!
     */
    update(tileset: any, frameState: any): void {
        try {
            // State is now handled synchronously in initializeContent()
            // No async state transitions needed in update() method
            
            if (!this._ready || !this._tileContent) {
                return;
            }
            
            // DEBUG: Check tile state when ready
            if (this._ready && !this._tile.contentAvailable) {
                const tileDesc = `depth=${this._tile._depth}, geomError=${this._tile.geometricError?.toFixed(0)}`;
                console.log(`🚨 READY tile (${tileDesc}) has contentAvailable=false! _contentState=${this._tile._contentState}`);
                
                // CESIUM PATTERN: Don't force-set hasRenderableContent in update()
                // It should be set correctly during content initialization
            }
            
            // CESIUM MATCH: Tiles are visible if they're in the selected tiles array
            // BaseTraversal already did all the refinement logic and _selectedFrame setting
            const isInSelectedTiles = tileset._selectedTiles && tileset._selectedTiles.includes(this._tile);
            
            // Debug logging disabled - system working
            
            if (isInSelectedTiles) {
                this.show = true;
                // Tile selection working - logging disabled
            } else {
                // HORIZON CULLING DEBUG: Log when tiles are hidden due to not being selected
                if (this._visible === true) {
                    // Get tile position for debugging
                    const boundingSphere = this._tile.boundingSphere;
                    let positionDesc = "";
                    if (boundingSphere && boundingSphere.center) {
                        const center = boundingSphere.center;
                        const earthDist = Math.sqrt(center.x*center.x + center.y*center.y + center.z*center.z);
                        positionDesc = ` pos=(${center.x.toFixed(0)}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)}), earthDist=${earthDist.toFixed(0)}m`;
                    }
                    const tileDesc = `depth=${this._tile._depth}, geomError=${this._tile.geometricError?.toFixed(0)}${positionDesc}`;
                    console.log(`🔴 HIDING TILE (${tileDesc}) - not in selected tiles (horizon culling working)`);
                }
                this.show = false;
            }
            
            // Debug: Add wireframe visualization ONLY for selected AND visible tiles (and if debug is enabled)
            const debugEnabled = (window as any).integration?.isDebugSpheresEnabled || false;
            if (this._visible && this._ready && debugEnabled) {
                this.addDebugWireframe();
            } else {
                // Remove debug wireframe if tile is not visible or debug is disabled
                this.removeDebugWireframe();
            }
            
            // Delegate to the actual tile content
            this._tileContent.update(tileset, frameState);
            
        } catch (error) {
            console.error(`💥 Error in BabylonTileContent.update():`, error);
            throw error; // Re-throw so it shows in the main error handler
        }
    }
    
    
    /**
     * Show property - matches Cesium Model.show exactly
     */
    set show(show: boolean) {
        this._visible = show;
        this.updateVisibility();
    }
    
    get show(): boolean {
        return this._visible;
    }
    
    
    /**
     * Update visibility of the content
     */
    private updateVisibility(): void {
        if (this._tileContent && 'visible' in this._tileContent) {
            // Set the visibility flag
            (this._tileContent as any).visible = this._visible;
            
            // CRITICAL: Actually apply the visibility change to Babylon meshes
            if ('updateVisibility' in this._tileContent && typeof (this._tileContent as any).updateVisibility === 'function') {
                (this._tileContent as any).updateVisibility();
            }
        }
        
        // Update debug sphere visibility based on tile visibility and debug state
        const debugEnabled = (window as any).integration?.isDebugSpheresEnabled || false;
        if (this._visible && this._ready && debugEnabled) {
            this.addDebugWireframe();
        } else {
            this.removeDebugWireframe();
        }
    }

    /**
     * Add debug wireframe visualization for this tile
     */
    private addDebugWireframe(): void {
        // Only add wireframe once
        if (this._debugSphere) {
            // Make sure existing wireframe is visible
            this._debugSphere.setEnabled(true);
            return;
        }
        
        // Check debug state
        const debugEnabled = (window as any).integration?.isDebugSpheresEnabled || false;
        
        const tile = this._tile;
        
        // Check what bounding volume this tile actually has
        if (!tile.boundingVolume) {
            console.log(`❌ Tile ${tile.id} has NO bounding volume at all`);
            return;
        }
        
        const hasSphere = !!tile.boundingSphere;
        const hasBox = !!tile.boundingVolume.boundingBox;
        console.log(`🔍 Tile ${tile.id} bounding: sphere=${hasSphere}, box=${hasBox}, contentAvailable=${tile.contentAvailable}`);
        
        try {
            if (tile.boundingSphere) {
                // CREATE WIREFRAME SPHERE for sphere bounding volume
                const center = tile.boundingSphere.center;
                const radius = tile.boundingSphere.radius;
                console.log(`🔴 Creating SPHERE: center=(${center.x.toFixed(0)}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)}), radius=${radius.toFixed(0)}`);
                
                this._debugSphere = MeshBuilder.CreateSphere(
                    `debug_tile_${tile.id || 'unknown'}`, 
                    { diameter: radius * 2 }, 
                    this._babylonScene
                );
                
                // Position sphere using bounding sphere center: Cesium(X,Y,Z) → Babylon(X,Z,Y)
                this._debugSphere.position.set(center.x, center.z, center.y);
                
                console.log(`🔴 Positioned sphere at Babylon(${center.x.toFixed(0)}, ${center.z.toFixed(0)}, ${center.y.toFixed(0)})`);
                
            } else if (tile.boundingVolume?.boundingBox) {
                // CREATE WIREFRAME BOX for box bounding volume
                const box = tile.boundingVolume.boundingBox;
                const center = box.center || {x: 0, y: 0, z: 0};
                const halfSize = box.halfSize || {x: 1000, y: 1000, z: 1000};
                console.log(`📦 Creating BOX: center=(${center.x.toFixed(0)}, ${center.y.toFixed(0)}, ${center.z.toFixed(0)}), size=(${(halfSize.x*2).toFixed(0)}, ${(halfSize.y*2).toFixed(0)}, ${(halfSize.z*2).toFixed(0)})`);
                
                this._debugSphere = MeshBuilder.CreateBox(
                    `debug_tile_${tile.id || 'unknown'}`,
                    { 
                        width: halfSize.x * 2,   // X dimension
                        height: halfSize.z * 2,  // Y dimension (Cesium Z → Babylon Y)
                        depth: halfSize.y * 2    // Z dimension (Cesium Y → Babylon Z)
                    },
                    this._babylonScene
                );
                
                // Position box: Cesium(X,Y,Z) → Babylon(X,Z,Y)
                this._debugSphere.position.set(center.x, center.z, center.y);
                
                console.log(`📦 Positioned box at Babylon(${center.x.toFixed(0)}, ${center.z.toFixed(0)}, ${center.y.toFixed(0)})`);
                
            } else {
                console.log(`❌ Tile ${tile.id} has unknown bounding volume type`);
                return;
            }
            
            // Create wireframe material - different colors for different bounding volume types
            const material = new StandardMaterial(`debug_material_${tile.id || 'unknown'}`, this._babylonScene);
            
            if (tile.boundingSphere) {
                // RED for bounding spheres
                material.diffuseColor = new Color3(1, 0, 0); // Red
                material.emissiveColor = new Color3(0.2, 0, 0); // Red glow
            } else {
                // GREEN for bounding boxes  
                material.diffuseColor = new Color3(0, 1, 0); // Green
                material.emissiveColor = new Color3(0, 0.2, 0); // Green glow
            }
            
            material.wireframe = true; // CRITICAL: Always wireframe for debug volumes
            material.alpha = 0.8; // More opaque for better wireframe visibility
            material.backFaceCulling = false; // Show wireframe from all angles
            
            this._debugSphere.material = material;
            this._debugSphere.setEnabled(true);
            
            console.log(`🔴 Debug WIREFRAME sphere SHOWN for SELECTED tile ${tile.id || 'unknown'} at radius ${tile.boundingSphere.radius.toFixed(1)}m`);
        } catch (error) {
            console.error('Failed to create debug wireframe:', error);
        }
    }

    /**
     * Remove debug wireframe visualization for this tile
     */
    public removeDebugWireframe(): void {
        if (this._debugSphere && this._debugSphere.isEnabled()) {
            // Hide the wireframe instead of disposing it (for performance)
            this._debugSphere.setEnabled(false);
            console.log(`⚫ Debug wireframe HIDDEN for DESELECTED tile ${this._tile.id || 'unknown'}`);
        }
    }

    /**
     * Show/hide the content
     */
    set visible(visible: boolean) {
        this._visible = visible;
        this.updateVisibility();
    }
    
    get visible(): boolean {
        return this._visible;
    }
    
    /**
     * Check if content is ready - matches Cesium content interface
     */
    get ready(): boolean {
        return this._ready;
    }
    
    /**
     * Get the meshes (for debugging/inspection)
     */
    get meshes(): AbstractMesh[] {
        if (this._tileContent && 'meshes' in this._tileContent) {
            return (this._tileContent as any).meshes || [];
        }
        return [];
    }
    
    /**
     * Destroy the content - matches Cesium content interface
     */
    destroy(): void {
        // Destroy the actual tile content
        if (this._tileContent) {
            this._tileContent.destroy();
            
            // Direct destruction - no orchestrator cleanup needed
        }
        
        // Dispose of debug sphere
        if (this._debugSphere) {
            this._debugSphere.dispose();
            this._debugSphere = undefined;
        }
        
        this._tileContent = undefined;
        this._ready = false;
    }
    
    /**
     * Check if content is destroyed
     */
    isDestroyed(): boolean {
        return !this._tileContent || this._tileContent.isDestroyed();
    }
}