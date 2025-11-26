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

- **ManagedArray_extracted.ts** - Array wrapper with manual length management
  - Source: `@cesium/engine/Source/Core/ManagedArray.js`
  - Used for efficient tile array management

- **Cesium3DTilesetStatistics_extracted.ts** - Comprehensive performance statistics
  - Source: `@cesium/engine/Source/Scene/Cesium3DTilesetStatistics.js` 
  - Tracks rendering, loading, memory, and feature statistics

- **Cesium3DTilesetCache_extracted.ts** - LRU cache with doubly linked list
  - Source: `@cesium/engine/Source/Scene/Cesium3DTilesetCache.js`
  - Manages tile memory with efficient cache eviction

- **Cesium3DTilePass_extracted.ts** - Multi-pass rendering system
  - Source: `@cesium/engine/Source/Scene/Cesium3DTilePass.js`
  - Defines rendering passes (RENDER, PICK, SHADOW, etc.)


## Relationship to `cesium_derived/`

The **derived** classes in `cesium_derived/` folder **import and use** these extracted classes to maintain full compatibility with Cesium's internal systems while providing a Babylon.js-compatible API.

## Maintenance Notes

- **Do NOT modify** these files unless the original Cesium source changes
- When updating Cesium versions, check if source files have changed and re-extract if needed
- These files should remain as close to the original as possible
- Only changes allowed: TypeScript conversion and dependency simplification

## Legal Note

These files are extracted from Cesium's open source code (Apache 2.0 license) and are used in accordance with that license. Original copyright and attribution is preserved in each file.