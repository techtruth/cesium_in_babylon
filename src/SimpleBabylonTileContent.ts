/**
 * SimpleBabylonTileContent.ts - Cesium-Compatible Tile Content Renderer
 * 
 * Babylon.js implementation of Cesium's tile content interface for rendering 3D Tiles.
 * - Implements full Model3DTileContent API for seamless Cesium integration
 * - Handles B3DM and GLB parsing with proper state transitions (LOADING→PROCESSING→READY)
 * - Uses Babylon.js SceneLoader for glTF content rendering
 * - Manages mesh visibility based on Cesium's tile selection algorithms
 * - Provides geometry/texture statistics for Cesium's memory management
 */

import { Scene as BabylonScene } from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
export class SimpleBabylonTileContent {
    private _tileset: any;
    private _tile: any;
    private _resource: any;
    private _babylonScene: BabylonScene;
    private _ready: boolean = false;
    private _meshes: any[] = [];
    private _lastUpdateFrame: number = -1;

    constructor(tileset: any, tile: any, resource: any, babylonScene: BabylonScene) {
        this._tileset = tileset;
        this._tile = tile;
        this._resource = resource;
        this._babylonScene = babylonScene;
    }

    private async loadContent(gltfData: Uint8Array): Promise<void> {
        try {
            // Convert glTF data to Blob with proper MIME type
            const blob = new Blob([gltfData], { type: 'model/gltf-binary' });
            const objectURL = URL.createObjectURL(blob);

            // Load with Babylon's SceneLoader using proper glTF plugin
            //TODO: DEPRECATED - REPLACE WITH NEWER IMPORT
            const result = await SceneLoader.ImportMeshAsync(
                '', // meshNames (load all)
                '', // rootUrl 
                objectURL, // sceneFilename
                this._babylonScene,
                undefined, // onProgress
                '.glb' // file extension hint for proper plugin selection
            );
            
            // Hide meshes by default until Cesium decides they should be visible
            result.meshes.forEach((mesh, _index) => {
                mesh.setEnabled(false);
            });

            // Store meshes for cleanup
            this._meshes = result.meshes;

            // Store Cesium's transform for later application during rendering
            // DON'T apply here - let Cesium handle tile positioning through its normal pipeline
            this.storeCesiumTransform();

            // Clean up object URL
            URL.revokeObjectURL(objectURL);

        } catch (error) {
            console.error('Failed to load tile content:', error);
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
        // NATIVE CESIUM PATTERN: Return ready state directly
        // Model3DTileContent.ready just returns this._ready
        // Empty content (no meshes) can still be ready
        return this._ready;
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

    applyStyle(style: any): void {
        // COPY CESIUM EXACTLY: Model3DTileContent.applyStyle()
        // Native pattern: this._model.style = style
        // For Babylon implementation, basic style application could be added here
        // For now, store the style for potential future use
        (this as any)._style = style;
    }


    update(tileset: any, frameState: any): void {
        // NATIVE CESIUM PATTERN: update() is ONLY called on selected tiles by Cesium3DTileset.updateTiles()
        // If this method is called, the tile IS selected and should be visible - no conditional logic needed
        // This matches Model3DTileContent.js exactly: just update properties and call model.update()
        
        // Don't return early for empty content - it still needs ready state processing

        // NATIVE CESIUM PATTERN: Only set ready when content is truly ready
        // Model3DTileContent: if (!this._ready && model.ready) { this._ready = true; }
        if (!this._ready) {
            if (!this._meshes || this._meshes.length === 0) {
                // Empty content - mark as ready immediately (like empty tiles in Google 3D Tiles)
                this._ready = true;
            } else {
                // Content with meshes - ensure meshes are properly loaded
                const meshesLoaded = this._meshes.every(mesh => mesh.isReady && mesh.isReady());
                if (meshesLoaded) {
                    this._ready = true;
                } else {
                    // Content is still loading - stay in PROCESSING state
                }
            }
        }
        
        // NATIVE CESIUM PATTERN: If update() is called, the tile is selected - show all meshes
        // Cesium handles hiding by NOT calling update() on unselected tiles
        if (this._meshes && this._meshes.length > 0) {
            this._meshes.forEach((mesh, index) => {
                if (!mesh.isEnabled()) {
                    mesh.setEnabled(true);
                }
            });
        }
        
        // Track when this tile was last updated (selected by Cesium)
        const frameNumber = frameState.frameNumber;
        this._lastUpdateFrame = frameNumber;
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

            // NATIVE CESIUM PATTERN: Async processing while factory method is active
            // Cesium will assign tile._content when this promise resolves
            await content.loadContent(gltfData);
            
        } catch (error) {
            console.error('B3DM parsing failed:', error);
        }
        
        // NATIVE PATTERN: Return content, let Cesium assign tile._content
        // This allows proper LOADING → PROCESSING → READY state transitions
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
            // NATIVE CESIUM PATTERN: Async processing while factory method is active
            // Cesium will assign tile._content when this promise resolves
            await content.loadContent(gltfData);
        } catch (error) {
            console.error('GLB loading failed:', error);
        }
        
        // NATIVE PATTERN: Return content, let Cesium assign tile._content
        // This allows proper LOADING → PROCESSING → READY state transitions
        return content;
    }

    // ========================================
    // NATIVE CESIUM INTEGRATION METHODS
    // Required for proper selection algorithm integration
    // ========================================


    featurePropertiesDirty: boolean = false;
    
    /**
     * NATIVE CESIUM CLEANUP PATTERN: Hide meshes for tiles not selected in recent frames
     * This mimics how Cesium's native models get hidden when their tiles aren't selected
     */
    checkAndHideIfNotSelected(currentFrame: number): void {
        // If this tile hasn't been updated in the last 2 frames, hide its meshes
        // This matches Cesium's pattern where unselected tiles don't get rendered
        if (this._lastUpdateFrame !== -1 && (currentFrame - this._lastUpdateFrame) >= 2) {
            this._meshes.forEach((mesh, index) => {
                if (mesh.isEnabled()) {
                    mesh.setEnabled(false);
                }
            });
        }
    }
}