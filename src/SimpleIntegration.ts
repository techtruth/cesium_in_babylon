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

// Use the derived Cesium3DTileset implementation (shim from upstream PR)
// @ts-expect-error: derived Cesium tileset is plain JS without types
import CesiumTilesetDerived from './cesium_derived/Cesium3DTileset.js';

import { DebugVisualization } from './DebugVisualization';

/**
 * Simple Cesium + Babylon integration - trust Cesium completely
 */
export class SimpleIntegration {
  private camera: Camera;
  private engine: Engine;
  private babylonScene: any;
  private ellipsoid: Ellipsoid;
  private cesiumTileset?: CesiumTilesetDerived;
  private renderTilesetPassState: any;
  private frameCount: number = 0;
  private lastFrameNumber: number = 0;
  private lastCameraState: any;
  private lastCameraPosition?: Cartesian3;
  private lastCameraDelta: number = 0.0;
  private lastMovementTimestamp: number = Date.now();
  private debugVisualization!: DebugVisualization;
  private addedCredits: Set<string> = new Set();

  private addCreditToHTML(credit: any): void {
    const creditText = credit.text || credit.html || credit.toString();
    if (creditText && !this.addedCredits.has(creditText)) {
      this.addedCredits.add(creditText);
      const comment = document.createComment(` Credit: ${creditText} `);
      document.head.appendChild(comment);
    }
  }

  constructor(babylonScene: any, camera: Camera, engine: Engine, ellipsoid: Ellipsoid = Ellipsoid.WGS84) {
    this.camera = camera;
    this.engine = engine;
    this.babylonScene = babylonScene;
    this.ellipsoid = ellipsoid;
    // Keep Babylon FOV vertical so it matches Cesium's expectation
    this.camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;

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
      commandList: [], // keep for compatibility
      camera: null, // Will be set during update
      cullingVolume: null, // Will be set during update
    });
  }

  /**
   * Create Cesium camera with proper vector calculations
   */
  private createCesiumCamera(): any {
    const babylonPos = this.camera.position;
    const babylonTarget = (this.camera as any).getTarget ? (this.camera as any).getTarget() : null;
    let lookDir = babylonTarget ? babylonTarget.subtract(babylonPos) : this.camera.getDirection(Vector3.Forward());
    if (lookDir.lengthSquared() === 0) {
      // Fallback to camera forward if target direction is degenerate
      lookDir = this.camera.getDirection(Vector3.Forward());
      if (lookDir.lengthSquared() === 0) {
        lookDir = Vector3.Forward();
      }
    }
    const forward = lookDir.normalize();

    const upVec = (this.camera as any).upVector ? (this.camera as any).upVector.clone() : Vector3.Up();
    let rightVec = Vector3.Cross(forward, upVec);
    if (rightVec.lengthSquared() === 0) {
      // If forward and up are parallel, pick a default right
      rightVec = Vector3.Right();
    }
    rightVec = rightVec.normalize();
    // Re-orthogonalize up to ensure a proper basis
    const correctedUp = Vector3.Cross(rightVec, forward).normalize();

    // Pure coordinate transformation: Babylon → Cesium ECEF 
    const position = babylonToCesiumVec3(babylonPos);
    const direction = babylonToCesiumVec3(forward);
    const up = babylonToCesiumVec3(correctedUp);
    const right = babylonToCesiumVec3(rightVec);

    // Track motion for Cesium's request throttling logic
    const nowMs = Date.now();
    const previousDeltaRaw = this.lastCameraDelta;
    const deltaMagnitudeRaw = this.lastCameraPosition
      ? Cartesian3.distance(position, this.lastCameraPosition)
      : 0.0;
    this.lastCameraPosition = Cartesian3.clone(position);
    // Treat sub-meter jitter as stationary so tiny tiles are not culled while "moving"
    const effectiveDelta = deltaMagnitudeRaw < 5 ? 0.0 : deltaMagnitudeRaw;
    const previousDelta = previousDeltaRaw < 5 ? 0.0 : previousDeltaRaw;
    if (effectiveDelta > 0.0) {
      this.lastMovementTimestamp = nowMs;
    }
    // Persist the effective delta so "last frame" decays as soon as motion stops
    this.lastCameraDelta = effectiveDelta;

    // Use render buffer size for frustum aspect to match Cesium expectations
    const renderWidth = this.engine.getRenderWidth();
    const renderHeight = this.engine.getRenderHeight();

    // Create frustum directly from Babylon camera values
    const ellipsoid = this.ellipsoid ?? Ellipsoid.WGS84;
    // Cap far plane for Earth to avoid overdraw/culling very distant tiles
    const isEarth = ellipsoid === Ellipsoid.WGS84;
    const earthCap = isEarth ? ellipsoid.maximumRadius * 0.5 : this.camera.maxZ;
    const cappedFar = Math.min(this.camera.maxZ, earthCap);
    // Derive vertical FOV + aspect directly from the active Babylon projection matrix
    // With vertical FOV mode, we can feed Cesium directly
    const aspectRatio = renderWidth / renderHeight;
    // Pad horizontal FOV so fringe tiles stay selected on wide viewports
    const edgePad = 1.4; // widen by ~40% to combat edge culling
    const baseHorizontalFov = 2 * Math.atan(Math.tan(this.camera.fov * 0.5) * aspectRatio);
    const paddedHorizontalFov = baseHorizontalFov * edgePad;
    const aspectPad = 1.12; // stronger aspect inflate to push culling volume outward
    const paddedVerticalFov = 2 * Math.atan(Math.tan(paddedHorizontalFov * 0.5) / (aspectRatio * aspectPad));
    const frustum = new PerspectiveFrustum({
      fov: paddedVerticalFov,
      aspectRatio: aspectRatio * aspectPad,
      near: this.camera.minZ,
      far: cappedFar,
    });

    // Calculate cartographic position for geographic reference
    const positionCartographic = Cartographic.fromCartesian(position, ellipsoid);

    const timeSinceMovedSec = Math.max((nowMs - this.lastMovementTimestamp) / 1000, 0);

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
      // CRITICAL: Camera movement detection properties for tile refinement
      timeSinceMoved: timeSinceMovedSec,
      positionWCDeltaMagnitude: effectiveDelta,
      positionWCDeltaMagnitudeLastFrame: previousDelta,
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

      const tilesetOptions: any = {
        show: true,
        shadows: 1,
        disableDynamicMapManager: true,
        // Rely on Cesium defaults for photorealistic Google tiles
        // (no skip LOD overrides, no preload overrides, default foveated SSE)
      };

      this.cesiumTileset = (await CesiumTilesetDerived.fromUrl(resource, tilesetOptions)) as CesiumTilesetDerived;

      await this.cesiumTileset.readyPromise;
      // Bias toward refining visible tiles more aggressively
      try {
        // Use Cesium default SSE; rely on dynamic/foveated biasing for detail
        (this.cesiumTileset as any).maximumScreenSpaceError = 16;
        (this.cesiumTileset as any).dynamicScreenSpaceError = true;
        (this.cesiumTileset as any).dynamicScreenSpaceErrorFactor = 24.0;
        (this.cesiumTileset as any).progressiveResolutionHeightFraction = 0.3;
        (this.cesiumTileset as any).foveatedScreenSpaceError = true;
        // Restore request culling defaults while moving
        (this.cesiumTileset as any).cullRequestsWhileMoving = true;
        (this.cesiumTileset as any).cullRequestsWhileMovingMultiplier = 60.0;
        (this.cesiumTileset as any).cullWithChildrenBounds = true;
        (this.cesiumTileset as any).skipLevelOfDetail = false;
        (this.cesiumTileset as any).immediatelyLoadDesiredLevelOfDetail = false;
        (this.cesiumTileset as any).preloadSiblings = false;
        (this.cesiumTileset as any).preloadAncestors = false;
        (this.cesiumTileset as any).preloadWhenHidden = false;
        (this.cesiumTileset as any).loadSiblings = false;
      } catch (e) {
        console.warn('Could not adjust tileset selection properties:', e);
      }

      // Log tile load failures to diagnose missing content
      try {
        (this.cesiumTileset as any).tileFailed.addEventListener((evt: any) => {
          const url = evt?.url ?? evt?.url?.url;
          const status = evt?.error?.statusCode || evt?.error?.status;
          const message = evt?.error?.message || evt?.error;
          console.error('[TileFailed]', status, url, message);
        });
      } catch (e) {
        console.warn('Could not attach tileFailed listener:', e);
      }

      this.debugVisualization = new DebugVisualization(this.babylonScene, this.cesiumTileset, this.ellipsoid);
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

    const camera = this.createCesiumCamera();
    const ellipsoid = this.ellipsoid ?? Ellipsoid.WGS84;

    let cullingVolume;
    try {
      // Restore culling volume computation - Cesium requires this for tile visibility
      cullingVolume = camera.frustum.computeCullingVolume(
        camera.position,
        camera.direction,
        camera.up
      );

      // Keep frustum planes as computed

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
    const frameNumber = ++this.frameCount;
    const EllipsoidalOccluder = (CesiumInternal as any).EllipsoidalOccluder;
    const occluder = EllipsoidalOccluder ? new EllipsoidalOccluder(ellipsoid) : undefined;
    const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    const frameState = {
      camera: camera,
      context: {
        drawingBufferWidth: this.engine.getRenderWidth(),
        drawingBufferHeight: this.engine.getRenderHeight(),
      },
      cullingVolume: cullingVolume,
      mode: SceneMode.SCENE3D,
      frameNumber: frameNumber,
      // CRITICAL: Add JulianDate time for BaseTraversal tile prioritization
      time: JulianDate.now(),
      // CESIUM EXACT: newFrame flag - true only for actual new frames
      newFrame: frameNumber !== this.lastFrameNumber,
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
      pixelRatio,
      verticalExaggeration: 1.0,
      verticalExaggerationRelativeHeight: 0.0,
      commandList: [],
      morphTime: 1.0,
      minimumTerrainHeight: -11000.0,
      // CRITICAL: Add afterRender function that SkipTraversal may need
      afterRender: [],
      // Use planet-specific ellipsoid for projection to align culling with the active body
      mapProjection: new GeographicProjection(this.ellipsoid),
      occluder,
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
      // Ensure RequestScheduler advances when throttling is enabled
      const RequestScheduler = (CesiumInternal as any).RequestScheduler;
      if (RequestScheduler && typeof RequestScheduler.update === 'function') {
        RequestScheduler.update();
      }
      (this.cesiumTileset as any).prePassesUpdate(frameState);

      // 1.5 Clear all visibility; only tiles selected this frame will re-enable in their update()
      this.hideAllTileMeshes();

      // 2. main update() - traversal, selection, and content loading
      this.cesiumTileset.update(frameState);

      // 2.1 Show only the tiles selected this frame that are ready
      const selectedSet = new Set((this.cesiumTileset as any)._selectedTiles || []);
      const readySelected = new Set<any>();
      selectedSet.forEach((tile: any) => {
        const content = tile?._content;
        const meshes = content?.getBabylonMeshes?.() || [];
        if (content?.ready && meshes.length > 0) {
          readySelected.add(tile);
        }
      });
    
      // Debug selection counts to understand missing tiles (disabled)
      // if (this.frameCount % this.debugLogInterval === 0) { ... }

      // 3. postPassesUpdate() - cleanup, request scheduling, cache management
      (this.cesiumTileset as any).postPassesUpdate(frameState);

      // 4. Apply transforms to selected tiles after Cesium processing
      this.applyTransformsToSelectedTiles();

      // 5. Update debug visualizations
      //this.debugVisualization?.updateVisualizations(camera, frameState.frameNumber);
      this.lastCameraState = camera;
      this.lastFrameNumber = frameState.frameNumber;
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

    // Restore Cesium defaults for request scheduling
    RequestScheduler.maximumRequests = 10;
    RequestScheduler.maximumRequestsPerServer = 6;
    RequestScheduler.throttleRequests = true;
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
   * Disable all tile meshes; selected tiles will re-enable during their update() call.
   */
  private hideAllTileMeshes(): void {
    const ts: any = this.cesiumTileset as any;
    if (!ts) return;

    // Use Cesium's active tile buckets to disable known tile meshes
    const buckets: any[] = [];
    ['_selectedTiles', '_requestedTiles', '_requestedTilesInFlight', '_processingQueue', '_emptyTiles'].forEach(
      (name) => {
        const arr = ts[name];
        if (Array.isArray(arr)) buckets.push(...arr);
      }
    );

    const seen = new Set<any>();
    for (let i = 0; i < buckets.length; i++) {
      const tile = buckets[i];
      if (!tile || seen.has(tile)) continue;
      seen.add(tile);
      const content = tile._content;
      if (content && typeof content.getBabylonMeshes === 'function') {
        const meshes = content.getBabylonMeshes() || [];
        meshes.forEach((m: any) => m?.setEnabled && m.setEnabled(false));
      }
    }
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
