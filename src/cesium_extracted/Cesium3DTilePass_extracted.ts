/**
 * The pass in which a 3D Tileset is updated.
 * 
 * Extracted from Cesium Engine (@cesium/engine/Source/Scene/Cesium3DTilePass.js)
 * This is a Cesium internal enum not exported in the public API.
 *
 * @private
 */
export const Cesium3DTilePass = {
    RENDER: 0,
    PICK: 1,
    SHADOW: 2,
    PRELOAD: 3,
    PRELOAD_FLIGHT: 4,
    REQUEST_RENDER_MODE_DEFER_CHECK: 5,
    MOST_DETAILED_PRELOAD: 6,
    MOST_DETAILED_PICK: 7,
    NUMBER_OF_PASSES: 8,
} as const;

export type Cesium3DTilePassType = typeof Cesium3DTilePass[keyof typeof Cesium3DTilePass];

/**
 * Pass options configuration
 */
interface PassOptions {
    pass: number;
    isRender: boolean;
    requestTiles: boolean;
    ignoreCommands: boolean;
}

const passOptions: ReadonlyArray<Readonly<PassOptions>> = [
    // RENDER
    Object.freeze({
        pass: Cesium3DTilePass.RENDER,
        isRender: true,
        requestTiles: true,
        ignoreCommands: false,
    }),
    // PICK
    Object.freeze({
        pass: Cesium3DTilePass.PICK,
        isRender: false,
        requestTiles: false,
        ignoreCommands: false,
    }),
    // SHADOW
    Object.freeze({
        pass: Cesium3DTilePass.SHADOW,
        isRender: false,
        requestTiles: true,
        ignoreCommands: false,
    }),
    // PRELOAD
    Object.freeze({
        pass: Cesium3DTilePass.PRELOAD,
        isRender: false,
        requestTiles: true,
        ignoreCommands: true,
    }),
    // PRELOAD_FLIGHT
    Object.freeze({
        pass: Cesium3DTilePass.PRELOAD_FLIGHT,
        isRender: false,
        requestTiles: true,
        ignoreCommands: true,
    }),
    // REQUEST_RENDER_MODE_DEFER_CHECK
    Object.freeze({
        pass: Cesium3DTilePass.REQUEST_RENDER_MODE_DEFER_CHECK,
        isRender: false,
        requestTiles: true,
        ignoreCommands: true,
    }),
    // MOST_DETAILED_PRELOAD
    Object.freeze({
        pass: Cesium3DTilePass.MOST_DETAILED_PRELOAD,
        isRender: false,
        requestTiles: true,
        ignoreCommands: true,
    }),
    // MOST_DETAILED_PICK
    Object.freeze({
        pass: Cesium3DTilePass.MOST_DETAILED_PICK,
        isRender: false,
        requestTiles: false,
        ignoreCommands: false,
    }),
];

/**
 * Get options for a specific pass
 */
function getPassOptions(pass: number): Readonly<PassOptions> {
    return passOptions[pass];
}

// Export the functions and constants
export { getPassOptions };
export default Object.freeze(Cesium3DTilePass);