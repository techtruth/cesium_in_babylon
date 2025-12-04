import { Camera, Engine, Vector3, Matrix } from '@babylonjs/core';
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

//This can go away after PR to cesium is accepted
//import CesiumTilesetDerived from './cesium_derived/CesiumTilesetDerived.js';
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

    // For UniversalCamera, get the actual look direction from position to target
    const babylonTarget = (this.camera as any).getTarget();
    const babylonDir = babylonTarget.subtract(babylonPos).normalize();
    const babylonUp = this.camera.upVector || Vector3.Up();

    // Simple coordinate transformation: Babylon → Cesium ECEF
    const position = new Cartesian3(babylonPos.x, -babylonPos.z, babylonPos.y);

    // Transform direction vector (from camera toward target)
    const direction = new Cartesian3(babylonDir.x, -babylonDir.z, babylonDir.y);
    Cartesian3.normalize(direction, direction);

    const up = new Cartesian3(babylonUp.x, -babylonUp.z, babylonUp.y);
    Cartesian3.normalize(up, up);

    // Calculate right vector
    const right = new Cartesian3();
    Cartesian3.cross(direction, up, right);
    Cartesian3.normalize(right, right);

    // Recalculate up to ensure orthogonality
    Cartesian3.cross(right, direction, up);
    Cartesian3.normalize(up, up);

    // Create frustum
    const frustum = new PerspectiveFrustum({
      fov: this.camera.fov,
      aspectRatio: this.engine.getRenderWidth() / this.engine.getRenderHeight(),
      near: this.camera.minZ, // Now consistent: both use 0.1
      far: this.camera.maxZ,
    });

    // Calculate cartographic position for geographic reference
    const positionCartographic = Cartographic.fromCartesian(
      position,
      Ellipsoid.WGS84
    );

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
      timeSinceMoved: 0.0, // Just moved, trigger tile refinement
      positionWCDeltaMagnitude: 1000.0, // Significant movement detected
      positionWCDeltaMagnitudeLastFrame: 0.0, // Previous frame delta
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

      this.cesiumTileset = (await CesiumTilesetDerived.fromUrl(resource, {
        show: true,
        shadows: 1,
        disableDynamicMapManager: true
      })) as CesiumTilesetDerived;

      await this.cesiumTileset.readyPromise;

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
    this.frameCount++;

    if (!this.cesiumTileset) return;
    if (!this.cesiumTileset.root || !this.cesiumTileset.asset) return;

    // Check if camera updates are paused (spacebar control)
    if (this.debugVisualization?.isPaused) {
      return; // Skip update when paused
    }

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
      frameNumber: ++this.frameCount,
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
      mapProjection: new GeographicProjection(),
      verticalExaggeration: 1.0,
      verticalExaggerationRelativeHeight: 0.0,
      commandList: [],
      morphTime: 1.0,
      minimumTerrainHeight: -11000.0,
      occluder: undefined, // Cesium will populate if needed
      // CRITICAL: Add afterRender function that SkipTraversal may need
      afterRender: [],
    };

    try {
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
      if (typeof (this.cesiumTileset as any).prePassesUpdate === 'function') {
        (this.cesiumTileset as any).prePassesUpdate(frameState);
      }

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

      // Update frame tracking for next frame
      this.lastFrameNumber = this.frameCount;
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

    RequestScheduler.maximumRequests = 100;
    RequestScheduler.maximumRequestsPerServer = 36;

    if ('throttleRequests' in RequestScheduler && RequestScheduler.throttleRequests !== false) {
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
      // Convert Cesium's Matrix4 to Babylon's Matrix
      // Cesium uses column-major matrices, Babylon uses row-major
      const cesiumArray = cesiumTransform;

      // Convert Cesium column-major Matrix4 to Babylon row-major Matrix (transpose)
      const babylonMatrix = Matrix.FromArray([
        cesiumArray[0],
        cesiumArray[4],
        cesiumArray[8],
        cesiumArray[12],
        cesiumArray[1],
        cesiumArray[5],
        cesiumArray[9],
        cesiumArray[13],
        cesiumArray[2],
        cesiumArray[6],
        cesiumArray[10],
        cesiumArray[14],
        cesiumArray[3],
        cesiumArray[7],
        cesiumArray[11],
        cesiumArray[15],
      ]);

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
