import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';

export class DebugVisualization {
  private babylonScene: Scene;
  private cesiumTileset: any;

  private cameraUpdatePaused = false;
  private boundingVolumesVisible = false;
  private frustumVisible = false;

  private frustumVisualization: any = null;
  private boundingVolumeWireframes: any[] = [];
  private frustumWireframes: any[] = [];
  private lastFrustumUpdate = 0;

  constructor(babylonScene: Scene, cesiumTileset: any) {
    this.babylonScene = babylonScene;
    this.cesiumTileset = cesiumTileset;
    this.setupKeyboardControls();
  }

  private setupKeyboardControls(): void {
    document.addEventListener('keydown', (event) => {
      switch (event.key.toLowerCase()) {
        case ' ':
          event.preventDefault();
          this.toggleCameraStepMode();
          break;
        case 'b':
          event.preventDefault();
          this.toggleBoundingVolumeVisibility();
          break;
        case 'f':
          event.preventDefault();
          this.toggleFrustumVisibility();
          break;
      }
    });
  }

  get isPaused(): boolean {
    return this.cameraUpdatePaused;
  }

  private toggleCameraStepMode(): void {
    this.cameraUpdatePaused = !this.cameraUpdatePaused;
    console.log(this.cameraUpdatePaused ? '⏸️ Camera paused' : '▶️ Camera resumed');
  }

  private toggleBoundingVolumeVisibility(): void {
    this.boundingVolumesVisible = !this.boundingVolumesVisible;
    console.log(this.boundingVolumesVisible ? '🔳 Bounding volumes on' : '🔳 Bounding volumes off');

    if (this.boundingVolumesVisible) {
      this.createBoundingVolumeWireframes();
    } else {
      this.clearBoundingVolumeWireframes();
    }
  }

  private toggleFrustumVisibility(): void {
    this.frustumVisible = !this.frustumVisible;
    console.log(this.frustumVisible ? '🔲 Frustum on' : '🔲 Frustum off');

    if (this.frustumVisible) {
      this.createFrustumWireframe();
    } else {
      this.clearFrustumWireframes();
    }
  }

  updateVisualizations(camera: any, frameNumber: number): void {
    if (this.frustumVisible) {
      this.updateFrustumVisualization(camera, frameNumber);
    }
  }

  private updateFrustumVisualization(camera: any, frameNumber: number): void {
    if (frameNumber - this.lastFrustumUpdate > 60) {
      this.lastFrustumUpdate = frameNumber;
      this.visualizeCesiumFrustum(camera, camera.frustum);
    }
  }

  private visualizeCesiumFrustum(cesiumCamera: any, frustum: any): void {
    try {
      if (this.frustumVisualization) {
        this.frustumVisualization.dispose();
        this.frustumVisualization = null;
      }

      if (!this.babylonScene) return;

      const corners = this.getFrustumCorners(cesiumCamera, frustum);
      const babylonCorners = corners.map((corner) => new Vector3(corner.x, corner.z, -corner.y));

      this.frustumVisualization = MeshBuilder.CreateBox(
        'frustumViz',
        { size: 0.1 },
        this.babylonScene
      );
      this.frustumVisualization.setEnabled(false);

      const frustumMaterial = new StandardMaterial('frustumMaterial', this.babylonScene);
      frustumMaterial.emissiveColor = new Color3(1, 0, 1);
      frustumMaterial.disableLighting = true;
      frustumMaterial.backFaceCulling = false;

      this.drawFrustumLines(babylonCorners, frustumMaterial, this.babylonScene);
    } catch (error) {
      console.error('❌ Failed to create frustum visualization:', error);
    }
  }

  private getFrustumCorners(cesiumCamera: any, frustum: any): any[] {
    const position = cesiumCamera.position;
    const direction = cesiumCamera.direction;
    const up = cesiumCamera.up;
    const right = cesiumCamera.right;

    const nearHeight = 2 * Math.tan(frustum.fov / 2) * frustum.near;
    const nearWidth = nearHeight * frustum.aspectRatio;
    const farHeight = 2 * Math.tan(frustum.fov / 2) * frustum.far;
    const farWidth = farHeight * frustum.aspectRatio;

    const nearCenter = {
      x: position.x + direction.x * frustum.near,
      y: position.y + direction.y * frustum.near,
      z: position.z + direction.z * frustum.near,
    };

    const farCenter = {
      x: position.x + direction.x * frustum.far,
      y: position.y + direction.y * frustum.far,
      z: position.z + direction.z * frustum.far,
    };

    return [
      position,
      {
        x: nearCenter.x - (right.x * nearWidth) / 2 - (up.x * nearHeight) / 2,
        y: nearCenter.y - (right.y * nearWidth) / 2 - (up.y * nearHeight) / 2,
        z: nearCenter.z - (right.z * nearWidth) / 2 - (up.z * nearHeight) / 2,
      },
      {
        x: nearCenter.x + (right.x * nearWidth) / 2 - (up.x * nearHeight) / 2,
        y: nearCenter.y + (right.y * nearWidth) / 2 - (up.y * nearHeight) / 2,
        z: nearCenter.z + (right.z * nearWidth) / 2 - (up.z * nearHeight) / 2,
      },
      {
        x: nearCenter.x + (right.x * nearWidth) / 2 + (up.x * nearHeight) / 2,
        y: nearCenter.y + (right.y * nearWidth) / 2 + (up.y * nearHeight) / 2,
        z: nearCenter.z + (right.z * nearWidth) / 2 + (up.z * nearHeight) / 2,
      },
      {
        x: nearCenter.x - (right.x * nearWidth) / 2 + (up.x * nearHeight) / 2,
        y: nearCenter.y - (right.y * nearWidth) / 2 + (up.y * nearHeight) / 2,
        z: nearCenter.z - (right.z * nearWidth) / 2 + (up.z * nearHeight) / 2,
      },
      {
        x: farCenter.x - (right.x * farWidth) / 2 - (up.x * farHeight) / 2,
        y: farCenter.y - (right.y * farWidth) / 2 - (up.y * farHeight) / 2,
        z: farCenter.z - (right.z * farWidth) / 2 - (up.z * farHeight) / 2,
      },
      {
        x: farCenter.x + (right.x * farWidth) / 2 - (up.x * farHeight) / 2,
        y: farCenter.y + (right.y * farWidth) / 2 - (up.y * farHeight) / 2,
        z: farCenter.z + (right.z * farWidth) / 2 - (up.z * farHeight) / 2,
      },
      {
        x: farCenter.x + (right.x * farWidth) / 2 + (up.x * farHeight) / 2,
        y: farCenter.y + (right.y * farWidth) / 2 + (up.y * farHeight) / 2,
        z: farCenter.z + (right.z * farWidth) / 2 + (up.z * farHeight) / 2,
      },
      {
        x: farCenter.x - (right.x * farWidth) / 2 + (up.x * farHeight) / 2,
        y: farCenter.y - (right.y * farWidth) / 2 + (up.y * farHeight) / 2,
        z: farCenter.z - (right.z * farWidth) / 2 + (up.z * farHeight) / 2,
      },
    ];
  }

  private drawFrustumLines(
    babylonCorners: Vector3[],
    _material: StandardMaterial,
    scene: Scene
  ): void {
    try {
      const nearIndices = [1, 2, 3, 4, 1];
      const farIndices = [5, 6, 7, 8, 5];
      const connectionIndices = [
        [1, 5],
        [2, 6],
        [3, 7],
        [4, 8],
      ];

      [nearIndices, farIndices].forEach((indices, groupIndex) => {
        for (let i = 0; i < indices.length - 1; i++) {
          const line = MeshBuilder.CreateLines(
            `frustumLine_${groupIndex}_${i}`,
            { points: [babylonCorners[indices[i]], babylonCorners[indices[i + 1]]] },
            scene
          );
          line.color = Color3.FromHexString('#ff00ff');
          line.parent = this.frustumVisualization;
          line.setEnabled(true);
        }
      });

      connectionIndices.forEach(([start, end], i) => {
        const line = MeshBuilder.CreateLines(
          `frustumConnection_${i}`,
          { points: [babylonCorners[start], babylonCorners[end]] },
          scene
        );
        line.color = Color3.FromHexString('#ff00ff');
        line.parent = this.frustumVisualization;
        line.setEnabled(true);
      });

      const directionLine = MeshBuilder.CreateLines(
        'frustumDirection',
        { points: [babylonCorners[0], babylonCorners[1]] },
        scene
      );
      directionLine.color = Color3.FromHexString('#00ffff');
      directionLine.parent = this.frustumVisualization;
      directionLine.setEnabled(true);

      this.frustumVisualization.setEnabled(true);
    } catch (error) {
      console.error('❌ Failed to draw frustum lines:', error);
    }
  }

  private createBoundingVolumeWireframes(): void {
    const selectedTiles = this.cesiumTileset._selectedTiles;
    if (!selectedTiles?.length) return;

    selectedTiles.forEach((tile: any, index: number) => {
      const boundingVolume = tile.boundingVolume;
      if (!boundingVolume?.boundingSphere) return;

      const sphere = boundingVolume.boundingSphere;
      const cesiumCenter = sphere.center;
      const cesiumRadius = sphere.radius;

      const babylonCenter = new Vector3(cesiumCenter.x, cesiumCenter.z, -cesiumCenter.y);

      const wireframeSphere = MeshBuilder.CreateSphere(
        `boundingVolume_${index}`,
        { diameter: cesiumRadius * 2, segments: 8 },
        this.babylonScene
      );
      wireframeSphere.position = babylonCenter;

      const material = new StandardMaterial(`boundingMaterial_${index}`, this.babylonScene);
      material.wireframe = true;
      const depthNormalized = Math.min(tile._depth / 10, 1);
      // Dark red (0.8, 0.1, 0.1) to light blue (0.3, 0.8, 1.0)
      const red = 0.8 - depthNormalized * 0.5; // 0.8 -> 0.3
      const green = 0.1 + depthNormalized * 0.7; // 0.1 -> 0.8
      const blue = 0.1 + depthNormalized * 0.9; // 0.1 -> 1.0
      material.emissiveColor = new Color3(red, green, blue);
      material.disableLighting = true;
      wireframeSphere.material = material;

      this.boundingVolumeWireframes.push(wireframeSphere);
    });
  }

  private clearBoundingVolumeWireframes(): void {
    this.boundingVolumeWireframes.forEach((wireframe) => {
      wireframe.material?.dispose();
      wireframe.dispose();
    });
    this.boundingVolumeWireframes = [];
  }

  private createFrustumWireframe(): void {
    // Implementation for separate frustum wireframe if needed
  }

  private clearFrustumWireframes(): void {
    this.frustumWireframes.forEach((wireframe) => {
      wireframe.dispose();
    });
    this.frustumWireframes = [];
  }

  dispose(): void {
    this.clearBoundingVolumeWireframes();
    this.clearFrustumWireframes();
    if (this.frustumVisualization) {
      this.frustumVisualization.dispose();
      this.frustumVisualization = null;
    }
  }
}
