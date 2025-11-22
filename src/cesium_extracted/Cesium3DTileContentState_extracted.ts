/**
 * Content state enumeration for Cesium 3D Tiles.
 * 
 * Extracted from Cesium Engine (@cesium/engine/Source/Scene/Cesium3DTileContentState.js)
 * This is a Cesium internal enum not exported in the public API.
 *
 * @private
 */
export const Cesium3DTileContentState = {
    UNLOADED: 0,    // Has never been requested
    LOADING: 1,     // Is waiting on a pending request
    PROCESSING: 2,  // Request received. Contents are being processed for rendering. Depending on the content, it might make its own requests for external data.
    READY: 3,       // Ready to render.
    EXPIRED: 4,     // Is expired and will be unloaded once new content is loaded.
    FAILED: 5,      // Request failed.
} as const;

export type Cesium3DTileContentStateType = typeof Cesium3DTileContentState[keyof typeof Cesium3DTileContentState];

export default Object.freeze(Cesium3DTileContentState);