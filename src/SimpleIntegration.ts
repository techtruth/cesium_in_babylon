import { Camera, Engine, Vector3 } from '@babylonjs/core';
import {
  Ion,
  IonResource, 
  Cartesian3,
  Cartographic,
  Ellipsoid,
  PerspectiveFrustum,
  SceneMode,
  JulianDate,
  GeographicProjection
} from 'cesium';

// Import internal Cesium classes that may not be publicly exported
import * as CesiumInternal from 'cesium';

import { SimpleBabylonTileContent } from './SimpleBabylonTileContent';
import { babylonToCesiumVec3, cesiumMatrixToBabylonMatrix } from './coordUtils';

//This can go away after PR to cesium is accepted
//import CesiumTilesetDerived from './cesium_derived/CesiumTilesetDerived.js';
// @ts-expect-error: derived Cesium tileset is plain JS without types
import CesiumTilesetDerived from './cesium_derived/Cesium3DTileset';

import { DebugVisualization } from './DebugVisualization';

/**
 * Simple Cesium + Babylon integration - trust Cesium completely
 */
export class SimpleIntegration {
  private camera: Camera;
  private engine: Engine;
  private babylonScene: any;
  private cesiumTileset?: CesiumTilesetDerived;
  private renderTilesetPassState: any;
  private frameCount: number = 0;
  private lastFrameNumber: number = 0;
  private lastCameraState: any;
  private debugVisualization!: DebugVisualization;
  private addedCredits: Set<string> = new Set();
  private debugLogInterval: number = 180; // frames between debug logs to avoid spam

  private addCreditToHTML(credit: any): void {
    const creditText = credit.text || credit.html || credit.toString();
    if (creditText && !this.addedCredits.has(creditText)) {
      this.addedCredits.add(creditText);
      const comment = document.createComment(` Credit: ${creditText} `);
      document.head.appendChild(comment);
    }
  }

  constructor(babylonScene: any, camera: Camera, engine: Engine) {
    this.camera = camera;
    this.engine = engine;
    this.babylonScene = babylonScene;

    // Set up Cesium Ion authentication using native Cesium
    // TODO: Update with your new Cesium Ion token from https://cesium.com/ion/tokens
    Ion.defaultAccessToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4OWQ5MDg2Mi02MDRmLTRhMWItYjZjZS1mMGE3YWI1MDAyOWYiLCJpZCI6MjIwODczLCJpYXQiOjE3NjQ4NjgxNDh9.Grk7U6JuiU7YNrP5bjCAsrifDqBJIxtQZF4Lf52ocMo';

    // BABYLON.JS: Set up proper Cesium content factory registration
    this.setupBabylonContentFactory();

    // CRITICAL FIX: Increase RequestScheduler limits for Google 3D Tiles
    this.optimizeRequestSchedulerForGoogle3DTiles();

    // Create reusable pass state exactly like Cesium Scene does
    // Access internal classes through Cesium namespace
    const Cesium3DTilePassState = (CesiumInternal as any).Cesium3DTilePassState;
    const Cesium3DTilePass = (CesiumInternal as any).Cesium3DTilePass;

    this.renderTilesetPassState = new Cesium3DTilePassState({
      pass: Cesium3DTilePass.RENDER,
      commandList: [], // Required by CesiumTilesetDerived.js
      camera: null, // Will be set during update
      cullingVolume: null, // Will be set during update
    });
  }

  /**
   * Create Cesium camera with proper vector calculations
   */
  private createCesiumCamera(): any {
    const babylonPos = this.camera.position;

    // Build an orthonormal basis that respects the radial up we set each frame
    // Babylon's forward points opposite Cesium's view direction; flip to keep frustum aligned
    const forward = this.camera.getDirection(Vector3.Forward().scale(-1)).normalize();
    const radialUp =
      babylonPos.lengthSquared() > 0 ? babylonPos.clone().normalize() : new Vector3(0, 1, 0);
    const rightVec = Vector3.Cross(radialUp, forward).normalize();
    const upVec = Vector3.Cross(forward, rightVec).normalize();

    // Pure coordinate transformation: Babylon → Cesium ECEF 
    const position = babylonToCesiumVec3(babylonPos);
    const direction = babylonToCesiumVec3(forward);
    const up = babylonToCesiumVec3(upVec);
    const right = babylonToCesiumVec3(rightVec);

    // Create frustum
    // Clamp far plane so the Babylon frustum doesn't include the far side of the Earth
    const earthRadius = Ellipsoid.WGS84.maximumRadius;
    const cappedFar = Math.min(this.camera.maxZ, earthRadius * 0.25);
    const frustum = new PerspectiveFrustum({
      fov: this.camera.fov,
      aspectRatio: this.engine.getRenderWidth() / this.engine.getRenderHeight(),
      near: this.camera.minZ, // Now consistent: both use 0.1
      far: cappedFar,
    });

    // Calculate cartographic position for geographic reference
    const positionCartographic = Cartographic.fromCartesian(position, Ellipsoid.WGS84);

    return {
      // Basic vectors
      position,
      direction,
      up,
      right,
      frustum,
      // World coordinate versions
      positionWC: position,
      directionWC: direction,
      upWC: up,
      rightWC: right,
      // Treat camera as stable so Cesium will refine instead of deferring while "moving"
      timeSinceMoved: Number.POSITIVE_INFINITY,
      positionWCDeltaMagnitude: 0.0,
      positionWCDeltaMagnitudeLastFrame: 0.0,
      // Additional properties from working commit
      positionCartographic: positionCartographic,
    };
  }

  /**
   * Load any Cesium Ion asset with default tileset configuration
   */
  async loadCesiumIonAsset(
    assetId: number,
    description: string = 'Cesium Ion Asset'
  ): Promise<void> {
    try {
      // Use standard Cesium Ion asset loading
      const resource = await IonResource.fromAssetId(assetId);

      const isGooglePhotorealistic = assetId === 2275207;
      const tilesetOptions: any = {
        show: true,
        shadows: 1,
        disableDynamicMapManager: true,
      };

      // Match createGooglePhotorealistic3DTileset defaults when using the Google tileset
      if (isGooglePhotorealistic) {
        tilesetOptions.cacheBytes = 1536 * 1024 * 1024;
        tilesetOptions.maximumCacheOverflowBytes = 1024 * 1024 * 1024;
        tilesetOptions.enableCollision = true;
      }

      this.cesiumTileset = (await CesiumTilesetDerived.fromUrl(resource, tilesetOptions)) as CesiumTilesetDerived;

      await this.cesiumTileset.readyPromise;
      // Use Cesium default maximumScreenSpaceError (16)
      // Keep adaptive refinements for Google tiles to smooth loading
      if (isGooglePhotorealistic) {
        if ('dynamicScreenSpaceError' in this.cesiumTileset) this.cesiumTileset.dynamicScreenSpaceError = true;
        if ('dynamicScreenSpaceErrorFactor' in this.cesiumTileset) (this.cesiumTileset as any).dynamicScreenSpaceErrorFactor = 12.0;
        if ('foveatedScreenSpaceError' in this.cesiumTileset) this.cesiumTileset.foveatedScreenSpaceError = true;
        if ('foveatedConeSize' in this.cesiumTileset) (this.cesiumTileset as any).foveatedConeSize = 0.2;
        if ('foveatedMinimumScreenSpaceErrorRelaxation' in this.cesiumTileset) {
          (this.cesiumTileset as any).foveatedMinimumScreenSpaceErrorRelaxation = 1.0;
        }
        if ('progressiveResolutionHeightFraction' in this.cesiumTileset) {
          this.cesiumTileset.progressiveResolutionHeightFraction = 0.3;
        }
      }

      this.debugVisualization = new DebugVisualization(this.babylonScene, this.cesiumTileset);
    } catch (error) {
      console.error(`Failed to load ${description}:`, error);
      throw error;
    }
  }

  /**
   * Update tileset with frame counting like working commit 72dfb2e
   */
  update(): void {
    if (!this.cesiumTileset) return;
    if (!this.cesiumTileset.root || !this.cesiumTileset.asset) return;

    // When paused, keep debug overlays using the last Cesium camera instead of live Babylon state
    if (this.debugVisualization?.isPaused && this.lastCameraState) {
      this.debugVisualization.updateVisualizations(this.lastCameraState, this.lastFrameNumber);
      return;
    }

    this.frameCount++;

    const camera = this.createCesiumCamera();

    let cullingVolume;
    try {
      // Restore culling volume computation - Cesium requires this for tile visibility
      cullingVolume = camera.frustum.computeCullingVolume(
        camera.position,
        camera.direction,
        camera.up
      );

      // Validate culling volume has required methods
      if (!cullingVolume || typeof cullingVolume.computeVisibilityWithPlaneMask !== 'function') {
        console.error('❌ Invalid culling volume - missing computeVisibilityWithPlaneMask method');
        return;
      }

      // DEBUG: Log culling volume properties for analysis
      // Removed frequent culling volume debug logging
    } catch (error) {
      console.error('❌ Failed to compute culling volume:', error);
      console.error('   This will break tile visibility - stopping update');
      return;
    }

    // Update pass state with current camera and culling volume
    this.renderTilesetPassState.camera = camera;
    this.renderTilesetPassState.cullingVolume = cullingVolume;

    // Complete frameState matching working commit 72dfb2e, using Cesium's default SSE
    const frameState = {
      camera: camera,
      context: {
        drawingBufferWidth: this.engine.getRenderWidth(),
        drawingBufferHeight: this.engine.getRenderHeight(),
      },
      cullingVolume: cullingVolume,
      mode: SceneMode.SCENE3D,
      frameNumber: this.frameCount,
      // CRITICAL: Add JulianDate time for BaseTraversal tile prioritization
      time: JulianDate.now(),
      // CESIUM EXACT: newFrame flag - true only for actual new frames
      newFrame: this.frameCount !== this.lastFrameNumber,
      // CRITICAL: Add pass information that SkipTraversal needs
      pass: (CesiumInternal as any).Pass ? (CesiumInternal as any).Pass.RENDER : 0,
      // Let Cesium use its default maximumScreenSpaceError for Google tiles
      tilesetPassState: this.renderTilesetPassState, // Required by CesiumTilesetDerived
      // CREDIT DISPLAY: Add credits as HTML comments once
      creditDisplay: {
        addCreditToNextFrame: (credit: any) => {
          this.addCreditToHTML(credit);
        },
      },
      // Additional properties from working commit 72dfb2e:
      pixelRatio: 1.0,
      verticalExaggeration: 1.0,
      verticalExaggerationRelativeHeight: 0.0,
      commandList: [],
      morphTime: 1.0,
      minimumTerrainHeight: -11000.0,
      // CRITICAL: Add afterRender function that SkipTraversal may need
      afterRender: [],
      mapProjection: new GeographicProjection(Ellipsoid.WGS84),
      occluder: (CesiumInternal as any).EllipsoidalOccluder
        ? new (CesiumInternal as any).EllipsoidalOccluder(Ellipsoid.WGS84, Cartesian3.ZERO)
        : undefined,
    };
    
    try {
      this.debugVisualization.updateVisualizations(camera, frameState.frameNumber);
      
      if (this.debugVisualization?.isPaused) {
        //Skip the rest if paused
        return;
      }

      // Set up load timestamp if needed (from prePassesUpdate)
      if (!(this.cesiumTileset as any)._loadTimestamp) {
        (this.cesiumTileset as any)._loadTimestamp = JulianDate.clone(frameState.time);
      }

      // Calculate time since load (from prePassesUpdate)
      const timeSinceLoad = Math.max(
        JulianDate.secondsDifference(
          frameState.time,
          (this.cesiumTileset as any)._loadTimestamp
        ) * 1000,
        0.0
      );
      (this.cesiumTileset as any)._timeSinceLoad = timeSinceLoad;

      // NATIVE CESIUM PATTERN: Follow exact sequence like native Cesium Scene
      // 1. prePassesUpdate() - processes tiles in PROCESSING state to READY
      (this.cesiumTileset as any).prePassesUpdate(frameState);
          
      // 2. main update() - traversal, selection, and content loading
      this.cesiumTileset.update(frameState);

      // 2.1. NATIVE CLEANUP PATTERN: Hide meshes for unselected tiles
      // This mimics Cesium's native behavior where unselected tiles don't render
      this.cleanupUnselectedTileMeshes(frameState.frameNumber);

      // 3. postPassesUpdate() - cleanup, request scheduling, cache management
      (this.cesiumTileset as any).postPassesUpdate(frameState);

      // 4. Apply transforms to selected tiles after Cesium processing
      this.applyTransformsToSelectedTiles();

      // 5. Update debug visualizations
      this.debugVisualization?.updateVisualizations(camera, frameState.frameNumber);
      this.lastCameraState = camera;
      this.lastFrameNumber = frameState.frameNumber;

      // 6. Throttled debug logging to inspect refinement without spamming
      if (this.frameCount % this.debugLogInterval === 0) {
        const selected = (this.cesiumTileset as any)._selectedTiles;
        const requested = (this.cesiumTileset as any)._requestedTiles;
        const maximumSSE = (this.cesiumTileset as any).maximumScreenSpaceError;
        const memoryAdjustedSSE = (this.cesiumTileset as any)._memoryAdjustedScreenSpaceError;
        const dynamicSSE = (this.cesiumTileset as any).dynamicScreenSpaceError;
        let minLevel = Number.POSITIVE_INFINITY;
        let maxLevel = -1;
        let maxTileSSE = 0;
        selected?.forEach((t: any) => {
          if (typeof t._level === 'number') {
            minLevel = Math.min(minLevel, t._level);
            maxLevel = Math.max(maxLevel, t._level);
          }
          const tileSSE = t._screenSpaceErrorProgressiveResolution ?? t._screenSpaceError ?? 0;
          if (tileSSE > maxTileSSE) maxTileSSE = tileSSE;
        });
        if (!Number.isFinite(minLevel)) minLevel = 0;
        console.log(
          `[Tileset dbg] frame=${this.frameCount} selected=${selected?.length ?? 0} requested=${requested?.length ?? 0} levels=${minLevel}-${maxLevel} maxTileSSE=${maxTileSSE.toFixed(
            2
          )} maxSSE=${maximumSSE} memAdjSSE=${memoryAdjustedSSE} dynamicSSE=${dynamicSSE}`
        );
      }
    } catch (error) {
      console.error('Error updating tileset:', error);
    }
  }

  /**
   * BABYLON.JS: Set up proper Cesium content factory to create BabylonTileContent
   */
  private setupBabylonContentFactory(): void {
    const Cesium3DTileContentFactory = (CesiumInternal as any).Cesium3DTileContentFactory;
    const babylonScene = this.camera.getScene();

    Cesium3DTileContentFactory.b3dm = function (
      tileset: any,
      tile: any,
      resource: any,
      arrayBuffer: ArrayBuffer,
      byteOffset: number
    ) {
      return SimpleBabylonTileContent.fromB3dm(
        tileset,
        tile,
        resource,
        arrayBuffer,
        byteOffset,
        babylonScene
      );
    };

    Cesium3DTileContentFactory.glb = function (
      tileset: any,
      tile: any,
      resource: any,
      arrayBuffer: ArrayBuffer,
      byteOffset: number
    ) {
      const glbData = arrayBuffer.slice(byteOffset);
      return SimpleBabylonTileContent.fromGltf(tileset, tile, resource, glbData, babylonScene);
    };
  }

  /**
   * CRITICAL FIX: Optimize RequestScheduler for Google 3D Tiles massive tile hierarchy
   */
  private optimizeRequestSchedulerForGoogle3DTiles(): void {
    const RequestScheduler = (CesiumInternal as any).RequestScheduler;
    if (!RequestScheduler) return;

    // Allow plenty of outstanding requests but avoid overwhelming the pipeline
    RequestScheduler.maximumRequests = 90;
    RequestScheduler.maximumRequestsPerServer = 32;

    if ('throttleRequests' in RequestScheduler) {
      RequestScheduler.throttleRequests = false;
    }

    const schedulerProps = ['requestDelayOnFailure', 'maximumRequestDelay', 'minimumRequestDelay'];
    schedulerProps.forEach((prop) => {
      if (prop in RequestScheduler && RequestScheduler[prop] > 100) {
        RequestScheduler[prop] = Math.min(100, RequestScheduler[prop] / 2);
      }
    });
  }

  /**
   * Clean up
   */
  destroy(): void {
    if (this.cesiumTileset && !this.cesiumTileset.isDestroyed()) {
      this.cesiumTileset.destroy();
    }
  }

  /**
   * NATIVE CESIUM CLEANUP PATTERN: Hide meshes for tiles not selected by Cesium
   * This follows the exact pattern discovered from Model3DTileContent research:
   * - Cesium only calls update() on selected tiles via updateTiles()
   * - For unselected tiles, we need to clean up and hide their meshes
   * - This mimics how Cesium's native models get hidden when their tiles aren't selected
   */
  private cleanupUnselectedTileMeshes(currentFrame: number): void {
    if (!this.cesiumTileset || !this.cesiumTileset.root) return;

    // Traverse all tiles with content to check their selection state
    const visitTile = (tile: any) => {
      if (
        tile._content &&
        tile._content.constructor.name === 'SimpleBabylonTileContent' &&
        typeof tile._content.checkAndHideIfNotSelected === 'function'
      ) {
        // Call the native cleanup pattern on each tile content
        tile._content.checkAndHideIfNotSelected(currentFrame);
      }

      // Recursively visit children
      if (tile.children && tile.children.length > 0) {
        tile.children.forEach(visitTile);
      }
    };

    // Start traversal from root
    visitTile(this.cesiumTileset.root);
  }

  /**
   * Apply transforms to selected tiles' meshes during render loop
   * This replaces the early transform application in SimpleBabylonTileContent
   */
  private applyTransformsToSelectedTiles(): void {
    if (!this.cesiumTileset || !(this.cesiumTileset as any)._selectedTiles) return;

    const selectedTiles = (this.cesiumTileset as any)._selectedTiles;

    // Apply transforms only to newly selected tiles to avoid redundant work
    selectedTiles.forEach((tile: any) => {
      if (
        tile._content &&
        tile._content.constructor.name === 'SimpleBabylonTileContent' &&
        typeof tile._content.getBabylonMeshes === 'function' &&
        typeof tile._content.getStoredTransform === 'function'
      ) {
        const meshes = tile._content.getBabylonMeshes();
        const cesiumTransform = tile._content.getStoredTransform() || tile.computedTransform;

        if (meshes.length > 0 && cesiumTransform && !tile._babylonTransformApplied) {
          this.applyTransformToMeshes(meshes, cesiumTransform);
          tile._babylonTransformApplied = true;
        }
      }
    });
  }

  /**
   * Apply Cesium transform matrix to Babylon meshes
   */
  private applyTransformToMeshes(meshes: any[], cesiumTransform: any): void {
    try {
      const babylonMatrix = cesiumMatrixToBabylonMatrix(cesiumTransform);

      // Apply the transform to all meshes
      meshes.forEach((mesh) => {
        if (mesh && mesh.setPreTransformMatrix) {
          mesh.setPreTransformMatrix(babylonMatrix);
        } else if (mesh) {
          // Fallback: directly set the world matrix
          mesh.setAbsolutePosition(Vector3.Zero());
          mesh.freezeWorldMatrix(babylonMatrix);
        }
      });

      // Silent transform application (depth=${tile._depth}, meshes=${meshes.length})
    } catch (error) {
      console.error('❌ Failed to apply transform in render loop:', error);
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.debugVisualization?.dispose();
  }
}
