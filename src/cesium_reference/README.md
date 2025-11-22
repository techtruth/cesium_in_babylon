# Cesium Reference Files

This folder contains **exact copies** of the original Cesium source files that our derived implementations are based on. These files serve as the reference for tracking changes and maintaining synchronization with upstream Cesium updates.

## Purpose

- 📚 **Reference Documentation** - Original Cesium implementations for comparison
- 🔄 **Change Tracking** - Easy way to see what changed when Cesium updates
- 🎯 **Derivation Source** - The exact files our Babylon.js adaptations are based on
- 🛠️ **Development Aid** - Quick access to original algorithms and patterns

## File Mappings

| **Reference File** | **Derived File** | **Purpose** |
|-------------------|------------------|-------------|
| `Cesium3DTileContent.js` | `cesium_derived/Babylon3DTileContent.ts` | Base interface & lifecycle |
| `Model3DTileContent.js` | `cesium_derived/BabylonModel3DTileContent.ts` | glTF/GLB model handling |
| `ResourceLoader.js` | `cesium_derived/BabylonResourceLoader.ts` | Async resource loading |
| `Cesium3DTileset.js` | `cesium_derived/MinimalTileset.ts` | Core tileset management |
| `Cesium3DTilesetTraversal.js` | ~~`cesium_derived/BabylonTilesOrchestrator.ts`~~ (removed) | High-level traversal patterns now direct |

## Source Location

All files copied from: `node_modules/@cesium/engine/Source/Scene/`

## Maintenance

When updating Cesium:

1. **Check for changes** in the original files
2. **Copy new versions** to this reference folder  
3. **Compare differences** using diff tools
4. **Update derived files** to match new patterns where appropriate
5. **Preserve Babylon.js adaptations** while adopting Cesium improvements

## Important Notes

- ⚠️ **These are snapshots** - they represent the Cesium version at time of extraction
- ⚠️ **Do not modify** - these should remain as exact copies of Cesium source
- ⚠️ **Track Cesium version** - document which Cesium version these files came from
- ✅ **Use for reference only** - all Babylon.js adaptations go in `cesium_derived/`

## Cesium Version

These reference files are from Cesium version: **1.135.0**

Date extracted: **November 14, 2025**

## Legal

These files are copies of Cesium's open source code (Apache 2.0 license) and are used in accordance with that license for reference and derivation purposes.