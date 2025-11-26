# Cesium Extracted Classes

This folder contains **verbatim copies** of internal Cesium classes that are not exported in the public API but are essential for proper 3D Tiles functionality.

## Purpose

These classes are **exact extractions** from Cesium's source code (`@cesium/engine/Source/`) that we need but cannot import because they are marked as `@private` and not included in Cesium's public exports.

## Why We Need These

Cesium's public API doesn't expose many critical internal classes that are essential for:
- **Statistics tracking** - Performance monitoring and debugging
- **Cache management** - Memory-efficient tile loading/unloading  
- **Content state management** - Proper tile lifecycle handling
- **Pass system** - Multi-pass rendering coordination
- **Array management** - Optimized data structures

## Extraction Strategy

1. **Locate source** - Find the original file in `node_modules/@cesium/engine/Source/`
2. **Copy verbatim** - Extract the exact implementation with minimal changes
3. **Add TypeScript typing** - Convert to TypeScript with proper type annotations
4. **Preserve behavior** - Maintain 100% compatibility with original Cesium behavior
5. **Document source** - Include clear attribution to original Cesium file

## Files

**Note**: Many modules that were previously extracted are now available in Cesium's public API and have been replaced with native imports.

### Still Extracted (Internal Cesium Dependencies)

- **Cesium3DTilesetBaseTraversal_extracted.ts** - Base traversal implementation
  - Source: `@cesium/engine/Source/Scene/Cesium3DTilesetBaseTraversal.js`
  - Core tile selection and refinement logic

- **Cesium3DTilesetSkipTraversal_extracted.ts** - Skip LOD traversal implementation  
  - Source: `@cesium/engine/Source/Scene/Cesium3DTilesetSkipTraversal.js`
  - Advanced traversal with level-of-detail skipping

- **Cesium3DTilesetTraversal_extracted.ts** - Base traversal interface
  - Source: `@cesium/engine/Source/Scene/Cesium3DTilesetTraversal.js`
  - Abstract traversal patterns and utilities

- **preprocess3DTileContent_extracted.ts** - Content type detection utilities
  - Source: `@cesium/engine/Source/Scene/preprocess3DTileContent.js`
  - Handles B3DM, PNTS, I3DM, CMPT content type detection

### Replaced with Native Cesium (No Longer Extracted)

- ~~**ManagedArray_extracted.ts**~~ → Now using `ManagedArray` from cesium package
- ~~**Cesium3DTilesetStatistics_extracted.ts**~~ → Now using `Cesium3DTilesetStatistics` from cesium package  
- ~~**Cesium3DTilePass_extracted.ts**~~ → Now using `Cesium3DTilePass` from cesium package
- ~~**Cesium3DTileOptimizationHint_extracted.ts**~~ → Now using `Cesium3DTileOptimizationHint` from cesium package
- ~~**EllipsoidalOccluder_extracted.ts**~~ → Now using `EllipsoidalOccluder` from cesium package
- ~~**Cesium3DTileContentState_extracted.ts**~~ → Now using `Cesium3DTileContentState` from cesium package
- ~~**Cesium3DTileRefine_extracted.ts**~~ → Now using `Cesium3DTileRefine` from cesium package


## Relationship to `cesium_derived/`

The **derived** classes in `cesium_derived/` folder **import and use** these extracted classes to maintain full compatibility with Cesium's internal systems while providing a Babylon.js-compatible API.

## Maintenance Notes

- **Do NOT modify** these files unless the original Cesium source changes
- When updating Cesium versions, check if source files have changed and re-extract if needed
- These files should remain as close to the original as possible
- Only changes allowed: TypeScript conversion and dependency simplification

## Legal Note

These files are extracted from Cesium's open source code (Apache 2.0 license) and are used in accordance with that license. Original copyright and attribution is preserved in each file.