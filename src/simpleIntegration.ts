import { Camera, Engine, Vector3 } from '@babylonjs/core';
import * as Cesium from 'cesium';
import CesiumTilesetDerived from './cesium_derived/CesiumTilesetDerived.js';

/**
 * Simple Cesium + Babylon integration - trust Cesium completely
 */
export class SimpleIntegration {
    private camera: Camera;
    private engine: Engine;
    private cesiumTileset?: CesiumTilesetDerived;

    constructor(scene: any, camera: Camera, engine: Engine) {
        this.camera = camera;
        this.engine = engine;
    }

    /**
     * Load Google Photorealistic 3D Tiles using Cesium's standard approach
     */
    async loadGooglePhotorealistic3DTiles(assetId: number): Promise<void> {
        try {
            // Use Cesium's standard approach exactly - but with our derived tileset
            const resource = await Cesium.IonResource.fromAssetId(assetId);
            this.cesiumTileset = await CesiumTilesetDerived.fromUrl(resource) as CesiumTilesetDerived;
            
            console.log('Google Photorealistic 3D Tiles created, waiting for ready...');
            
            // Wait for the tileset to be fully ready (like Cesium Scene does)
            await this.cesiumTileset.readyPromise;
            
            console.log('Google Photorealistic 3D Tiles ready!');
            
        } catch (error) {
            console.error('Failed to load Google Photorealistic 3D Tiles:', error);
            throw error;
        }
    }

    /**
     * Update tileset - let Cesium handle everything
     */
    update(): void {
        if (!this.cesiumTileset) {
            console.log('⏳ No tileset yet...');
            return;
        }
        
        // Work with Cesium as it is - if root and asset exist, proceed
        if (!this.cesiumTileset.root || !this.cesiumTileset.asset) {
            console.log('⏳ Tileset loading...');
            return;
        }

        // Create frameState exactly like Cesium Scene does
        const camera = this.createCesiumCamera();
        const frameState = {
            camera: camera,
            cullingVolume: camera.frustum.computeCullingVolume(camera.position, camera.direction, camera.up),
            context: {
                drawingBufferWidth: this.engine.getRenderWidth(),
                drawingBufferHeight: this.engine.getRenderHeight()
            },
            mode: Cesium.SceneMode.SCENE3D,
            mapProjection: new Cesium.GeographicProjection(),
            commandList: [],
            frameNumber: Date.now(),
            time: new Cesium.JulianDate()
        };

        try {
            this.cesiumTileset.update(frameState);
            
            // Log selected tiles count more frequently during debugging
            console.log(`🎯 Tiles: ${this.cesiumTileset.selectedTiles?.length || 0} selected, ready: ${this.cesiumTileset.ready}`);
            
        } catch (error) {
            console.error('Error updating tileset:', error);
        }
    }

    /**
     * Create basic Cesium camera from Babylon camera
     */
    private createCesiumCamera(): any {
        const babylonPos = this.camera.position;
        const babylonDir = this.camera.getDirection(Vector3.Forward());
        const babylonUp = this.camera.upVector;

        // Transform to Cesium coordinates (Y-up to Z-up)
        const position = new Cesium.Cartesian3(babylonPos.x, babylonPos.z, babylonPos.y);
        const direction = new Cesium.Cartesian3(babylonDir.x, babylonDir.z, babylonDir.y);
        const up = new Cesium.Cartesian3(babylonUp.x, babylonUp.z, babylonUp.y);

        return {
            position,
            direction,
            up,
            frustum: new Cesium.PerspectiveFrustum({
                fov: this.camera.fov,
                aspectRatio: this.engine.getRenderWidth() / this.engine.getRenderHeight(),
                near: this.camera.minZ,
                far: this.camera.maxZ
            })
        };
    }

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
            ready: this.cesiumTileset.ready
        };
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