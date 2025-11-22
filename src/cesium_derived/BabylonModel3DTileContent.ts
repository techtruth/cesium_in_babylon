import {
    Scene as BabylonScene,
    AbstractMesh,
    TransformNode,
    Matrix,
    AssetContainer
} from '@babylonjs/core';
import { defined } from 'cesium'; // CESIUM MODULE: Import for clipping plane checks
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import { Babylon3DTileContentBase } from './Babylon3DTileContent';
import { B3dmParserV2 } from './B3dmParser_v2';
import { BabylonGltfLoader } from './BabylonGltfLoader_derived';

/**
 * CESIUM REFERENCE: @cesium/engine/Source/Scene/Model/Model3DTileContent.js
 * 
 * BabylonModel3DTileContent - Derived from Cesium's Model3DTileContent.js
 * 
 * This class specifically handles glTF/GLB model content from 3D tiles,
 * following the exact patterns from Cesium's Model3DTileContent implementation.
 * 
 * KEY CESIUM METHODS ADAPTED:
 * - fromGltf() → createFromArrayBuffer()
 * - update() → update() 
 * - destroy() → destroy()
 * - Transform handling → updateTransform()
 */

// Interface for tile data specific to Model3DTileContent
export interface ModelTile3DData {
    uri?: string;
    content?: any;
    transform?: any;
    boundingVolume?: any;
    geometricError?: number;
    arrayBuffer: ArrayBuffer;
}

export class BabylonModel3DTileContent extends Babylon3DTileContentBase {
    
    private static _tileCount: number = 0;
    private static _completedCount: number = 0;
    private static _visibleCount: number = 0;
    private static _showSetterCount: number = 0;
    private static _meshVisibilityLogCount: number = 0;
    
    /**
     * CESIUM FACTORY METHOD: Create content from glTF data
     * Reference: Model3DTileContent.fromGltf() 
     */
    static async fromGltf(
        babylonScene: BabylonScene, 
        tileset: any, 
        tile: any, 
        resource: any, 
        arrayBuffer: ArrayBuffer
    ): Promise<BabylonModel3DTileContent> {
        const content = new BabylonModel3DTileContent(
            babylonScene,
            tileset,
            tile,
            arrayBuffer,
            resource?.getUrlComponent?.(true) || resource
        );
        
        // Content initialization happens in constructor
        // This matches Cesium's async factory pattern
        return content;
    }
    
    /**
     * CESIUM FACTORY METHOD: Create content from B3DM data  
     * Reference: Model3DTileContent.fromB3dm()
     */
    static async fromB3dm(
        babylonScene: BabylonScene,
        tileset: any, 
        tile: any, 
        resource: any, 
        arrayBuffer: ArrayBuffer, 
        byteOffset?: number
    ): Promise<BabylonModel3DTileContent> {
        // B3DM handling is done in constructor via preprocessing
        const content = new BabylonModel3DTileContent(
            babylonScene,
            tileset,
            tile,
            arrayBuffer,
            resource?.getUrlComponent?.(true) || resource
        );
        
        return content;
    }
    private _babylonScene: BabylonScene;
    private _meshes: AbstractMesh[] = [];
    private _transformNode: TransformNode | undefined;
    private _container: AssetContainer | undefined;
    private _arrayBuffer: ArrayBuffer;
    private _visible: boolean = false; // CESIUM EXACT: Start invisible, only show when selected
    protected _url: string | undefined;

    constructor(
        babylonScene: BabylonScene,
        tileset: any,
        tile: any,
        arrayBuffer: ArrayBuffer,
        url?: string
    ) {
        super(tileset, tile, url);
        this._babylonScene = babylonScene;
        this._arrayBuffer = arrayBuffer;
        this._url = url;

        // Minimal logging - just track tile creation
        if (!BabylonModel3DTileContent._tileCount) BabylonModel3DTileContent._tileCount = 0;
        BabylonModel3DTileContent._tileCount++;
        if (BabylonModel3DTileContent._tileCount <= 3) {
            console.log(`🏗️ TILE ${BabylonModel3DTileContent._tileCount}: Starting async load (${this._arrayBuffer.byteLength} bytes)`);
        }
        
        // Start async initialization like Cesium's fromGltf
        this.initializeFromArrayBuffer();
    }

    /**
     * CESIUM COMPATIBILITY: ready getter to match Cesium's content.ready pattern
     */
    get ready(): boolean {
        return this._ready;
    }

    // Removed custom B3DM extraction - now using extracted B3dmParser

    /**
     * Initialize model content from ArrayBuffer - simplified approach
     */
    private async initializeFromArrayBuffer(): Promise<void> {
        try {
            // console.log(`📋 ASYNC INIT START: tile=${this._tile.id || 'unknown'}, ready=${this._ready}`);
            
            // Loading tile content directly
            await this.initializeDirectGLB();
            
            // console.log(`📋 ASYNC INIT COMPLETE: tile=${this._tile.id || 'unknown'}, ready=${this._ready}`);
        } catch (error) {
            console.error('Failed to initialize model content:', error);
            this._ready = true;
            console.log(`💥 ASYNC INIT ERROR: tile=${this._tile.id || 'unknown'}, ready=${this._ready}`);
        }
    }

    /**
     * Fallback method for direct GLB loading using extracted B3dmParser
     */
    private async initializeDirectGLB(): Promise<void> {
        // console.log(`🔍 DIRECT GLB START: tile=${this._tile.id || 'unknown'}, buffer size=${this._arrayBuffer.byteLength} bytes`);
        // First, let's inspect the raw data from Cesium Ion
        const dataView = new DataView(this._arrayBuffer);
        
        // Check magic bytes
        const magic = new Uint8Array(this._arrayBuffer, 0, 4);
        const magicString = String.fromCharCode(magic[0], magic[1], magic[2], magic[3]);
        // Raw Data Analysis: Check magic bytes only
        // console.log(`🔍 Raw Data Analysis:`);
        // console.log(`  Magic bytes: [${magic[0]}, ${magic[1]}, ${magic[2]}, ${magic[3]}] = "${magicString}"`);
        // console.log(`  File size: ${this._arrayBuffer.byteLength} bytes`);
        
        if (magicString === 'b3dm') {
            console.log(`📦 B3DM FORMAT DETECTED: tile=${this._tile.id || 'unknown'}`);
            const version = dataView.getUint32(4, true);
            const byteLength = dataView.getUint32(8, true);
            console.log(`  B3DM Version: ${version}`);
            console.log(`  B3DM Byte Length: ${byteLength}`);
            
            // Show all header fields
            for (let i = 0; i < 28; i += 4) {
                const value = dataView.getUint32(i, true);
                const hex = '0x' + value.toString(16).padStart(8, '0');
                console.log(`  Offset ${i.toString().padStart(2)}: ${value.toString().padStart(10)} (${hex})`);
            }
        } else if (magicString === 'glTF') {
            // console.log(`📦 GLB FORMAT DETECTED: tile=${this._tile.id || 'unknown'}`);
            
            // Use our derived GltfLoader that processes like Cesium but outputs for Babylon
            await this.loadWithDerivedGltfLoader();
            return;
        } else {
            console.log(`❌ Unknown file format! Magic is "${magicString}"`);
            throw new Error(`Unsupported file format: ${magicString}`);
        }
        
        // B3DM parsing code (if we ever get actual B3DM files)
        console.log(`🔄 PARSING B3DM: tile=${this._tile.id || 'unknown'}`);
        const parsed = B3dmParserV2.parse(this._arrayBuffer);
        if (!parsed || !parsed.gltf) {
            throw new Error('Failed to parse B3DM format using Cesium parser');
        }

        console.log(`✅ B3dmParser: Extracted ${parsed.gltf.byteLength} bytes of glTF, batch length: ${parsed.batchLength}`);

        // Use File object approach with parsed glTF data
        const file = new File([parsed.gltf], 'model.glb', { type: 'model/gltf-binary' });
        
        // BABYLON DEVIATION: Use Babylon.js SceneLoader instead of Cesium's WebGL loading
        // Reference: Cesium loads glTF via loadGltfUri() in Model3DTileContent.js
        // We use Babylon's SceneLoader for Babylon.js mesh/material creation
        this._container = await SceneLoader.LoadAssetContainerAsync("", file, this._babylonScene);
        
        // Container is automatically added to scene by Babylon - that's fine!
        this._meshes = this._container.meshes.slice();

        // Create transform node for the model
        this._transformNode = new TransformNode(`model_${this._tile.id || 'unknown'}`, this._babylonScene);

        // Parent all meshes to transform node
        for (const mesh of this._meshes) {
            if (mesh) {
                mesh.parent = this._transformNode;
                // Initially disable mesh - will be enabled when tile is selected
                mesh.setEnabled(false);
            }
        }

        // Apply initial transform
        this.updateTransform();

        this._ready = true;
        console.log(`✅ Model content loaded via fallback: ${this._meshes.length} meshes, _ready=${this._ready}`);
        
        // CRITICAL: Update visibility now that content is ready
        this.updateVisibility();
    }

    /**
     * Load GLB using our derived GltfLoader (Cesium-style processing for Babylon)
     */
    private async loadWithDerivedGltfLoader(): Promise<void> {
        // console.log(`🔧 DERIVED GLTF LOADER START: tile=${this._tile.id || 'unknown'}`); 
        
        // Create our derived loader that uses Cesium's parsing logic
        const derivedLoader = new BabylonGltfLoader({
            arrayBuffer: this._arrayBuffer,
            url: this._url || `tile_${this._tile.id || 'unknown'}.glb`
        });

        try {
            // console.log(`⚙️ CALLING derivedLoader.load(): tile=${this._tile.id || 'unknown'}`);
            
            // Process GLB with Cesium-style texture management
            await derivedLoader.load();
            
            // console.log(`✅ derivedLoader.load() COMPLETED: tile=${this._tile.id || 'unknown'}`);
            
            // Derived loader processed textures with unique IDs
            
            // Get the processed GLB data
            const processedGLB = derivedLoader.createProcessedGLB();
            
            // Load with Babylon using the processed data
            const uniqueFileName = `processed_tile_${this._tile.id || Date.now()}.glb`;
            const file = new File([processedGLB], uniqueFileName, { type: 'model/gltf-binary' });
            
            this._container = await SceneLoader.LoadAssetContainerAsync("", file, this._babylonScene);
            
            // CRITICAL: Actually add container to scene!
            this._container.addAllToScene();
            
            this._meshes = this._container.meshes.slice();

            this._transformNode = new TransformNode(`model_${this._tile.id || 'unknown'}`, this._babylonScene);

            for (const mesh of this._meshes) {
                if (mesh) {
                    mesh.parent = this._transformNode;
                    // CESIUM EXACT: Start invisible, only show when tile gets update() called
                    mesh.setEnabled(true);  // Keep enabled for performance
                    mesh.isVisible = false; // Hide until selected by BaseTraversal
                }
            }

            this.updateTransform();
            
            // CRITICAL: Mark as ready BEFORE calling updateVisibility to prevent deadlock
            this._ready = true;
            
            BabylonModel3DTileContent._completedCount++;
            console.log(`✅ TILE READY: ${BabylonModel3DTileContent._completedCount}/${BabylonModel3DTileContent._tileCount} complete, ${this._meshes.length} meshes`);
            
            // CRITICAL: Update visibility now that content is truly ready
            this.updateVisibility();
            
            
            // Clean up derived loader
            derivedLoader.destroy();
            
        } catch (error) {
            console.error('Derived GltfLoader failed:', error);
            
            // Fallback to direct loading
            console.log('🔄 Falling back to direct Babylon loading...');
            
            const uniqueFileName = `fallback_tile_${this._tile.id || Date.now()}_${Math.random()}.glb`;
            const file = new File([this._arrayBuffer], uniqueFileName, { type: 'model/gltf-binary' });
            
            this._container = await SceneLoader.LoadAssetContainerAsync("", file, this._babylonScene);
            
            // CRITICAL: Actually add container to scene!
            this._container.addAllToScene();
            
            this._meshes = this._container.meshes.slice();

            this._transformNode = new TransformNode(`model_${this._tile.id || 'unknown'}`, this._babylonScene);

            for (const mesh of this._meshes) {
                if (mesh) {
                    mesh.parent = this._transformNode;
                    // CESIUM EXACT: Start invisible, only show when tile gets update() called
                    mesh.setEnabled(true);  // Keep enabled for performance
                    mesh.isVisible = false; // Hide until selected by BaseTraversal
                }
            }

            this.updateTransform();
            
            // CRITICAL: Mark as ready BEFORE calling updateVisibility to prevent deadlock
            this._ready = true;
            
            BabylonModel3DTileContent._completedCount++;
            console.log(`✅ TILE READY: ${BabylonModel3DTileContent._completedCount}/${BabylonModel3DTileContent._tileCount} complete, ${this._meshes.length} meshes`);
            
            // CRITICAL: Update visibility now that content is truly ready
            this.updateVisibility();
            
            
            // Clean up derived loader
            derivedLoader.destroy();
        }
    }



    /**
     * Update method - derived from Model3DTileContent.update()
     */
    update(tileset: any, frameState: any): void {
        // RACE CONDITION GUARD: Skip updates if destroyed or no meshes yet
        if (this.isDestroyed() || !this._meshes || this._meshes.length === 0) {
            return;
        }

        // CESIUM EXACT: Synchronize properties like Cesium does (lines 256-275)
        this.updateModelProperties(tileset, frameState);

        // Update transform if needed (matches Cesium's update pattern)
        this.updateTransform();

        // CESIUM EXACT: Don't unconditionally set show=true here
        // Visibility is controlled by BabylonTileContent.update() based on tileset._selectedTiles
        // which respects Cesium's horizon culling and tile selection logic
    }
    
    /**
     * CESIUM EXACT: Update model properties - derived from Model3DTileContent.update() lines 256-275
     */
    private updateModelProperties(tileset: any, frameState: any): void {
        const tile = this._tile;
        
        // CESIUM EXACT: Property synchronization like Cesium does
        // Note: Some properties don't apply to Babylon.js but we track them for consistency
        
        // Transform is handled in updateTransform()
        // model.modelMatrix = tile.computedTransform; (done in updateTransform)
        
        // Lighting and rendering properties (adapt for Babylon.js materials)
        // model.colorBlendAmount = tileset.colorBlendAmount;
        // model.colorBlendMode = tileset.colorBlendMode; 
        // model.lightColor = tileset.lightColor;
        // model.imageBasedLighting = tileset.imageBasedLighting;
        
        // Culling properties
        // model.backFaceCulling = tileset.backFaceCulling;
        
        // Debug properties
        // model.debugWireframe = tileset.debugWireframe;
        // model.showOutline = tileset.showOutline;
        // model.outlineColor = tileset.outlineColor;
        
        // Feature properties
        // model.featureIdLabel = tileset.featureIdLabel;
        // model.instanceFeatureIdLabel = tileset.instanceFeatureIdLabel;
        
        // Shadow properties  
        // model.shadows = tileset.shadows;
        
        // Custom shader support
        // model.customShader = tileset.customShader;
        
        // Credits and splitting
        // model.showCreditsOnScreen = tileset.showCreditsOnScreen;
        // model.splitDirection = tileset.splitDirection;
        
        // Clipping planes - more complex property that needs ownership checks
        this.updateClippingPlanes(tileset, tile);
    }
    
    /**
     * CESIUM EXACT: Update clipping planes - derived from Model3DTileContent.update() lines 278-302
     */
    private updateClippingPlanes(tileset: any, tile: any): void {
        // CESIUM EXACT: Clipping planes require ownership checks like Cesium does
        const tilesetClippingPlanes = tileset.clippingPlanes;
        
        // Reference matrix for clipping planes
        // this.referenceMatrix = tileset.clippingPlanesOriginMatrix;
        
        if (defined(tilesetClippingPlanes) && tile.clippingPlanesDirty) {
            // Dereference the clipping planes if they are irrelevant
            // this._clippingPlanes = 
            //     tilesetClippingPlanes.enabled && tile._isClipped
            //         ? tilesetClippingPlanes
            //         : undefined;
        }
        
        // Environment map manager
        const tilesetEnvironmentMapManager = tileset.environmentMapManager;
        // if (this.environmentMapManager !== tilesetEnvironmentMapManager) {
        //     this._environmentMapManager = tilesetEnvironmentMapManager;
        // }
    }
    
    /**
     * Show property - matches Cesium Model.show exactly
     */
    set show(show: boolean) {
        if (this._visible !== show) {
            this._visible = show;
            if (BabylonModel3DTileContent._showSetterCount === undefined) BabylonModel3DTileContent._showSetterCount = 0;
            BabylonModel3DTileContent._showSetterCount++;
            if (BabylonModel3DTileContent._showSetterCount <= 5) {
                console.log(`🎬 SHOW SETTER: ${BabylonModel3DTileContent._showSetterCount} - show=${show}, ready=${this._ready}`);
            }
            
            // RACE CONDITION GUARD: Update visibility if ready OR if meshes are loaded
            if (this._ready || (this._meshes && this._meshes.length > 0)) {
                this.updateVisibility();
            }
            // If not ready, the visibility will be applied when meshes finish loading
        }
    }
    
    get show(): boolean {
        return this._visible;
    }

    /**
     * Update transform - derived from Model3DTileContent transform handling
     */
    private updateTransform(): void {
        if (!this._transformNode || !this._tile.computedTransform) {
            return;
        }

        const cesiumMatrix = this._tile.computedTransform;
        const babylonMatrix = this.cesiumToBabylonTransform(cesiumMatrix);
        
        if (babylonMatrix) {
            this._transformNode.setPreTransformMatrix(babylonMatrix);
        }
    }

    /**
     * Convert Cesium transform to Babylon transform - derived from Cesium Matrix4 handling
     */
    private cesiumToBabylonTransform(cesiumTransform: any): Matrix | undefined {
        let cesiumArray: number[];

        try {
            if (typeof cesiumTransform.toArray === 'function') {
                cesiumArray = cesiumTransform.toArray();
            } else if (Array.isArray(cesiumTransform)) {
                cesiumArray = cesiumTransform;
            } else if (cesiumTransform.length === 16) {
                cesiumArray = Array.from(cesiumTransform);
            } else {
                console.warn('Cannot convert cesium matrix - invalid format');
                return undefined;
            }

            if (cesiumArray.length !== 16) {
                console.warn(`Invalid cesium array length: ${cesiumArray.length}`);
                return undefined;
            }

            // BABYLON DEVIATION: Convert coordinate systems from Cesium to Babylon
            // Reference: Cesium Matrix4 uses Z-up, column-major order
            // Deviation: Transform to Babylon Y-up, row-major using (x,y,z) → (x,z,y) mapping
            return Matrix.FromArray([
                cesiumArray[0],  cesiumArray[8],  -cesiumArray[4], cesiumArray[12],  // X row
                cesiumArray[2],  cesiumArray[10], -cesiumArray[6], cesiumArray[14],  // Y row (Z component)
                cesiumArray[1],  cesiumArray[9],  -cesiumArray[5], cesiumArray[13],  // Z row (Y component)  
                cesiumArray[3],  cesiumArray[11], -cesiumArray[7], cesiumArray[15]   // W row
            ]);

        } catch (error) {
            console.error('Error converting transform:', error);
            return undefined;
        }
    }

    /**
     * Update visibility based on tile state - add/remove from scene
     */
    private updateVisibility(): void {
        // CESIUM EXACT: Only show if tile is currently selected AND ready
        // Don't just trust _visible - check the actual show property which reflects current selection
        const shouldBeVisible = this.show && this._ready;
        
        // Mesh visibility debugging disabled
        
        if (shouldBeVisible) {
            // Show tile meshes using isVisible
            if (this._transformNode) {
                this._transformNode.isVisible = true;
            }
            let visibleMeshCount = 0;
            for (const mesh of this._meshes) {
                if (mesh) {
                    mesh.isVisible = true;
                    visibleMeshCount++;
                }
            }
            BabylonModel3DTileContent._visibleCount++;
            // Mesh visibility working - logging disabled
            
        } else {
            // Hide tile meshes when deselected
            if (this._transformNode) {
                this._transformNode.isVisible = false;
            }
            for (const mesh of this._meshes) {
                if (mesh) {
                    mesh.isVisible = false;
                }
            }
        }
    }

    /**
     * Visibility control
     */
    set visible(visible: boolean) {
        this._visible = visible;
        this.updateVisibility();
    }

    get visible(): boolean {
        return this._visible;
    }

    /**
     * Get meshes for inspection
     */
    get meshes(): AbstractMesh[] {
        return this._meshes.slice(); // Return copy
    }

    /**
     * Destroy - derived from Model3DTileContent.destroy()
     */
    destroy(): void {
        if (this.isDestroyed()) {
            return;
        }

        // Dispose all meshes
        for (const mesh of this._meshes) {
            if (mesh) {
                mesh.dispose();
            }
        }

        // Dispose transform node
        if (this._transformNode) {
            this._transformNode.dispose();
        }

        // Dispose container
        if (this._container) {
            this._container.dispose();
        }

        // Clear references
        this._meshes = [];
        this._transformNode = undefined;
        this._container = undefined;

        this.markDestroyed();
    }

    // CESIUM EXACT: Statistics properties matching Model3DTileContent lines 36-82
    get featuresLength(): number {
        // Feature tables not implemented yet - return 0 for consistency
        return 0;
    }
    
    get pointsLength(): number {
        // Point cloud support not implemented - return 0 for consistency
        return 0;
    }
    
    get trianglesLength(): number {
        return this._meshes.reduce((total, mesh) => {
            if (mesh && mesh.getTotalVertices) {
                return total + Math.floor(mesh.getTotalVertices() / 3);
            }
            return total;
        }, 0);
    }
    
    get geometryByteLength(): number {
        return this._arrayBuffer.byteLength;
    }
    
    get texturesByteLength(): number {
        // Texture byte tracking not implemented - return 0 for consistency  
        return 0;
    }
    
    get batchTableByteLength(): number {
        // Batch table support not implemented - return 0 for consistency
        return 0;
    }
    
    get innerContents(): any {
        // Composite tile support not implemented - return undefined like Cesium
        return undefined;
    }
    
    // CESIUM EXACT: Feature and property methods - lines 196-240
    getFeature(featureId: number): any {
        // Feature support not implemented yet - return undefined for consistency
        return undefined;
    }
    
    hasProperty(featureId: number, name: string): boolean {
        // Property support not implemented yet - return false for consistency
        return false;
    }
    
    // CESIUM EXACT: Debug and style methods - lines 242-254  
    applyDebugSettings(enabled: boolean, color?: any): void {
        // Debug visualization for Babylon.js meshes
        // Could apply wireframe mode or debug materials to this._meshes
        // Not implementing for now but method exists for API consistency
    }
    
    applyStyle(style: any): void {
        // Style application for Babylon.js materials
        // Could modify materials on this._meshes based on style
        // Not implementing for now but method exists for API consistency
    }
    
    // CESIUM EXACT: Texture methods - lines 161-175
    getTextureIds(): string[] {
        // Texture ID tracking not implemented - return empty array for consistency
        return [];
    }
    
    getTextureByteLengthById(textureId: string): number | undefined {
        // Texture byte tracking not implemented - return undefined for consistency
        return undefined;
    }
    
    // CESIUM EXACT: Extension method - lines 190-194
    getExtension(extensionName: string): any {
        // glTF extension support not implemented - return undefined for consistency
        return undefined;
    }
    
    // CESIUM EXACT: Pick method for ray intersection - lines 497-514
    pick(ray: any, frameState: any, result?: any): any {
        if (!this._ready || !this._meshes.length) {
            return undefined;
        }
        
        // TODO: Implement ray intersection with Babylon.js meshes
        // Would need to:
        // 1. Convert Cesium ray to Babylon coordinate system
        // 2. Use Babylon's ray picking against this._meshes  
        // 3. Convert intersection point back to Cesium coordinates
        // 4. Handle vertical exaggeration like Cesium does
        
        // Placeholder return for now
        return undefined;
    }
}