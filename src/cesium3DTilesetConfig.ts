// Cesium 3D Tileset Configuration
// Based on Cesium's internal settings for Google 3D Tiles and other major providers

/**
 * Google Photorealistic 3D Tiles Configuration
 * Based on Cesium's official Google 3D Tiles integration
 */
export const GOOGLE_3D_TILES_CONFIG = {
    // CESIUM NATIVE GOOGLE 3D TILES CONFIG: Match createGooglePhotorealistic3DTileset exactly
    maximumScreenSpaceError: 16,  // Cesium default for Google tiles
    maximumNumberOfLoadedTiles: 1000,
    
    // Memory management - MATCH CESIUM'S GOOGLE TILES DEFAULTS
    cacheBytes: 1610612736,          // 1.5 GB (Cesium's Google tiles default)
    maximumCacheOverflowBytes: 1073741824, // 1 GB (Cesium's Google tiles default)
    
    // LOD settings - USE CESIUM DEFAULTS (no skipLevelOfDetail for Google tiles)
    skipLevelOfDetail: false,  // Cesium does NOT use skipLevelOfDetail for Google tiles
    baseScreenSpaceError: 1024,
    skipScreenSpaceErrorFactor: 16,
    skipLevels: 1,
    immediatelyLoadDesiredLevelOfDetail: false,
    loadSiblings: false,
    
    // Optimization settings for photorealistic tiles
    cullWithChildrenBounds: true,
    cullRequestsWhileMoving: true,
    cullRequestsWhileMovingMultiplier: 60.0,
    
    // Performance settings
    preloadWhenHidden: false,
    preloadFlightDestinations: true,
    preferLeaves: false,
    
    // Dynamic screen space error for street-level views
    dynamicScreenSpaceError: true,
    dynamicScreenSpaceErrorDensity: 2.0e-4,
    dynamicScreenSpaceErrorFactor: 24.0,
    dynamicScreenSpaceErrorHeightFalloff: 0.25,
    
    // Foveated rendering (performance optimization)
    foveatedScreenSpaceError: true,
    foveatedConeSize: 0.1,
    foveatedMinimumScreenSpaceErrorRelaxation: 0.0,
    foveatedTimeDelay: 0.2,
    
    // Progressive resolution
    progressiveResolutionHeightFraction: 0.3,
    
    // Visual settings
    show: true,
    shadows: 1, // ShadowMode.ENABLED
    colorBlendMode: 0, // Cesium3DTileColorBlendMode.HIGHLIGHT
    colorBlendAmount: 0.5,
    
    // Debug settings (usually false in production)
    debugFreezeFrame: false,
    debugColorizeTiles: false,
    debugWireframe: false,
    debugShowBoundingVolume: false,
    debugShowContentBoundingVolume: false,
    debugShowViewerRequestVolume: false,
    debugShowGeometricError: false,
    debugShowRenderingStatistics: false,
    debugShowMemoryUsage: false,
    debugShowUrl: false,
    
    // Point cloud settings (for when tiles contain point clouds)
    pointCloudShading: {
        attenuation: false,
        geometricErrorScale: 1.0,
        maximumAttenuation: undefined,
        baseResolution: undefined,
        eyeDomeLighting: true,
        eyeDomeLightingStrength: 1.0,
        eyeDomeLightingRadius: 1.0,
        backFaceCulling: false,
        normalShading: true
    }
};

/**
 * OSM Buildings 3D Tiles Configuration  
 * Optimized for architectural/building data
 */
export const OSM_BUILDINGS_CONFIG = {
    // More aggressive LOD for simpler building geometry
    maximumScreenSpaceError: 8,
    maximumNumberOfLoadedTiles: 500,
    
    // Memory management
    cacheBytes: 268435456, // 256 MB (less than Google)
    maximumCacheOverflowBytes: 268435456,
    
    // LOD settings optimized for buildings
    skipLevelOfDetail: true, // Buildings can skip levels effectively
    baseScreenSpaceError: 512,
    skipScreenSpaceErrorFactor: 8,
    skipLevels: 1,
    immediatelyLoadDesiredLevelOfDetail: true,
    loadSiblings: true,
    
    // Performance optimizations for buildings
    cullWithChildrenBounds: true,
    cullRequestsWhileMoving: true,
    cullRequestsWhileMovingMultiplier: 30.0,
    
    // Building-specific settings
    preloadWhenHidden: false,
    preloadFlightDestinations: false,
    preferLeaves: true, // Buildings benefit from leaf-first loading
    
    // Less aggressive dynamic SSE for buildings
    dynamicScreenSpaceError: false,
    
    // Visual settings
    show: true,
    shadows: 1, // ShadowMode.ENABLED
    colorBlendMode: 0,
    colorBlendAmount: 0.5,
    
    // Minimal debug
    debugFreezeFrame: false,
    debugColorizeTiles: false,
    debugWireframe: false,
    debugShowBoundingVolume: false,
    debugShowContentBoundingVolume: false,
    debugShowViewerRequestVolume: false,
    debugShowGeometricError: false,
    debugShowRenderingStatistics: false,
    debugShowMemoryUsage: false,
    debugShowUrl: false
};

/**
 * Generic high-quality 3D tileset configuration
 * For custom or unknown tileset types
 */
export const DEFAULT_3D_TILES_CONFIG = {
    maximumScreenSpaceError: 16,
    maximumNumberOfLoadedTiles: 1000,
    cacheBytes: 536870912,
    maximumCacheOverflowBytes: 536870912,
    cullWithChildrenBounds: true,
    cullRequestsWhileMoving: true,
    show: true,
    shadows: 1,
    debugFreezeFrame: false,
    debugColorizeTiles: false,
    debugWireframe: false,
    debugShowBoundingVolume: false,
    debugShowContentBoundingVolume: false,
    debugShowViewerRequestVolume: false,
    debugShowGeometricError: false,
    debugShowRenderingStatistics: false,
    debugShowMemoryUsage: false,
    debugShowUrl: false
};

/**
 * Debug configuration for development
 * Enables various debug visualizations
 */
export const DEBUG_3D_TILES_CONFIG = {
    ...DEFAULT_3D_TILES_CONFIG,
    maximumScreenSpaceError: 32, // Less aggressive for debugging
    debugColorizeTiles: true,
    debugShowBoundingVolume: true,
    debugShowGeometricError: true,
    debugShowRenderingStatistics: true,
    debugShowMemoryUsage: true,
    debugShowUrl: true
};