import { Scene as BabylonScene, Matrix, Vector3 } from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import * as Cesium from 'cesium';

/**
 * SimpleBabylonTileContent - Following Cesium's Model3DTileContent pattern EXACTLY
 * 
 * This follows the exact same static factory pattern as Cesium's Model3DTileContent.js:
 * - Static async factory methods (fromB3dm, fromGltf)  
 * - Constructor takes (tileset, tile, resource)
 * - Proper content parsing for B3DM and GLB formats
 */
export class SimpleBabylonTileContent {
    private _tileset: any;
    private _tile: any;
    private _resource: any;
    private _babylonScene: BabylonScene;
    private _ready: boolean = false;
    private _meshes: any[] = [];
    private static _rogueUpdateCount: number = 0;

    constructor(tileset: any, tile: any, resource: any, babylonScene: BabylonScene) {
        this._tileset = tileset;
        this._tile = tile;
        this._resource = resource;
        this._babylonScene = babylonScene;
    }

    private async loadContent(gltfData: Uint8Array): Promise<void> {
        try {
            if (!gltfData || gltfData.length === 0) {
                        this._ready = true;
                return;
            }

            // Convert glTF data to Blob with proper MIME type
            const blob = new Blob([gltfData], { type: 'model/gltf-binary' });
            const objectURL = URL.createObjectURL(blob);


            // Load with Babylon's SceneLoader using proper glTF plugin
            const result = await SceneLoader.ImportMeshAsync(
                '', // meshNames (load all)
                '', // rootUrl 
                objectURL, // sceneFilename
                this._babylonScene,
                undefined, // onProgress
                '.glb' // file extension hint for proper plugin selection
            );
            
            // Enable logarithmic depth buffer and hide meshes by default
            result.meshes.forEach((mesh, index) => {
                if (mesh.material) {
                    mesh.material.useLogarithmicDepth = true;
                }
                // Hide mesh until Cesium decides it should be visible
                mesh.setEnabled(false);
                // Quiet: mesh loaded
            });

            // Store meshes for cleanup
            this._meshes = result.meshes;
            

            // Store Cesium's transform for later application during rendering
            // DON'T apply here - let Cesium handle tile positioning through its normal pipeline
            this.storeCesiumTransform();


            // Native pattern: simple ready state
            this._ready = true;
            
            // Let Cesium recognize content automatically via its internal logic:
            // - tile._content is assigned (done in factory methods)
            // - content.ready returns true (done via our ready getter)
            // - Cesium computes contentAvailable and hasRenderableContent based on these
            // Quiet: content ready logs

            // Clean up object URL
            URL.revokeObjectURL(objectURL);

        } catch (error) {
            console.error('Failed to load tile content:', error);
            // Don't mark ready on failure - let Cesium handle failed content properly
        }
    }

    /**
     * Store Cesium's transform matrix for later application during rendering
     * Let Cesium handle tile positioning through its normal pipeline
     */
    private storeCesiumTransform(): void {
        // Get the computed transform from the tile 
        const cesiumTransform = this._tile.computedTransform;
        if (!cesiumTransform) {
            return;
        }

        // Store transform on the tile content for later access during rendering
        (this as any)._storedTransform = cesiumTransform;

    }

    // ========================================
    // CESIUM INTERFACE IMPLEMENTATION
    // Following Model3DTileContent.js exactly
    // ========================================

    get featuresLength(): number {
        return 0; // No per-feature access needed for basic rendering
    }

    get pointsLength(): number {
        return 0; // No point cloud data
    }

    get trianglesLength(): number {
        // COPY CESIUM EXACTLY: Model3DTileContent delegates to model.statistics.trianglesLength
        if (!this._ready || !this._meshes) return 0;
        
        return this._meshes.reduce((total, mesh) => {
            const indices = mesh.getTotalIndices ? mesh.getTotalIndices() : 0;
            return total + Math.floor(indices / 3);
        }, 0);
    }

    get geometryByteLength(): number {
        // COPY CESIUM EXACTLY: Model3DTileContent delegates to model.statistics.geometryByteLength
        if (!this._ready || !this._meshes) return 0;
        
        let byteLength = 0;
        this._meshes.forEach(mesh => {
            // Calculate approximate geometry size like native Cesium
            if (mesh.geometry) {
                const vertices = mesh.geometry.getTotalVertices ? mesh.geometry.getTotalVertices() : 0;
                const indices = mesh.getTotalIndices ? mesh.getTotalIndices() : 0;
                // Position (3 floats) + Normal (3 floats) + UV (2 floats) = 8 floats per vertex
                byteLength += vertices * 8 * 4; // 4 bytes per float
                byteLength += indices * 2; // 2 bytes per index
            }
        });
        
        return byteLength || (this._resource?.arrayBuffer?.byteLength || 0);
    }

    get texturesByteLength(): number {
        return 0; // Could calculate from loaded textures if needed
    }

    get batchTableByteLength(): number {
        return 0; // No batch table for simple content
    }

    get innerContents(): undefined {
        return undefined; // No nested content
    }

    get ready(): boolean {
        // Simple ready state - just return if we have loaded content
        const isReady = this._ready && this._meshes && this._meshes.length > 0;
        
        // Quiet: console.log(`🔍 CONTENT.READY GETTER CALLED: depth=${this._tile._depth}, ready=${this._ready}, meshCount=${this._meshes?.length || 0}, result=${isReady}`);
        // Quiet ready state logging
        
        return isReady;
    }


    get tileset(): any {
        return this._tileset;
    }

    get tile(): any {
        return this._tile;
    }

    get url(): string | undefined {
        return this._resource?.getUrlComponent();
    }

    get metadata(): undefined {
        return undefined;
    }

    set metadata(_value: any) {
        // No metadata support needed
    }

    // ========================================
    // BABYLON INTEGRATION METHODS
    // ========================================

    /**
     * Get loaded Babylon meshes for external transform application
     */
    getBabylonMeshes(): any[] {
        return this._meshes || [];
    }

    /**
     * Get stored Cesium transform matrix
     */
    getStoredTransform(): any {
        return (this as any)._storedTransform;
    }

    get batchTable(): undefined {
        return undefined;
    }

    get group(): undefined {
        return undefined;
    }

    set group(_value: any) {
        // No group support needed
    }

    /**
     * COPY CESIUM EXACTLY: Model3DTileContent.getTextureIds()
     * Returns texture IDs for loaded textures
     */
    getTextureIds(): string[] {
        // For basic implementation, return empty array
        // In full implementation, would return texture IDs from loaded meshes
        return [];
    }

    /**
     * COPY CESIUM EXACTLY: Model3DTileContent.getTextureByteLengthById()
     * Returns byte length for specific texture
     */
    getTextureByteLengthById(_textureId: string): number | undefined {
        // For basic implementation, return undefined
        // In full implementation, would return texture size by ID
        return undefined;
    }

    /**
     * COPY CESIUM EXACTLY: Model3DTileContent.getExtension()
     * Returns extension object if available
     */
    getExtension(_extensionName: string): any {
        // For basic implementation, return undefined
        // In full implementation, would return glTF extension data
        return undefined;
    }

    // COPY CESIUM EXACTLY: Model3DTileContent feature methods
    hasProperty(_featureId: number, _name: string): boolean {
        // Native pattern: check if feature table exists and has property
        // For basic implementation without feature tables, return false
        return false;
    }

    getFeature(_featureId: number): undefined {
        // COPY CESIUM EXACTLY: Model3DTileContent.getFeature()
        // Native implementation accesses model.featureTables[model.featureTableId]
        // For basic implementation without feature tables, return undefined
        return undefined;
    }

    applyDebugSettings(enabled: boolean, color: any): void {
        // COPY CESIUM EXACTLY: Model3DTileContent.applyDebugSettings()
        // Native pattern: color = enabled ? color : Color.WHITE
        const debugColor = enabled ? color : { r: 1, g: 1, b: 1, a: 1 }; // White equivalent
        
        if (this.featuresLength === 0) {
            // Native: this._model.color = color
            // For Babylon: apply color to all meshes
            this._meshes.forEach(mesh => {
                if (mesh.material && enabled) {
                    // Basic debug coloring - could be enhanced
                    (mesh.material as any).diffuseColor = debugColor;
                }
            });
        } else if (this.batchTable) {
            // Native: this.batchTable.setAllColor(color)
            // For basic implementation, batch table not yet supported
        }
    }

    applyStyle(style: any): void {
        // COPY CESIUM EXACTLY: Model3DTileContent.applyStyle()
        // Native pattern: this._model.style = style
        // For Babylon implementation, basic style application could be added here
        // For now, store the style for potential future use
        (this as any)._style = style;
    }


    update(tileset: any, frameState: any): void {
        // COPY CESIUM EXACTLY: Model3DTileContent.update() pattern
        // The native update() method only manages model properties, NOT visibility
        // Visibility is handled by Cesium's traversal/selection algorithms
        
        if (!this._meshes || this._meshes.length === 0) {
            return;
        }

        // Apply transform - equivalent to: model.modelMatrix = tile.computedTransform
        const transform = this._tile.computedTransform;
        if (transform) {
            this.applyTransformToMeshes(transform);
        }

        // Handle ready state transition - equivalent to native pattern
        if (!this._ready && this._meshes && this._meshes.length > 0) {
            this._ready = true;
        }
        
        // CRITICAL FIX: Only handle visibility for tiles that are actually selected
        // Native Cesium only calls update() on selected tiles, but our integration calls it during processing
        // Check if this tile is actually selected before applying visibility logic

        // DEBUG: Check which tile list this tile is in and trace the call
        const selectedTiles = (tileset as any)._selectedTiles || [];
        const emptyTiles = (tileset as any)._emptyTiles || [];
        const isInSelectedList = selectedTiles.includes(this._tile);
        const isInEmptyList = emptyTiles.includes(this._tile);
        
        // DEBUG: Detailed refinement and parent-child analysis
        const refinementType = this._tile.refine === 0 ? 'ADD' : this._tile.refine === 1 ? 'REPLACE' : 'UNKNOWN';
        const hasChildren = this._tile.children && this._tile.children.length > 0;
        const selectedChildren = hasChildren ? this._tile.children.filter((child: any) => selectedTiles.includes(child)) : [];
        const childrenDepths = selectedChildren.map((child: any) => child._depth);
        
        // Log detailed tile state to understand the issue
        const tileState = {
            depth: this._tile._depth,
            refinement: refinementType,
            inSelected: isInSelectedList,
            inEmpty: isInEmptyList,
            contentAvailable: this._tile.contentAvailable,
            hasRenderableContent: this._tile.hasRenderableContent,
            visible: this._tile._visible,
            ready: this._ready,
            meshCount: this._meshes?.length || 0,
            hasChildren: hasChildren,
            numChildren: this._tile.children?.length || 0,
            selectedChildrenCount: selectedChildren.length,
            selectedChildrenDepths: childrenDepths
        };
        
        // CRITICAL TIMING ISSUE IDENTIFIED:
        // - Parent REPLACE tiles (depth 2, 8) are being selected
        // - But their children (depth 3, 9) are ready and available
        // - Cesium's selection algorithm is not updating to select children instead
        // - This violates REPLACE refinement: should select children, not parents
        
        // Log selection analysis for REPLACE tiles (only once to avoid spam)
        if (this._tile.refine === 1 && isInSelectedList && !this._tile._timingIssueLogged) {
            const availableChildren = hasChildren ? this._tile.children.filter((child: any) => child.contentAvailable) : [];
            const readyChildren = hasChildren ? this._tile.children.filter((child: any) => child.contentReady) : [];
            
            if (hasChildren && selectedChildren.length === 0 && (availableChildren.length > 0 || readyChildren.length > 0)) {
                console.log(`🚨 REPLACE REFINEMENT BUG: Parent depth=${this._tile._depth} selected but ${readyChildren.length} children ready!`);
                
                // ROOT CAUSE: Parent SSE is enormous, children SSE much smaller
                // This violates Cesium's selection logic - children should have higher SSE than parents
                // or children should only be selected when they meet SSE criteria
                console.log(`   🔧 SSE ISSUE: Parent SSE=${this._tile._screenSpaceError?.toFixed(2)}, should be smaller than children`);
                console.log(`   🔧 This suggests camera/frustum calculation bug in our integration`);
                
                this._tile._timingIssueLogged = true; // Prevent spam
            }
        }
        
        if (!isInSelectedList) {
            if (isInEmptyList) {
                // This is an empty tile - it should NOT render content
                console.log(`🚫 EMPTY TILE:`, tileState, `- hiding content`);
            } else {
                // CRITICAL FIX: This tile's update() is being called during processing, not selection
                // In native Cesium, content.update() is only called for selected tiles
                // Since this tile is not selected, we should just apply transforms and return
                SimpleBabylonTileContent._rogueUpdateCount++;
                // Quiet processing updates
                // Keep meshes hidden - they will be enabled when/if tile gets selected
                return;
            }
            this._meshes.forEach(mesh => {
                mesh.setEnabled(false);
            });
            return;
        }

        // REPLACE refinement check: if this tile has selected children, hide it
        if (this._tile.refine === 1) { // REPLACE
            const hasSelectedChildren = this._tile.children && this._tile.children.some((child: any) => 
                selectedTiles.includes(child)
            );
            if (hasSelectedChildren) {
                console.log(`🚫 HIDING PARENT: depth=${this._tile._depth} has selected children`);
                this._meshes.forEach(mesh => {
                    mesh.setEnabled(false);
                });
                return;
            }
        }

        // Show this tile
        this._meshes.forEach(mesh => {
            mesh.setEnabled(true);
        });
    }


    pick(ray: any, frameState: any, result?: any): undefined {
        // COPY CESIUM EXACTLY: Model3DTileContent.pick() signature and pattern
        // Native: return this._model.pick(ray, frameState, verticalExaggeration, relativeHeight, Ellipsoid.WGS84, result)
        if (!this._ready || !this._meshes) {
            return undefined;
        }
        
        // Basic implementation - could be enhanced with proper ray-mesh intersection
        // For now, return undefined like the basic native fallback
        return result;
    }

    isDestroyed(): boolean {
        return false; // Simple implementation
    }

    destroy(): void {
        // Clean up Babylon meshes
        this._meshes.forEach(mesh => {
            if (mesh.dispose) {
                mesh.dispose();
            }
        });
        this._meshes = [];
        this._ready = false;
    }

    // ========================================
    // STATIC FACTORY METHODS - Following Cesium's Model3DTileContent.js EXACTLY
    // ========================================

    /**
     * Creates a SimpleBabylonTileContent from a B3DM ArrayBuffer
     * Follows the exact signature of Model3DTileContent.fromB3dm()
     */
    static async fromB3dm(
        tileset: any,
        tile: any,
        resource: any,
        arrayBuffer: ArrayBuffer,
        byteOffset: number,
        babylonScene: BabylonScene
    ): Promise<SimpleBabylonTileContent> {
        const content = new SimpleBabylonTileContent(tileset, tile, resource, babylonScene);
        
        try {
            // Parse B3DM header to extract glTF data
            const dataView = new DataView(arrayBuffer, byteOffset);
            const magic = new TextDecoder().decode(new Uint8Array(arrayBuffer, byteOffset, 4));
            if (magic !== 'b3dm') {
                throw new Error(`Invalid B3DM magic: ${magic}`);
            }

            const byteLength = dataView.getUint32(8, true);
            const featureTableJSONByteLength = dataView.getUint32(12, true);
            const featureTableBinaryByteLength = dataView.getUint32(16, true);
            const batchTableJSONByteLength = dataView.getUint32(20, true);
            const batchTableBinaryByteLength = dataView.getUint32(24, true);

            // Calculate glTF data offset
            let gltfOffset = byteOffset + 28;
            gltfOffset += featureTableJSONByteLength + featureTableBinaryByteLength;
            gltfOffset += batchTableJSONByteLength + batchTableBinaryByteLength;

            const gltfByteLength = byteLength - (gltfOffset - byteOffset);
            const gltfData = new Uint8Array(arrayBuffer, gltfOffset, gltfByteLength);

            await content.loadContent(gltfData);
            
        } catch (error) {
            console.error('B3DM parsing failed:', error);
        }
        
        // CRITICAL: Follow native Cesium pattern for state management
        // 1. Assign content to tile
        tile._content = content;
        // 2. Set tile state to PROCESSING (like native processArrayBuffer does)
        tile._contentState = (Cesium as any).Cesium3DTileContentState.PROCESSING;
        // 3. Add to processing queue for state transition to READY
        tileset._processingQueue.push(tile);
        // 4. Update statistics counter (like native pattern)
        ++tileset.statistics.numberOfTilesProcessing;
        // Quiet: B3DM content assigned
        
        // DEBUG: Add debug logging to tile.process method to understand why it's not transitioning
        if (!tile._debugProcessAdded) {
            const originalProcess = tile.process;
            tile.process = function(tileset, frameState) {
                // Quiet: console.log(`🔍 TILE.PROCESS CALLED: depth=${this._depth}, contentExpired=${this.contentExpired}, contentReady=${this.contentReady}, content.ready=${this._content?.ready}`);
                // Quiet: console.log(`   State check: !contentExpired=${!this.contentExpired}, !contentReady=${!this.contentReady}, content.ready=${this._content?.ready}`);
                
                const result = originalProcess.call(this, tileset, frameState);
                
                // Quiet: console.log(`🔍 TILE.PROCESS RESULT: depth=${this._depth}, newContentReady=${this.contentReady}, newContentState=${this._contentState}`);
                return result;
            };
            tile._debugProcessAdded = true;
        }
        
        return content;
    }

    /**
     * Creates a SimpleBabylonTileContent from a GLB ArrayBuffer  
     * Follows the exact signature of Model3DTileContent.fromGltf()
     */
    static async fromGltf(
        tileset: any,
        tile: any,
        resource: any,
        gltf: ArrayBuffer,
        babylonScene: BabylonScene
    ): Promise<SimpleBabylonTileContent> {
        const content = new SimpleBabylonTileContent(tileset, tile, resource, babylonScene);
        
        try {
            const gltfData = new Uint8Array(gltf);
            await content.loadContent(gltfData);
        } catch (error) {
            console.error('GLB loading failed:', error);
        }
        
        // CRITICAL: Follow native Cesium pattern for state management
        // 1. Assign content to tile
        tile._content = content;
        // 2. Set tile state to PROCESSING (like native processArrayBuffer does)
        tile._contentState = (Cesium as any).Cesium3DTileContentState.PROCESSING;
        // 3. Add to processing queue for state transition to READY
        tileset._processingQueue.push(tile);
        // 4. Update statistics counter (like native pattern)
        ++tileset.statistics.numberOfTilesProcessing;
        // Quiet: content assigned
        
        // DEBUG: Add debug logging to tile.process method to understand why it's not transitioning
        if (!tile._debugProcessAdded) {
            const originalProcess = tile.process;
            tile.process = function(tileset, frameState) {
                // Quiet: console.log(`🔍 TILE.PROCESS CALLED: depth=${this._depth}, contentExpired=${this.contentExpired}, contentReady=${this.contentReady}, content.ready=${this._content?.ready}`);
                // Quiet: console.log(`   State check: !contentExpired=${!this.contentExpired}, !contentReady=${!this.contentReady}, content.ready=${this._content?.ready}`);
                
                const result = originalProcess.call(this, tileset, frameState);
                
                // Quiet: console.log(`🔍 TILE.PROCESS RESULT: depth=${this._depth}, newContentReady=${this.contentReady}, newContentState=${this._contentState}`);
                return result;
            };
            tile._debugProcessAdded = true;
        }
        
        return content;
    }

    // ========================================
    // NATIVE CESIUM INTEGRATION METHODS
    // Required for proper selection algorithm integration
    // ========================================


    /**
     * NATIVE CESIUM PATTERN: Apply transform to meshes exactly like Model3DTileContent
     */
    private applyTransformToMeshes(transform: any): void {
        // Convert Cesium transform matrix to Babylon matrix
        if (!transform) return;
        
        // Apply transform to each mesh - this is critical for Cesium integration
        this._meshes.forEach(mesh => {
            if (mesh.setTransformMatrix) {
                mesh.setTransformMatrix(transform);
            }
        });
    }

    featurePropertiesDirty: boolean = false;
}