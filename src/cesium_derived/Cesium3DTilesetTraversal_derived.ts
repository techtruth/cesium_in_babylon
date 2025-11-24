/**
 * BABYLON DERIVED: Traverses a {@link Cesium3DTileset} to determine which tiles to load and render.
 * DERIVED FROM: @cesium/engine/Source/Scene/Cesium3DTilesetTraversal.js
 * 
 * BABYLON DEVIATIONS FROM CESIUM:
 * 1. Added horizon culling logic for 3D tiles (not in original Cesium)
 * 2. Added camera-inside-tile detection to prevent incorrect horizon culling
 * 3. Added coordinate system validation and debugging
 * 4. Modified to work with Babylon.js coordinate system requirements
 * 
 * CESIUM COMPLIANCE: All other traversal logic follows Cesium's exact patterns.
 * The core tile selection algorithm remains identical to Cesium's source.
 *
 * @alias Cesium3DTilesetTraversal
 * @constructor
 * @abstract
 *
 * @see Cesium3DTilesetBaseTraversal
 * @see Cesium3DTilesetSkipTraversal
 * @see Cesium3DTilesetMostDetailedTraversal
 *
 * @private
 */

import { defined, Intersect, DeveloperError, Ellipsoid, Cartesian3 } from 'cesium';
import { Cesium3DTileOptimizationHint } from '../cesium_extracted/Cesium3DTileOptimizationHint_extracted';
import { Cesium3DTileRefine } from '../cesium_extracted/Cesium3DTileRefine_extracted';

function Cesium3DTilesetTraversal() {}

/**
 * Traverses a {@link Cesium3DTileset} to determine which tiles to load and render.
 *
 * @private
 * @param {any} tileset
 * @param {any} frameState
 */
Cesium3DTilesetTraversal.selectTiles = function (tileset: any, frameState: any) {
  throw new DeveloperError("This function should not be called directly.");
};

/**
 * Sort by farthest child first since this is going on a stack
 *
 * @private
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
Cesium3DTilesetTraversal.sortChildrenByDistanceToCamera = function (a: any, b: any): number {
  if (b._distanceToCamera === 0 && a._distanceToCamera === 0) {
    return b._centerZDepth - a._centerZDepth;
  }

  return b._distanceToCamera - a._distanceToCamera;
};

/**
 * Determine if a tile can and should be traversed for children tiles that
 * would contribute to rendering the current view
 *
 * @private
 * @param {any} tile
 * @returns {boolean}
 */
Cesium3DTilesetTraversal.canTraverse = function (tile: any): boolean {
  if (tile.children.length === 0) {
    return false;
  }
  if (tile.hasTilesetContent || tile.hasImplicitContent) {
    // Traverse external tileset to visit its root tile
    // Don't traverse if the subtree is expired because it will be destroyed
    return !tile.contentExpired;
  }
  return tile._screenSpaceError > tile.tileset.memoryAdjustedScreenSpaceError;
};

/**
 * Mark a tile as selected, and add it to the tileset's list of selected tiles
 *
 * @private
 * @param {any} tile
 * @param {any} frameState
 */
Cesium3DTilesetTraversal.selectTile = function (tile: any, frameState: any): void {
  if (tile.contentVisibility(frameState) === Intersect.OUTSIDE) {
    return;
  }

  tile._wasSelectedLastFrame = true;

  const { content, tileset } = tile;
  if (content.featurePropertiesDirty) {
    // A feature's property in this tile changed, the tile needs to be re-styled.
    content.featurePropertiesDirty = false;
    tile.lastStyleTime = 0; // Force applying the style to this tile
    tileset._selectedTilesToStyle.push(tile);
  } else if (tile._selectedFrame < frameState.frameNumber - 1) {
    // Tile is newly selected; it is selected this frame, but was not selected last frame.
    tileset._selectedTilesToStyle.push(tile);
    tile._wasSelectedLastFrame = false;
  }

  tile._selectedFrame = frameState.frameNumber;
  tileset._selectedTiles.push(tile);
};

/**
 * @private
 * @param {any} tile
 * @param {any} frameState
 */
Cesium3DTilesetTraversal.visitTile = function (tile: any, frameState: any): void {
  ++tile.tileset._statistics.visited;
  tile._visitedFrame = frameState.frameNumber;
};

/**
 * @private
 * @param {any} tile
 * @param {any} frameState
 */
Cesium3DTilesetTraversal.touchTile = function (tile: any, frameState: any): void {
  if (tile._touchedFrame === frameState.frameNumber) {
    // Prevents another pass from touching the frame again
    return;
  }
  tile.tileset._cache.touch(tile);
  tile._touchedFrame = frameState.frameNumber;
};

/**
 * Add a tile to the list of requested tiles, if appropriate
 *
 * @private
 * @param {any} tile
 * @param {any} frameState
 */
Cesium3DTilesetTraversal.loadTile = function (tile: any, frameState: any): void {
  const { tileset } = tile;
  if (
    tile._requestedFrame === frameState.frameNumber ||
    (!tile.hasUnloadedRenderableContent && !tile.contentExpired)
  ) {
    return;
  }

  if (!isOnScreenLongEnough(tile, frameState)) {
    return;
  }

  // TEMPORARILY DISABLED: Distance culling to test pure frustum culling
  // const tileDistance = tile._distanceToCamera || 0;
  // const maxRequestDistance = 50000; // 50km max request distance for street-level view
  // if (tileDistance > maxRequestDistance) {
  //   // Don't even add distant tiles to the request queue
  //   return;
  // }

  const cameraHasNotStoppedMovingLongEnough =
    frameState.camera.timeSinceMoved < tileset.foveatedTimeDelay;
  if (tile.priorityDeferred && cameraHasNotStoppedMovingLongEnough) {
    return;
  }

  tile._requestedFrame = frameState.frameNumber;
  tileset._requestedTiles.push(tile);
};

/**
 * Prevent unnecessary loads while camera is moving by getting the ratio of travel distance to tile size.
 *
 * @private
 * @param {any} tile
 * @param {any} frameState
 * @returns {boolean}
 */
function isOnScreenLongEnough(tile: any, frameState: any): boolean {
  const { tileset } = tile;
  if (!tileset._cullRequestsWhileMoving) {
    return true;
  }

  const { positionWCDeltaMagnitude, positionWCDeltaMagnitudeLastFrame } =
    frameState.camera;
  const deltaMagnitude =
    positionWCDeltaMagnitude !== 0.0
      ? positionWCDeltaMagnitude
      : positionWCDeltaMagnitudeLastFrame;

  // How do n frames of this movement compare to the tile's physical size.
  const diameter = Math.max(tile.boundingSphere.radius * 2.0, 1.0);
  const movementRatio =
    (tileset.cullRequestsWhileMovingMultiplier * deltaMagnitude) / diameter;

  return movementRatio < 1.0;
}

/**
 * Reset some of the tile's flags and re-evaluate visibility and priority
 *
 * @private
 * @param {any} tile
 * @param {any} frameState
 */
Cesium3DTilesetTraversal.updateTile = function (tile: any, frameState: any): void {
  try {
    updateTileVisibility(tile, frameState);
    tile.updateExpiration();

    tile._wasMinPriorityChild = false;
    tile._priorityHolder = tile;
    updateMinimumMaximumPriority(tile);

    // SkipLOD
    tile._shouldSelect = false;
    tile._finalResolution = true;
  } catch (error) {
    console.error('❌ ERROR in updateTile for tile:', tile.id || 'unknown', error);
    console.error('Tile state before error:', {
      geometricError: tile.geometricError,
      boundingSphere: tile.boundingSphere,
      _distanceToCamera: tile._distanceToCamera,
      _screenSpaceError: tile._screenSpaceError,
      isVisible: tile.isVisible
    });
    
    // DEBUG: Deep dive into distance calculation for "scale must be a finite number" error
    if (error.message.includes('scale must be a finite number')) {
      console.error('🔍 DEEP DEBUG - Scale Error Analysis:');
      
      // Check bounding sphere details
      if (tile.boundingSphere) {
        const bs = tile.boundingSphere;
        console.error('📍 Bounding sphere:', {
          center: bs.center ? `(${bs.center.x?.toFixed(0)}, ${bs.center.y?.toFixed(0)}, ${bs.center.z?.toFixed(0)})` : 'undefined',
          radius: bs.radius,
          centerMagnitude: bs.center ? Math.sqrt(bs.center.x*bs.center.x + bs.center.y*bs.center.y + bs.center.z*bs.center.z).toFixed(0) : 'N/A'
        });
      }
      
      // Test distance calculation manually
      try {
        console.error('🧮 Manual distance calculation test:');
        const frameState = arguments[1]; // Get frameState from function arguments
        
        if (frameState?.camera?.positionWC && tile.boundingSphere?.center) {
          const cameraPos = frameState.camera.positionWC;
          const sphereCenter = tile.boundingSphere.center;
          
          const dx = cameraPos.x - sphereCenter.x;
          const dy = cameraPos.y - sphereCenter.y; 
          const dz = cameraPos.z - sphereCenter.z;
          const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
          
          console.error('   Camera position:', `(${cameraPos.x?.toFixed(0)}, ${cameraPos.y?.toFixed(0)}, ${cameraPos.z?.toFixed(0)})`);
          console.error('   Sphere center:', `(${sphereCenter.x?.toFixed(0)}, ${sphereCenter.y?.toFixed(0)}, ${sphereCenter.z?.toFixed(0)})`);
          console.error('   Manual distance calculation:', distance?.toFixed(0));
          console.error('   Distance - radius (surface distance):', (distance - tile.boundingSphere.radius)?.toFixed(0));
        } else {
          console.error('   Missing data for distance calculation:', {
            hasCameraPos: !!frameState?.camera?.positionWC,
            hasSphereCenter: !!tile.boundingSphere?.center
          });
        }
        
        // Try calling distanceToTile directly
        if (tile.distanceToTile && typeof tile.distanceToTile === 'function') {
          const tileDistance = tile.distanceToTile(frameState);
          console.error('   tile.distanceToTile() result:', tileDistance);
        } else {
          console.error('   distanceToTile function not available');
        }
        
      } catch (distErr) {
        console.error('   Error in manual distance calculation:', distErr);
      }
    }
    
    throw error;
  }
};

/**
 * @private
 * @param {any} tile
 * @param {any} frameState
 */
function updateTileVisibility(tile: any, frameState: any): void {
  // DEBUG: Track visibility pipeline decisions
  const shouldDebugVisibility = tile._screenSpaceError > tile.tileset.memoryAdjustedScreenSpaceError;
  const tileDesc = `depth=${tile._depth}, SSE=${tile._screenSpaceError?.toFixed(1)}, geomError=${tile.geometricError?.toFixed(0)}`;
  
  // Store initial visibility state
  const visibilityBefore = tile.isVisible;
  
  tile.updateVisibility(frameState);
  
  // HORIZON CULLING: Add the same horizon culling that Cesium uses for terrain tiles
  // This prevents 3D tiles on the far side of Earth from being visible
  if (frameState.mode === 3 && // SceneMode.SCENE3D
      frameState.ellipsoidalOccluder && 
      tile.isVisible) {
    try {
      // CRITICAL: Ensure tileset transforms are updated before accessing tile bounding spheres
      // This triggers the updateTransform() call that fixes coordinate systems
      if (tile.tileset) {
        // Access tileset.boundingSphere to trigger updateTransform on the root tile
        // This ensures all tiles in the hierarchy have proper world coordinates
        if (tile.tileset.boundingSphere) {
          tile.tileset.boundingSphere;
        }
      }
      
      // ADDITIONAL: Also ensure this specific tile has its transform updated
      // In case the tileset's boundingSphere doesn't propagate to all children
      if (tile.updateTransform && tile.tileset && tile.tileset._modelMatrix) {
        try {
          if (tile.parent && tile.parent.computedTransform) {
            tile.updateTransform(tile.parent.computedTransform);
          } else {
            tile.updateTransform(tile.tileset._modelMatrix);
          }
        } catch (error) {
          // Ignore errors - some tiles might not support updateTransform
        }
      }
      
      // Get tile center point for horizon testing (should now have proper world coordinates)
      const boundingSphere = tile.boundingSphere;
      if (boundingSphere && boundingSphere.center) {
        // CRITICAL FIX: Don't horizon cull tiles that contain the camera!
        // For large tiles (like root tiles covering entire Earth), the camera is inside the bounding sphere
        const cameraPos = frameState.camera.positionWC;
        const tileCenter = boundingSphere.center;
        const tileRadius = boundingSphere.radius;
        
        // Calculate distance from camera to tile center
        const distanceToTileCenter = Cartesian3.distance(cameraPos, tileCenter);
        
        // If camera is inside tile's bounding sphere, don't horizon cull
        if (distanceToTileCenter <= tileRadius) {
          return; // Skip horizon culling for tiles containing the camera
        }
        
        // For tiles NOT containing the camera, proceed with normal horizon culling
        const ellipsoid = Ellipsoid.WGS84; // Use imported Ellipsoid from cesium
        const occludeePointInScaledSpace = ellipsoid.transformPositionToScaledSpace(boundingSphere.center);
        
        // Use horizon test - start with simpler method for 3D tiles
        const isVisible = frameState.ellipsoidalOccluder.isScaledSpacePointVisible(
            occludeePointInScaledSpace
        );
        
        // All horizon debug logs disabled
        
        if (!isVisible) {
          // Tile is behind Earth's horizon - mark as not visible
          tile._visible = false;
          
          // DEBUG: Log horizon culling occasionally
          if (frameState.frameNumber % 1200 === 0) { // Every 20 seconds
            const distance = tile._distanceToCamera || 'unknown';
            console.log(`🌍 HORIZON CULLED: Tile behind Earth's horizon (distance: ${distance})`);
            console.log(`   Camera position in ellipsoidalOccluder: `, frameState.ellipsoidalOccluder._cameraPosition);
          }
          return; // Early exit - tile is horizon culled
        }
      }
    } catch (error) {
      // If horizon culling fails, continue with normal processing
      console.warn('Horizon culling check failed:', error);
    }
  }
  
  // MINIMAL LOGGING: Disable verbose visibility logging
  if (!tile.isVisible) {
    return;
  }

  const hasChildren = tile.children.length > 0;
  if ((tile.hasTilesetContent || tile.hasImplicitContent) && hasChildren) {
    // Use the root tile's visibility instead of this tile's visibility.
    // The root tile may be culled by the children bounds optimization in which
    // case this tile should also be culled.
    const child = tile.children[0];
    // Delegating to first child (no logging needed)
    updateTileVisibility(child, frameState);
    tile._visible = child._visible;
    return;
  }

  const meetsSSEEarly = meetsScreenSpaceErrorEarly(tile, frameState);
  if (meetsSSEEarly) {
    if (shouldDebugVisibility) {
      console.log(`   ⚡ Tile (${tileDesc}) marked invisible by meetsScreenSpaceErrorEarly`);
    }
    tile._visible = false;
    return;
  }

  // Optimization - if none of the tile's children are visible then this tile isn't visible
  const replace = tile.refine === Cesium3DTileRefine.REPLACE;
  const useOptimization =
    tile._optimChildrenWithinParent ===
    Cesium3DTileOptimizationHint.USE_OPTIMIZATION;
  if (replace && useOptimization && hasChildren) {
    const childrenVisibilityResult = anyChildrenVisible(tile, frameState);
    if (!childrenVisibilityResult) {
      if (shouldDebugVisibility) {
        console.log(`   👥 Tile (${tileDesc}) marked invisible by children optimization - no children visible (replace=${replace}, useOptim=${useOptimization})`);
      }
      ++tile.tileset._statistics.numberOfTilesCulledWithChildrenUnion;
      tile._visible = false;
      return;
    } else if (shouldDebugVisibility) {
      console.log(`   ✅ Tile (${tileDesc}) stays visible - some children are visible`);
    }
  }
  
  // REDUCED LOGGING: Only show visibility changes, not final states
  // (Final visibility states were too verbose)
}

/**
 * @private
 * @param {any} tile
 * @param {any} frameState
 * @returns {boolean}
 */
function meetsScreenSpaceErrorEarly(tile: any, frameState: any): boolean {
  const { parent, tileset } = tile;
  
  // Early exit conditions
  if (!defined(parent)) {
    return false;
  }
  if (parent.hasTilesetContent || parent.hasImplicitContent) {
    return false;
  }
  if (parent.refine !== Cesium3DTileRefine.ADD) {
    return false;
  }

  // Use parent's geometric error with child's box to see if the tile already meet the SSE
  const tileSSE = tile.getScreenSpaceError(frameState, true);
  const threshold = tileset.memoryAdjustedScreenSpaceError;
  const meetsEarly = tileSSE <= threshold;
  
  // DEBUG: Log SSE early culling decisions for high SSE tiles
  const shouldDebug = tile._screenSpaceError > tileset.memoryAdjustedScreenSpaceError;
  if (shouldDebug && meetsEarly) {
    const tileDesc = `depth=${tile._depth}, geomError=${tile.geometricError?.toFixed(0)}`;
    console.log(`   ⚡ meetsScreenSpaceErrorEarly: tile (${tileDesc}) SSE=${tileSSE?.toFixed(1)} <= ${threshold} (parent refine=ADD)`);
  }
  
  return meetsEarly;
}

/**
 * @private
 * @param {any} tile
 * @param {any} frameState
 * @returns {boolean}
 */
function anyChildrenVisible(tile: any, frameState: any): boolean {
  let anyVisible = false;
  const children = tile.children;
  
  // DEBUG: Track child visibility in detail for high SSE parents
  const shouldDebug = tile._screenSpaceError > tile.tileset.memoryAdjustedScreenSpaceError;
  const parentDesc = `parent depth=${tile._depth}, SSE=${tile._screenSpaceError?.toFixed(1)}`;
  
  if (shouldDebug) {
    console.log(`   👥 anyChildrenVisible check for ${parentDesc} with ${children.length} children:`);
  }
  
  for (let i = 0; i < children.length; ++i) {
    const child = children[i];
    const visibilityBefore = child.isVisible;
    
    child.updateVisibility(frameState);
    
    const visibilityAfter = child.isVisible;
    anyVisible = anyVisible || child.isVisible;
    
    if (shouldDebug) {
      const childDesc = `child ${i} (depth=${child._depth}, SSE=${child._screenSpaceError?.toFixed(1)}, contentAvailable=${child.contentAvailable})`;
      if (visibilityBefore !== visibilityAfter) {
        console.log(`     📍 ${childDesc}: updateVisibility changed ${visibilityBefore} → ${visibilityAfter}`);
      } else {
        console.log(`     ${visibilityAfter ? '✅' : '⛔'} ${childDesc}: visibility=${visibilityAfter}`);
      }
    }
  }
  
  if (shouldDebug) {
    console.log(`   👥 anyChildrenVisible result for ${parentDesc}: ${anyVisible}`);
  }
  
  return anyVisible;
}

/**
 * @private
 * @param {any} tile
 */
function updateMinimumMaximumPriority(tile: any): void {
  const minimumPriority = tile.tileset._minimumPriority;
  const maximumPriority = tile.tileset._maximumPriority;
  const priorityHolder = tile._priorityHolder;

  maximumPriority.distance = Math.max(
    priorityHolder._distanceToCamera,
    maximumPriority.distance,
  );
  minimumPriority.distance = Math.min(
    priorityHolder._distanceToCamera,
    minimumPriority.distance,
  );
  maximumPriority.depth = Math.max(tile._depth, maximumPriority.depth);
  minimumPriority.depth = Math.min(tile._depth, minimumPriority.depth);
  maximumPriority.foveatedFactor = Math.max(
    priorityHolder._foveatedFactor,
    maximumPriority.foveatedFactor,
  );
  minimumPriority.foveatedFactor = Math.min(
    priorityHolder._foveatedFactor,
    minimumPriority.foveatedFactor,
  );
  maximumPriority.reverseScreenSpaceError = Math.max(
    tile._priorityReverseScreenSpaceError,
    maximumPriority.reverseScreenSpaceError,
  );
  minimumPriority.reverseScreenSpaceError = Math.min(
    tile._priorityReverseScreenSpaceError,
    minimumPriority.reverseScreenSpaceError,
  );
}

export default Cesium3DTilesetTraversal;