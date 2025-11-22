# Cesium Derived Classes

This folder contains classes that are **derived from** or **inspired by** Cesium's reference implementations but have been **modified** to work with Babylon.js and our specific requirements.

## Purpose

These classes take Cesium's proven algorithms and patterns but adapt them for:
- **Babylon.js integration** - Working with Babylon's scene graph and rendering pipeline
- **Custom content handling** - Processing tile content for Babylon instead of Cesium's renderer
- **Simplified dependencies** - Reducing complex Cesium internals while maintaining core functionality
- **TypeScript compatibility** - Proper typing and modern JavaScript features

## Key Differences from Original Cesium

- **Modified constructors** - Adapted for Babylon.js scene integration
- **Custom content processing** - Creates `BabylonTileContent` instead of Cesium content types
- **Simplified API surface** - Focused on essential tile management functionality
- **Babylon-specific optimizations** - Tailored for our rendering requirements

## Files

- **MinimalTileset.ts** - Core tileset management derived from `Cesium3DTileset.js`
  - Handles tile selection, loading, and hierarchical traversal
  - Integrates with extracted Cesium modules for statistics and caching
  - Creates Babylon-compatible content from tile data

- **Babylon3DTileContent.ts** - Base interface derived from `Cesium3DTileContent.js`
  - Defines the standard interface for all tile content types
  - Provides lifecycle management patterns (ready, update, destroy)
  - Ensures seamless integration with Cesium's tile system

- **BabylonModel3DTileContent.ts** - Model content derived from `Model3DTileContent.js`
  - Handles glTF/GLB model content from 3D tiles specifically
  - Manages mesh creation, transforms, and coordinate system conversion
  - Implements Cesium's model loading and updating patterns

- **BabylonResourceLoader.ts** - Resource loading derived from `ResourceLoader.js`
  - Async resource loading with retry logic and progress tracking
  - Handles different content types (ArrayBuffer, JSON, text)
  - Follows Cesium's resource loading state machine patterns

- **BabylonTilesOrchestrator.ts** - REMOVED (was redundant wrapper, direct content creation used instead)
  - Coordinates the individual derived components
  - Provides simplified API for tile content creation and management
  - Handles tile registration, visibility, and cleanup

## Relationship to `cesium_extracted/`

These derived classes **depend on** and **use** the extracted classes from `cesium_extracted/` to maintain compatibility with Cesium's internal systems while adapting the public API for Babylon.js.

## Development Notes

- When updating these classes, always reference the original Cesium implementation to maintain algorithm correctness
- Changes should focus on integration aspects, not core tile management logic
- Preserve Cesium's proven patterns for performance and reliability