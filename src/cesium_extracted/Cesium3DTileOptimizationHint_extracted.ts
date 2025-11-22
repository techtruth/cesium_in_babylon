/**
 * Hint defining optimization support for a 3D tile
 * 
 * Extracted from Cesium Engine (@cesium/engine/Source/Scene/Cesium3DTileOptimizationHint.js)
 *
 * @enum {number}
 *
 * @private
 */
export const Cesium3DTileOptimizationHint = {
  NOT_COMPUTED: -1,
  USE_OPTIMIZATION: 1,
  SKIP_OPTIMIZATION: 0,
} as const;

export default Object.freeze(Cesium3DTileOptimizationHint);