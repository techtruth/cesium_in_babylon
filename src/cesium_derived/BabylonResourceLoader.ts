/**
 * CESIUM REFERENCE: @cesium/engine/Source/Scene/ResourceLoader.js
 * 
 * BabylonResourceLoader - Derived from Cesium's ResourceLoader.js
 * 
 * Handles async resource loading patterns for 3D tile content.
 * Follows Cesium's ResourceLoader state management and loading lifecycle.
 * 
 * KEY CESIUM PATTERNS ADAPTED:
 * - Async loading state machine
 * - Progress tracking
 * - Error handling and retry logic
 * - Resource caching patterns
 */

export const BabylonResourceState = {
    UNLOADED: 0,
    LOADING: 1, 
    READY: 2,
    FAILED: 3
} as const;

export type BabylonResourceState = typeof BabylonResourceState[keyof typeof BabylonResourceState];

export interface ResourceLoadingOptions {
    url: string;
    responseType?: 'arrayBuffer' | 'json' | 'text';
    timeout?: number;
    retries?: number;
}

export interface ResourceLoadingResult {
    data: ArrayBuffer | object | string;
    url: string;
    byteLength: number;
}

/**
 * Resource loader with Cesium-compatible async patterns
 */
export class BabylonResourceLoader {
    private _state: BabylonResourceState = BabylonResourceState.UNLOADED;
    private _url: string;
    private _options: ResourceLoadingOptions;
    private _data: ArrayBuffer | object | string | undefined;
    private _error: Error | undefined;
    private _loadPromise: Promise<ResourceLoadingResult> | undefined;

    constructor(options: ResourceLoadingOptions) {
        this._url = options.url;
        this._options = {
            responseType: 'arrayBuffer',
            timeout: 30000,
            retries: 3,
            ...options
        };
    }

    /**
     * Get current loading state
     */
    get state(): BabylonResourceState {
        return this._state;
    }

    /**
     * Check if resource is ready
     */
    get ready(): boolean {
        return this._state === BabylonResourceState.READY;
    }

    /**
     * Check if resource failed to load
     */
    get failed(): boolean {
        return this._state === BabylonResourceState.FAILED;
    }

    /**
     * Get the loaded data
     */
    get data(): ArrayBuffer | object | string | undefined {
        return this._data;
    }

    /**
     * Get loading error if any
     */
    get error(): Error | undefined {
        return this._error;
    }

    /**
     * Load resource - derived from ResourceLoader.load() patterns
     */
    load(): Promise<ResourceLoadingResult> {
        if (this._loadPromise) {
            return this._loadPromise;
        }

        this._state = BabylonResourceState.LOADING;
        this._loadPromise = this.performLoad();

        return this._loadPromise;
    }

    /**
     * Perform the actual loading with retry logic - derived from Cesium patterns
     */
    private async performLoad(): Promise<ResourceLoadingResult> {
        let lastError: Error | undefined;
        const maxRetries = this._options.retries || 3;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.attemptLoad();
                
                this._data = result.data;
                this._state = BabylonResourceState.READY;
                this._error = undefined;
                
                return result;

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                
                if (attempt < maxRetries) {
                    // Wait before retry (exponential backoff)
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    console.warn(`Resource load attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
                } else {
                    console.error(`Resource load failed after ${maxRetries + 1} attempts:`, error);
                }
            }
        }

        this._state = BabylonResourceState.FAILED;
        this._error = lastError;
        throw lastError || new Error('Resource loading failed');
    }

    /**
     * Single load attempt - derived from Cesium's fetch patterns
     * BABYLON DEVIATION: Uses browser fetch() API instead of Cesium's Resource.fetch()
     * Reference: Cesium uses Resource.fetchArrayBuffer() with request scheduling
     */
    private async attemptLoad(): Promise<ResourceLoadingResult> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this._options.timeout || 30000);

        try {
            const response = await fetch(this._url, {
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            let data: ArrayBuffer | object | string;
            let byteLength: number;

            switch (this._options.responseType) {
                case 'arrayBuffer':
                    data = await response.arrayBuffer();
                    byteLength = (data as ArrayBuffer).byteLength;
                    break;

                case 'json':
                    const text = await response.text();
                    data = JSON.parse(text);
                    byteLength = text.length;
                    break;

                case 'text':
                    data = await response.text();
                    byteLength = data.length;
                    break;

                default:
                    throw new Error(`Unsupported response type: ${this._options.responseType}`);
            }

            return {
                data,
                url: this._url,
                byteLength
            };

        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    /**
     * Unload resource and reset state
     */
    unload(): void {
        this._state = BabylonResourceState.UNLOADED;
        this._data = undefined;
        this._error = undefined;
        this._loadPromise = undefined;
    }

    /**
     * Static helper to load a resource directly - matches Cesium's static load methods
     */
    static async loadArrayBuffer(url: string, options?: Partial<ResourceLoadingOptions>): Promise<ArrayBuffer> {
        const loader = new BabylonResourceLoader({
            url,
            responseType: 'arrayBuffer',
            ...options
        });

        const result = await loader.load();
        return result.data as ArrayBuffer;
    }

    /**
     * Static helper to load JSON data
     */
    static async loadJson(url: string, options?: Partial<ResourceLoadingOptions>): Promise<object> {
        const loader = new BabylonResourceLoader({
            url,
            responseType: 'json',
            ...options
        });

        const result = await loader.load();
        return result.data as object;
    }

    /**
     * Extract glTF URL from JSON metadata - derived from Cesium's content URL resolution
     */
    static async extractGltfUrlFromJson(jsonUrl: string): Promise<string | undefined> {
        try {
            const metadata = await this.loadJson(jsonUrl);

            // Look for glTF content in metadata (Cesium 3D Tiles patterns)
            if ((metadata as any).content && (metadata as any).content.uri) {
                const baseUrl = jsonUrl.substring(0, jsonUrl.lastIndexOf('/') + 1);
                return new URL((metadata as any).content.uri, baseUrl).href;
            }

            if ((metadata as any).uri) {
                const baseUrl = jsonUrl.substring(0, jsonUrl.lastIndexOf('/') + 1);
                return new URL((metadata as any).uri, baseUrl).href;
            }

            return undefined;

        } catch (error) {
            console.error('Failed to extract glTF URL from JSON:', error);
            return undefined;
        }
    }
}