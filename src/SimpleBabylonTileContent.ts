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

    constructor(tileset: any, tile: any, resource: any, babylonScene: BabylonScene) {
        this._tileset = tileset;
        this._tile = tile;
        this._resource = resource;
        this._babylonScene = babylonScene;
    }

    private async loadContent(gltfData: Uint8Array): Promise<void> {
        try {
            if (!gltfData || gltfData.length === 0) {
                console.warn('⚠️ Empty glTF data for tile');
                this._ready = true;
                return;
            }

            // Convert glTF data to Blob with proper MIME type
            const blob = new Blob([gltfData], { type: 'model/gltf-binary' });
            const objectURL = URL.createObjectURL(blob);

            // Loading tile content

            // Load with Babylon's SceneLoader using proper glTF plugin
            const result = await SceneLoader.ImportMeshAsync(
                '', // meshNames (load all)
                '', // rootUrl 
                objectURL, // sceneFilename
                this._babylonScene,
                undefined, // onProgress
                '.glb' // file extension hint for proper plugin selection
            );
            
            // Enable logarithmic depth buffer on all tile materials for Earth-scale precision
            result.meshes.forEach(mesh => {
                if (mesh.material) {
                    mesh.material.useLogarithmicDepth = true;
                }
            });

            // Store meshes for cleanup
            this._meshes = result.meshes;

            // Store Cesium's transform for later application during rendering
            // DON'T apply here - let Cesium handle tile positioning through its normal pipeline
            this.storeCesiumTransform();

            // Debug tile bounding info for geographic validation
            const boundingSphere = this._tile.boundingSphere;
            let boundingInfo = 'No bounding sphere';
            if (boundingSphere) {
                const centerCartographic = Cesium.Cartographic.fromCartesian(boundingSphere.center);
                if (centerCartographic) {
                    const centerLat = Cesium.Math.toDegrees(centerCartographic.latitude);
                    const centerLon = Cesium.Math.toDegrees(centerCartographic.longitude);
                    boundingInfo = `Center: ${centerLat.toFixed(4)}°, ${centerLon.toFixed(4)}°, Radius: ${boundingSphere.radius.toFixed(0)}m`;
                }
            }
            
            // Only log tile bounds for analysis (key geographic data)
            if (this._tile._depth <= 3) {
                console.log(`✅ Tile loaded: ${boundingInfo} | Expected: NYC ~40.69°, -74.04°`);
            }

            // Mark as ready - this is what matters for Cesium
            this._ready = true;

            // Clean up object URL
            URL.revokeObjectURL(objectURL);

        } catch (error) {
            console.error('❌ Failed to load tile content:', error);
            this._ready = true; // Mark ready even on failure so tile system continues
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
            console.warn('⚠️ No computedTransform found on tile');
            return;
        }

        // Store transform on the tile content for later access during rendering
        (this as any)._storedTransform = cesiumTransform;

        // Only log first tile transform to reduce spam
        if (this._tile._depth <= 2) {
            console.log(`💾 Transform stored: depth=${this._tile._depth}`);
        }
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
        // Count triangles from loaded meshes
        return this._meshes.reduce((total, mesh) => {
            const indices = mesh.getTotalIndices ? mesh.getTotalIndices() : 0;
            return total + Math.floor(indices / 3);
        }, 0);
    }

    get geometryByteLength(): number {
        // Estimate from ArrayBuffer size
        return this._resource.arrayBuffer?.byteLength || 0;
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
        // Reduced ready check logging - only first few times per tile
        if (this._ready && this._tile && this._tile._depth <= 2) {
            const now = Date.now();
            if (!this._lastReadyLogTime || (now - this._lastReadyLogTime) > 5000) {
                console.log(`🔄 CONTENT READY: depth=${this._tile._depth}, state=${this._tile._contentState}`);
                this._lastReadyLogTime = now;
            }
        }
        return this._ready;
    }

    private _lastReadyLogTime?: number;

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

    // Methods
    hasProperty(_batchId: number, _name: string): boolean {
        return false;
    }

    getFeature(_batchId: number): undefined {
        return undefined;
    }

    applyDebugSettings(_enabled: boolean, _color: any): void {
        // Debug visualization could be added here if needed
    }

    applyStyle(_style: any): void {
        // Style application could be added here if needed
    }

    update(tileset: any, frameState: any): void {
        // Follow Cesium's Model3DTileContent.update() pattern exactly
        // The key is responding to Cesium's tile visibility decisions
        
        if (!this._ready || !this._meshes || this._meshes.length === 0) {
            return;
        }

        // Keep tiles visible by default - let Cesium handle selection naturally
        // Don't interfere with Cesium's tile visibility decisions
        
        // Apply transform updates if needed
        const currentTransform = this._tile.computedTransform;
        if (currentTransform) {
            // Transform updates could go here if needed
        }
    }

    pick(_ray: any, _frameState: any, _result?: any): undefined {
        // Picking logic could be added here if needed
        return undefined;
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
            console.log('🏗️ B3DM FACTORY: Parsing B3DM content:', {
                tileDepth: tile._depth,
                arrayBufferSize: arrayBuffer.byteLength,
                byteOffset: byteOffset
            });

            // Parse B3DM header to extract glTF data
            // B3DM format: [header][feature table][batch table][binary glTF]
            const dataView = new DataView(arrayBuffer, byteOffset);
            
            // Read B3DM header (28 bytes)
            const magic = new TextDecoder().decode(new Uint8Array(arrayBuffer, byteOffset, 4));
            if (magic !== 'b3dm') {
                throw new Error(`Invalid B3DM magic: ${magic}`);
            }

            const version = dataView.getUint32(4, true);
            const byteLength = dataView.getUint32(8, true);
            const featureTableJSONByteLength = dataView.getUint32(12, true);
            const featureTableBinaryByteLength = dataView.getUint32(16, true);
            const batchTableJSONByteLength = dataView.getUint32(20, true);
            const batchTableBinaryByteLength = dataView.getUint32(24, true);

            console.log('📦 B3DM Header:', {
                magic, version, byteLength,
                featureTableJSONByteLength, featureTableBinaryByteLength,
                batchTableJSONByteLength, batchTableBinaryByteLength
            });

            // Calculate glTF data offset
            let gltfOffset = byteOffset + 28; // Header size
            gltfOffset += featureTableJSONByteLength;
            gltfOffset += featureTableBinaryByteLength;  
            gltfOffset += batchTableJSONByteLength;
            gltfOffset += batchTableBinaryByteLength;

            // Extract glTF data
            const gltfByteLength = byteLength - (gltfOffset - byteOffset);
            const gltfData = new Uint8Array(arrayBuffer, gltfOffset, gltfByteLength);

            console.log('🎯 Extracted glTF data:', {
                gltfOffset: gltfOffset - byteOffset,
                gltfByteLength: gltfByteLength
            });

            // Load the extracted glTF data
            await content.loadContent(gltfData);
            
        } catch (error) {
            console.error('❌ B3DM parsing failed:', error);
            content._ready = true; // Mark ready to avoid blocking tile system
        }
        
        // Silent factory completion to reduce spam
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
            console.log('🏗️ GLTF FACTORY: Loading GLB content:', {
                tileDepth: tile._depth,
                gltfSize: gltf.byteLength
            });

            // GLB data is already in the correct format
            const gltfData = new Uint8Array(gltf);
            await content.loadContent(gltfData);
            
        } catch (error) {
            console.error('❌ GLB loading failed:', error);
            content._ready = true; // Mark ready to avoid blocking tile system
        }
        
        // Silent factory completion to reduce spam
        return content;
    }
}