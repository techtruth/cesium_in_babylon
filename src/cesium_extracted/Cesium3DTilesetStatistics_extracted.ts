/**
 * Statistics for tracking Cesium3DTileset performance and memory usage.
 * 
 * Extracted from Cesium Engine (@cesium/engine/Source/Scene/Cesium3DTilesetStatistics.js)
 * This is a Cesium internal class not exported in the public API.
 * 
 * @private
 */
export class Cesium3DTilesetStatistics {
    // Rendering statistics
    selected: number = 0;
    visited: number = 0;
    
    // Loading statistics  
    numberOfCommands: number = 0;
    numberOfAttemptedRequests: number = 0;
    numberOfPendingRequests: number = 0;
    numberOfTilesProcessing: number = 0;
    numberOfTilesWithContentReady: number = 0; // Number of tiles with content loaded, does not include empty tiles
    numberOfTilesTotal: number = 0; // Number of tiles in tileset JSON (and other tileset JSON files as they are loaded)
    numberOfLoadedTilesTotal: number = 0; // Running total of loaded tiles for the lifetime of the session
    
    // Features statistics
    numberOfFeaturesSelected: number = 0; // Number of features rendered
    numberOfFeaturesLoaded: number = 0; // Number of features in memory
    numberOfPointsSelected: number = 0;
    numberOfPointsLoaded: number = 0;
    numberOfTrianglesSelected: number = 0;
    
    // Styling statistics
    numberOfTilesStyled: number = 0;
    numberOfFeaturesStyled: number = 0;
    
    // Optimization statistics
    numberOfTilesCulledWithChildrenUnion: number = 0;
    
    // Memory statistics
    geometryByteLength: number = 0;
    texturesByteLength: number = 0;
    texturesReferenceCounterById: Record<string, number> = {};
    batchTableByteLength: number = 0; // batch textures and any binary metadata properties not otherwise accounted for

    constructor() {
        // All properties initialized above
    }

    /**
     * Clear frame-specific statistics
     */
    clear(): void {
        this.selected = 0;
        this.visited = 0;
        this.numberOfCommands = 0;
        this.numberOfAttemptedRequests = 0;
        this.numberOfFeaturesSelected = 0;
        this.numberOfPointsSelected = 0;
        this.numberOfTrianglesSelected = 0;
        this.numberOfTilesStyled = 0;
        this.numberOfFeaturesStyled = 0;
        this.numberOfTilesCulledWithChildrenUnion = 0;
    }

    /**
     * Increment the counters for the points, triangles, and features
     * that are currently selected for rendering.
     *
     * This will be called recursively for the given content and
     * all its inner contents
     *
     * @param {any} content - Tile content with feature/point/triangle counts
     */
    incrementSelectionCounts(content: any): void {
        this.numberOfFeaturesSelected += content.featuresLength || 0;
        this.numberOfPointsSelected += content.pointsLength || 0;
        this.numberOfTrianglesSelected += content.trianglesLength || 0;

        // Recursive calls on all inner contents
        const contents = content.innerContents;
        if (contents) {
            const length = contents.length;
            for (let i = 0; i < length; ++i) {
                this.incrementSelectionCounts(contents[i]);
            }
        }
    }

    /**
     * Increment the counters for the number of features and points that
     * are currently loaded, and the lengths (size in bytes) of the
     * occupied memory.
     *
     * This will be called recursively for the given content and
     * all its inner contents
     *
     * @param {any} content - Tile content with memory statistics
     */
    incrementLoadCounts(content: any): void {
        this.numberOfFeaturesLoaded += content.featuresLength || 0;
        this.numberOfPointsLoaded += content.pointsLength || 0;
        this.geometryByteLength += content.geometryByteLength || 0;
        this.batchTableByteLength += content.batchTableByteLength || 0;

        // Simplified texture handling - just add texture byte length directly
        this.texturesByteLength += content.texturesByteLength || 0;

        // Recursive calls on all inner contents
        const contents = content.innerContents;
        if (contents) {
            const length = contents.length;
            for (let i = 0; i < length; ++i) {
                this.incrementLoadCounts(contents[i]);
            }
        }
    }

    /**
     * Decrement the counters for the number of features and points that
     * are currently loaded, and the lengths (size in bytes) of the
     * occupied memory.
     *
     * This will be called recursively for the given content and
     * all its inner contents
     *
     * @param {any} content - Tile content with memory statistics
     */
    decrementLoadCounts(content: any): void {
        this.numberOfFeaturesLoaded -= content.featuresLength || 0;
        this.numberOfPointsLoaded -= content.pointsLength || 0;
        this.geometryByteLength -= content.geometryByteLength || 0;
        this.batchTableByteLength -= content.batchTableByteLength || 0;

        // Simplified texture handling - just subtract texture byte length directly
        this.texturesByteLength -= content.texturesByteLength || 0;
        
        // Recursive calls on all inner contents
        const contents = content.innerContents;
        if (contents) {
            const length = contents.length;
            for (let i = 0; i < length; ++i) {
                this.decrementLoadCounts(contents[i]);
            }
        }
    }

    /**
     * Clone statistics from another instance
     */
    static clone(statistics: Cesium3DTilesetStatistics, result: Cesium3DTilesetStatistics): void {
        result.selected = statistics.selected;
        result.visited = statistics.visited;
        result.numberOfCommands = statistics.numberOfCommands;
        result.numberOfAttemptedRequests = statistics.numberOfAttemptedRequests;
        result.numberOfPendingRequests = statistics.numberOfPendingRequests;
        result.numberOfTilesProcessing = statistics.numberOfTilesProcessing;
        result.numberOfTilesWithContentReady = statistics.numberOfTilesWithContentReady;
        result.numberOfTilesTotal = statistics.numberOfTilesTotal;
        result.numberOfFeaturesSelected = statistics.numberOfFeaturesSelected;
        result.numberOfFeaturesLoaded = statistics.numberOfFeaturesLoaded;
        result.numberOfPointsSelected = statistics.numberOfPointsSelected;
        result.numberOfPointsLoaded = statistics.numberOfPointsLoaded;
        result.numberOfTrianglesSelected = statistics.numberOfTrianglesSelected;
        result.numberOfTilesStyled = statistics.numberOfTilesStyled;
        result.numberOfFeaturesStyled = statistics.numberOfFeaturesStyled;
        result.numberOfTilesCulledWithChildrenUnion = statistics.numberOfTilesCulledWithChildrenUnion;
        result.geometryByteLength = statistics.geometryByteLength;
        result.texturesByteLength = statistics.texturesByteLength;
        result.texturesReferenceCounterById = { ...statistics.texturesReferenceCounterById };
        result.batchTableByteLength = statistics.batchTableByteLength;
    }
}

export default Cesium3DTilesetStatistics;