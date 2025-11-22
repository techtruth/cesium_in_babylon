// Base interface - no Babylon.js imports needed here

/**
 * CESIUM REFERENCE: @cesium/engine/Source/Scene/Cesium3DTileContent.js
 * 
 * Babylon3DTileContent - Base interface derived from Cesium3DTileContent.js
 * 
 * This provides the base interface and lifecycle management patterns
 * that all Babylon.js tile content implementations must follow.
 * Matches Cesium's content interface exactly for seamless integration.
 */

// Type definitions matching Cesium's content interface
export interface Babylon3DTileContentInterface {
    readonly ready: boolean;
    readonly tileset: any;
    readonly tile: any;
    readonly url: string | undefined;
    readonly batchTable: any;
    readonly featuresLength: number;
    readonly pointsLength: number;
    readonly trianglesLength: number;
    readonly geometryByteLength: number;
    readonly texturesByteLength: number;
    readonly batchTableByteLength: number;

    // Core lifecycle methods matching Cesium interface
    update(tileset: any, frameState: any): void;
    isDestroyed(): boolean;
    destroy(): void;
    
    // Feature access methods
    hasProperty(batchId: number, name: string): boolean;
    getFeature(batchId: number): any | undefined;
}

/**
 * Abstract base class for Babylon.js tile content implementations
 * Provides common functionality derived from Cesium3DTileContent patterns
 */
export abstract class Babylon3DTileContentBase implements Babylon3DTileContentInterface {
    protected _ready: boolean = false;
    protected _tileset: any;
    protected _tile: any;
    protected _url: string | undefined;
    protected _destroyed: boolean = false;

    constructor(tileset: any, tile: any, url?: string) {
        this._tileset = tileset;
        this._tile = tile;
        this._url = url;
    }

    // Properties matching Cesium interface
    get ready(): boolean { return this._ready; }
    get tileset(): any { return this._tileset; }
    get tile(): any { return this._tile; }
    get url(): string | undefined { return this._url; }
    get batchTable(): any { return undefined; }
    get featuresLength(): number { return 0; }
    get pointsLength(): number { return 0; }
    get trianglesLength(): number { return 0; }
    get geometryByteLength(): number { return 0; }
    get texturesByteLength(): number { return 0; }
    get batchTableByteLength(): number { return 0; }

    // Abstract methods that derived classes must implement
    abstract update(tileset: any, frameState: any): void;
    abstract destroy(): void;

    // Common implementations
    isDestroyed(): boolean {
        return this._destroyed;
    }

    hasProperty(batchId: number, name: string): boolean {
        return false; // Default implementation
    }

    getFeature(batchId: number): any | undefined {
        return undefined; // Default implementation
    }

    protected markDestroyed(): void {
        this._destroyed = true;
        this._ready = false;
    }
}