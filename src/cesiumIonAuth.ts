import { Ion, IonResource } from 'cesium';

/**
 * Cesium Ion authentication and asset access management
 */
export class CesiumIonAuth {
    private accessToken: string;
    private isAuthenticated: boolean = false;
    
    constructor(accessToken?: string) {
        // Use provided token or your real token
        this.accessToken = accessToken || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2ZWE4YWJjYy0wZTg4LTRhMjQtYjVmNy05M2E5NmZlMjczODAiLCJpZCI6MjIwODczLCJpYXQiOjE3MjIwNTEyNDJ9.hlVfaVjkU1E2K507a65UFUrC7Bh8clQJ2B7DrVfSAcw';
        this.setupIon();
    }
    
    /**
     * Initialize Cesium Ion with access token
     */
    private setupIon(): void {
        try {
            Ion.defaultAccessToken = this.accessToken;
            this.isAuthenticated = true;
            // console.log('Cesium Ion authentication configured');
        } catch (error) {
            console.error('Failed to setup Cesium Ion:', error);
            this.isAuthenticated = false;
        }
    }
    
    /**
     * Update the access token
     */
    setAccessToken(token: string): void {
        this.accessToken = token;
        this.setupIon();
    }
    
    /**
     * Get a Cesium Ion resource for a specific asset
     */
    async getIonResource(assetId: number): Promise<IonResource> {
        if (!this.isAuthenticated) {
            throw new Error('Cesium Ion not authenticated');
        }
        
        try {
            const resource = await IonResource.fromAssetId(assetId);
            // console.log(`Successfully accessed Ion asset ${assetId}`);
            return resource;
        } catch (error) {
            console.error(`Failed to access Ion asset ${assetId}:`, error);
            throw error;
        }
    }
    
    /**
     * Get Google Photorealistic 3D Tiles resource
     */
    async getGooglePhotorealistic3DTiles(): Promise<IonResource> {
        // Google's Photorealistic 3D Tiles asset ID in Cesium Ion
        const GOOGLE_3D_TILES_ASSET_ID = 2275207;
        return await this.getIonResource(GOOGLE_3D_TILES_ASSET_ID);
    }
    
    /**
     * Get OSM Buildings 3D Tiles resource
     */
    async getOSMBuildings3DTiles(): Promise<IonResource> {
        // OSM Buildings 3D Tiles asset ID in Cesium Ion
        const OSM_BUILDINGS_ASSET_ID = 96188;
        return await this.getIonResource(OSM_BUILDINGS_ASSET_ID);
    }
    
    /**
     * Get Cesium World Terrain resource
     */
    async getCesiumWorldTerrain(): Promise<IonResource> {
        // Cesium World Terrain asset ID
        const WORLD_TERRAIN_ASSET_ID = 1;
        return await this.getIonResource(WORLD_TERRAIN_ASSET_ID);
    }
    
    /**
     * Create a Cesium Ion resource from a custom asset ID
     */
    async getCustomAsset(assetId: number, description?: string): Promise<IonResource> {
        console.log(`Accessing custom Ion asset: ${assetId}${description ? ` (${description})` : ''}`);
        return await this.getIonResource(assetId);
    }
    
    /**
     * Check if Ion is properly authenticated
     */
    isReady(): boolean {
        return this.isAuthenticated;
    }
    
    /**
     * Get the current access token (for debugging)
     */
    getAccessToken(): string {
        return this.accessToken.substring(0, 10) + '...'; // Only show first 10 chars for security
    }
    
    /**
     * Test authentication by accessing a known public asset
     */
    async testAuthentication(): Promise<boolean> {
        try {
            // Test with Cesium World Terrain (public asset)
            const resource = await this.getIonResource(1);
            // console.log('Ion authentication test successful');
            return true;
        } catch (error) {
            console.error('Ion authentication test failed:', error);
            return false;
        }
    }
}

/**
 * Default instance with environment variable or your token
 */
export const defaultIonAuth = new CesiumIonAuth(
    import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2ZWE4YWJjYy0wZTg4LTRhMjQtYjVmNy05M2E5NmZlMjczODAiLCJpZCI6MjIwODczLCJpYXQiOjE3MjIwNTEyNDJ9.hlVfaVjkU1E2K507a65UFUrC7Bh8clQJ2B7DrVfSAcw'
);