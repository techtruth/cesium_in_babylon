/**
 * Extracted from Cesium source since these functions aren't properly exported in TypeScript definitions
 * Source: cesium/Build/CesiumUnminified/Cesium.js
 * 
 * This provides the core content type detection functionality that Cesium uses internally.
 */

// Cesium3DTileContentType constants extracted from Cesium source
export const Cesium3DTileContentType = {
    BATCHED_3D_MODEL: "b3dm",
    INSTANCED_3D_MODEL: "i3dm", 
    COMPOSITE: "cmpt",
    POINT_CLOUD: "pnts",
    VECTOR: "vctr",
    GEOMETRY: "geom",
    EXTERNAL_TILESET: "externalTileset",
    MULTIPLE_CONTENT: "multipleContents",
    GLTF: "gltf",
    GLTF_BINARY: "glb",
    IMPLICIT_SUBTREE: "subt",
    IMPLICIT_SUBTREE_JSON: "subtreeJson",
    GEOJSON: "geoJson",
    VOXEL_BINARY: "voxl",
    VOXEL_JSON: "voxelJson"
} as const;

/**
 * Helper function to get magic number from binary data
 */
function getMagic(uint8Array: Uint8Array): string {
    if (uint8Array.length < 4) {
        return "";
    }
    
    // Convert first 4 bytes to string
    const magic = String.fromCharCode(
        uint8Array[0],
        uint8Array[1], 
        uint8Array[2],
        uint8Array[3]
    );
    
    return magic;
}

/**
 * Helper function to read 32-bit little-endian unsigned integer from Uint8Array
 */
function readUint32LE(uint8Array: Uint8Array, offset: number): number {
    return uint8Array[offset] |
           (uint8Array[offset + 1] << 8) |
           (uint8Array[offset + 2] << 16) |
           (uint8Array[offset + 3] << 24);
}

/**
 * Extract glTF/GLB content from B3DM binary data
 * 
 * B3DM format structure (28-byte header):
 * - magic (4 bytes): "b3dm"
 * - version (4 bytes): format version (typically 1)
 * - byteLength (4 bytes): total tile length
 * - featureTableJSONByteLength (4 bytes): length of feature table JSON
 * - featureTableBinaryByteLength (4 bytes): length of feature table binary
 * - batchTableJSONByteLength (4 bytes): length of batch table JSON  
 * - batchTableBinaryByteLength (4 bytes): length of batch table binary
 * 
 * @param uint8Array B3DM binary data
 * @returns Extracted glTF/GLB binary data
 */
function extractGltfFromB3DM(uint8Array: Uint8Array): Uint8Array {
    // Verify this is actually B3DM format
    const magic = getMagic(uint8Array);
    if (magic !== "b3dm") {
        throw new Error("Not a valid B3DM file - missing b3dm magic number");
    }
    
    // Read header fields (all 32-bit little-endian unsigned integers)
    const version = readUint32LE(uint8Array, 4);
    const byteLength = readUint32LE(uint8Array, 8);
    const featureTableJSONByteLength = readUint32LE(uint8Array, 12);
    const featureTableBinaryByteLength = readUint32LE(uint8Array, 16);
    const batchTableJSONByteLength = readUint32LE(uint8Array, 20);
    const batchTableBinaryByteLength = readUint32LE(uint8Array, 24);
    
    // Validate header
    if (uint8Array.length < byteLength) {
        throw new Error("B3DM file truncated - actual size smaller than declared byteLength");
    }
    
    // Calculate offset to glTF content by skipping:
    // - 28-byte header
    // - Feature table JSON 
    // - Feature table binary
    // - Batch table JSON
    // - Batch table binary
    const gltfOffset = 28 + 
                      featureTableJSONByteLength + 
                      featureTableBinaryByteLength + 
                      batchTableJSONByteLength + 
                      batchTableBinaryByteLength;
                      
    // Ensure we don't read past the end of the array
    if (gltfOffset >= uint8Array.length) {
        throw new Error("B3DM header indicates glTF content beyond file bounds");
    }
    
    // Extract glTF/GLB binary data (everything after the B3DM header and tables)
    const gltfData = uint8Array.subarray(gltfOffset);
    
    // Verify the extracted data starts with glTF magic number
    if (gltfData.length >= 4) {
        const gltfMagic = getMagic(gltfData);
        if (gltfMagic !== "glTF") {
            console.warn("Warning: Extracted B3DM content does not start with glTF magic number");
        }
    }
    
    return gltfData;
}

/**
 * Helper function to parse JSON from Uint8Array
 */
function getJsonFromTypedArray(uint8Array: Uint8Array): any {
    const decoder = new TextDecoder('utf-8');
    const jsonString = decoder.decode(uint8Array);
    return JSON.parse(jsonString);
}

/**
 * Helper function to get JSON content from uint8Array
 */
function getJsonContent(uint8Array: Uint8Array): any {
    let json;
    try {
        json = getJsonFromTypedArray(uint8Array);
    } catch (error) {
        throw new Error("Invalid JSON content");
    }
    return json;
}

/**
 * Check if a content type is a binary format
 */
function isBinaryFormat(contentType: string): boolean {
    switch (contentType) {
        case Cesium3DTileContentType.BATCHED_3D_MODEL:
        case Cesium3DTileContentType.INSTANCED_3D_MODEL:
        case Cesium3DTileContentType.COMPOSITE:
        case Cesium3DTileContentType.POINT_CLOUD:
        case Cesium3DTileContentType.VECTOR:
        case Cesium3DTileContentType.GEOMETRY:
        case Cesium3DTileContentType.IMPLICIT_SUBTREE:
        case Cesium3DTileContentType.VOXEL_BINARY:
        case Cesium3DTileContentType.GLTF_BINARY:
            return true;
        default:
            return false;
    }
}

/**
 * Preprocesses 3D tile content from ArrayBuffer - extracted from Cesium source
 * 
 * @param arrayBuffer The tile content as ArrayBuffer
 * @returns Object with contentType and payload (either binaryPayload or jsonPayload)
 */
export function preprocess3DTileContent(arrayBuffer: ArrayBuffer): {
    contentType: string;
    binaryPayload?: Uint8Array;
    jsonPayload?: any;
} {
    const uint8Array = new Uint8Array(arrayBuffer);
    let contentType = getMagic(uint8Array);
    
    // GLB files have magic "glTF" but we want to return "glb" as the content type
    if (contentType === "glTF") {
        return {
            contentType: Cesium3DTileContentType.GLTF_BINARY, // "glb"
            binaryPayload: uint8Array
        };
    }
    
    if (isBinaryFormat(contentType)) {
        return {
            contentType,
            binaryPayload: uint8Array
        };
    }
    
    // If it's not a recognized binary format, try to parse as JSON
    let json;
    try {
        json = getJsonContent(uint8Array);
    } catch (error) {
        // If JSON parsing fails and we don't recognize the magic, assume it's a GLB
        return {
            contentType: Cesium3DTileContentType.GLTF_BINARY,
            binaryPayload: uint8Array
        };
    }
    
    if (json.root !== undefined) {
        return {
            contentType: Cesium3DTileContentType.EXTERNAL_TILESET,
            jsonPayload: json
        };
    }
    
    if (json.asset !== undefined) {
        return {
            contentType: Cesium3DTileContentType.GLTF,
            jsonPayload: json
        };
    }
    
    if (json.tileAvailability !== undefined) {
        return {
            contentType: Cesium3DTileContentType.IMPLICIT_SUBTREE_JSON,
            jsonPayload: json
        };
    }
    
    if (json.type !== undefined) {
        return {
            contentType: Cesium3DTileContentType.GEOJSON,
            jsonPayload: json
        };
    }
    
    if (json.voxelTable !== undefined) {
        return {
            contentType: Cesium3DTileContentType.VOXEL_JSON,
            jsonPayload: json
        };
    }
    
    throw new Error("Invalid tile content.");
}