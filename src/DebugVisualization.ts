import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh, DynamicTexture } from '@babylonjs/core';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Ellipsoid } from 'cesium';
import { cesiumToBabylonVec3 } from './coordUtils';

export class DebugVisualization {
  private babylonScene: Scene;
  private cesiumTileset: any;

  private cameraUpdatePaused = false;
  private boundingVolumesVisible = false;
  private frustumVisible = false;
  private referenceObjectsVisible = false;
  private cameraOrientationVisible = false;

  private frustumVisualization: any = null;
  private boundingVolumeWireframes: any[] = [];
  private frustumWireframes: any[] = [];
  private frustumPlanes: any[] = [];
  private cameraOrientationLines: any[] = [];
  private lastFrustumUpdate = 0;
  private axisMarkers: Mesh[] = [];
  private axisLabels: Mesh[] = [];

  constructor(babylonScene: Scene, cesiumTileset: any) {
    this.babylonScene = babylonScene;
    this.cesiumTileset = cesiumTileset;
    this.setupKeyboardControls();
    this.createReferenceObjects();
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
        case 't':
          event.preventDefault();
          this.toggleReferenceObjectsVisibility();
          break;
        case 'c':
          event.preventDefault();
          this.toggleCameraOrientationVisibility();
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
      this.ensureAxisMarkers();
      this.createFrustumWireframe();
    } else {
      this.clearFrustumWireframes();
      this.clearFrustumPlanes();
      this.clearAxisMarkers();
    }
  }

  private toggleReferenceObjectsVisibility(): void {
    this.referenceObjectsVisible = !this.referenceObjectsVisible;
    console.log(this.referenceObjectsVisible ? '🌍 Reference objects visible' : '🌍 Reference objects hidden');

    // Find and toggle all reference objects
    const referenceObjectNames = ['earthSphere', 'skyBarrier', 'centerSphere', 'northPole', 'southPole'];
    
    referenceObjectNames.forEach(name => {
      const mesh = this.babylonScene.getMeshByName(name);
      if (mesh) {
        mesh.setEnabled(this.referenceObjectsVisible);
      }
    });
  }

  private toggleCameraOrientationVisibility(): void {
    this.cameraOrientationVisible = !this.cameraOrientationVisible;
    console.log(this.cameraOrientationVisible ? '📹 Camera orientation on' : '📹 Camera orientation off');

    if (!this.cameraOrientationVisible) {
      this.clearCameraOrientationLines();
      this.clearAxisMarkers();
    }
  }

  private createReferenceObjects(): void {
    const earthRadius = Ellipsoid.WGS84.maximumRadius; // Earth ellipsoid radius

    // Earth sphere (hidden wireframe)
    const marsSphere = MeshBuilder.CreateSphere(
      'earthSphere',
      { diameter: earthRadius * 2, segments: 64 },
      this.babylonScene
    );
    marsSphere.position = Vector3.Zero();
    marsSphere.setEnabled(false);
    const marsMaterial = new StandardMaterial('earthMaterial', this.babylonScene);
    marsMaterial.diffuseColor = new Color3(0.3, 0.5, 0.9); // Earth-ish color
    marsMaterial.emissiveColor = new Color3(0.1, 0.2, 0.4);
    marsMaterial.wireframe = true;
    marsSphere.material = marsMaterial;

    // Sky barrier (hidden) - scaled by 2x
    const skyBarrierRadius = earthRadius * 2;
    const skyBarrier = MeshBuilder.CreateSphere(
      'skyBarrier',
      { diameter: skyBarrierRadius * 2, segments: 32 },
      this.babylonScene
    );
    skyBarrier.position = Vector3.Zero();
    skyBarrier.setEnabled(false);
    const skyMaterial = new StandardMaterial('skyMaterial', this.babylonScene);
    skyMaterial.diffuseColor = new Color3(0.8, 0.2, 0.2);
    skyMaterial.emissiveColor = new Color3(0.1, 0.05, 0.05);
    skyMaterial.wireframe = true;
    skyMaterial.alpha = 0.3;
    skyBarrier.material = skyMaterial;

    // Center reference sphere (green wireframe)
    const centerSphere = MeshBuilder.CreateSphere('centerSphere', { diameter: 100000 }, this.babylonScene);
    centerSphere.position = Vector3.Zero();
    const centerMaterial = new StandardMaterial('centerMaterial', this.babylonScene);
    centerMaterial.diffuseColor = new Color3(0, 1, 0);
    centerMaterial.emissiveColor = new Color3(0, 0.5, 0);
    centerMaterial.wireframe = true;
    centerMaterial.backFaceCulling = false;
    centerSphere.material = centerMaterial;

    // North pole marker (white box)
    const northPole = MeshBuilder.CreateBox('northPole', { size: 5000000 }, this.babylonScene);
    northPole.position = new Vector3(0, 10000000, 0);
    const northMaterial = new StandardMaterial('northMaterial', this.babylonScene);
    northMaterial.diffuseColor = new Color3(1, 1, 1);
    northMaterial.emissiveColor = new Color3(0.5, 0.5, 0.5);
    northPole.material = northMaterial;

    // South pole marker (blue box)
    const southPole = MeshBuilder.CreateBox('southPole', { size: 5000000 }, this.babylonScene);
    southPole.position = new Vector3(0, -10000000, 0);
    const southMaterial = new StandardMaterial('southMaterial', this.babylonScene);
    southMaterial.diffuseColor = new Color3(0, 0, 1);
    southMaterial.emissiveColor = new Color3(0, 0, 0.5);
    southPole.material = southMaterial;
  }

  private ensureAxisMarkers(): void {
    if (this.axisMarkers.length) return;
    const specs = [
      { name: 'axis_forward', color: new Color3(0.2, 1, 0.2), label: '+F' }, // forward
      { name: 'axis_back', color: new Color3(0.2, 1, 0.2), label: '-F' },    // back
      { name: 'axis_right', color: new Color3(0.2, 0.4, 1), label: '+R' },   // right
      { name: 'axis_left', color: new Color3(0.2, 0.4, 1), label: '-R' },    // left
      { name: 'axis_up', color: new Color3(1, 0.2, 0.2), label: '+U' },      // up
      { name: 'axis_down', color: new Color3(1, 0.2, 0.2), label: '-U' },    // down
    ];

    specs.forEach((spec) => {
      const sphere = MeshBuilder.CreateSphere(spec.name, { diameter: 50 }, this.babylonScene);
      const mat = new StandardMaterial(`${spec.name}_mat`, this.babylonScene);
      mat.emissiveColor = spec.color;
      mat.diffuseColor = spec.color;
      mat.specularColor = new Color3(0, 0, 0);
      sphere.material = mat;
      sphere.isPickable = false;
      sphere.setEnabled(true);
      this.axisMarkers.push(sphere);

      // Billboard label
      const plane = MeshBuilder.CreatePlane(`${spec.name}_label`, { size: 60 }, this.babylonScene);
      plane.parent = sphere;
      plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
      plane.position = new Vector3(0, 60, 0);
      const tex = new DynamicTexture(`${spec.name}_dt`, { width: 256, height: 256 }, this.babylonScene, true);
      tex.hasAlpha = true;
      tex.drawText(spec.label, 80, 170, 'bold 120px Arial', '#ffffff', 'transparent', true);
      const labelMat = new StandardMaterial(`${spec.name}_label_mat`, this.babylonScene);
      labelMat.diffuseTexture = tex;
      labelMat.emissiveTexture = tex;
      labelMat.specularColor = new Color3(0, 0, 0);
      labelMat.backFaceCulling = false;
      labelMat.disableLighting = true;
      plane.material = labelMat;
      plane.isPickable = false;
      plane.setEnabled(true);
      this.axisLabels.push(plane);
    });
  }

  private updateAxisMarkers(cesiumCamera: any): void {
    if (!this.axisMarkers.length) return;
    if (!cesiumCamera) return;

    const pos = cesiumToBabylonVec3(cesiumCamera.position);
    const forwardRaw = cesiumToBabylonVec3(cesiumCamera.direction);
    const upRaw = cesiumToBabylonVec3(cesiumCamera.up);
    const rightRaw = cesiumToBabylonVec3(cesiumCamera.right);

    const forward = forwardRaw.lengthSquared() > 1e-6 ? forwardRaw.normalize() : new Vector3(0, 0, 1);
    const up = upRaw.lengthSquared() > 1e-6 ? upRaw.normalize() : new Vector3(0, 1, 0);
    const right = rightRaw.lengthSquared() > 1e-6 ? rightRaw.normalize() : new Vector3(1, 0, 0);

    const offset = 300;
    this.axisMarkers[0].position = pos.add(forward.scale(offset)); // forward
    this.axisMarkers[1].position = pos.add(forward.scale(-offset)); // back
    this.axisMarkers[2].position = pos.add(right.scale(offset)); // right
    this.axisMarkers[3].position = pos.add(right.scale(-offset)); // left
    this.axisMarkers[4].position = pos.add(up.scale(offset)); // up
    this.axisMarkers[5].position = pos.add(up.scale(-offset)); // down
  }

  private clearAxisMarkers(): void {
    this.axisLabels.forEach((p) => {
      (p.material as any)?.diffuseTexture?.dispose?.();
      p.material?.dispose();
      p.dispose();
    });
    this.axisLabels = [];
    this.axisMarkers.forEach((s) => {
      s.material?.dispose();
      s.dispose();
    });
    this.axisMarkers = [];
  }

  updateVisualizations(camera: any, frameNumber: number): void {
    if (this.frustumVisible) {
      this.updateFrustumVisualization(camera, frameNumber);
      this.ensureAxisMarkers();
      this.updateAxisMarkers(camera);
    }
    if (this.cameraOrientationVisible) {
      this.ensureAxisMarkers();
      this.updateAxisMarkers(camera);
      this.updateCameraOrientationVisualization(camera);
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
      this.clearFrustumWireframes();
      this.clearFrustumPlanes();
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
      this.frustumVisualization.isPickable = false;
      this.frustumVisualization.setEnabled(true);

      const frustumMaterial = new StandardMaterial('frustumMaterial', this.babylonScene);
      frustumMaterial.emissiveColor = new Color3(1, 0, 1);
      frustumMaterial.disableLighting = true;
      frustumMaterial.backFaceCulling = false;

      this.drawFrustumLines(babylonCorners, frustumMaterial, this.babylonScene);
      this.drawFrustumPlanes(babylonCorners, this.babylonScene);
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
    // Show bounding volumes for a broader set than just selected
    // Walk the entire tree so every tile gets a bounding sphere
    if (!this.cesiumTileset?.root) return;

    const stack: any[] = [this.cesiumTileset.root];
    const tiles: any[] = [];
    while (stack.length) {
      const tile = stack.pop();
      if (!tile) continue;
      tiles.push(tile);
      if (tile.children && tile.children.length > 0) {
        for (let i = 0; i < tile.children.length; i++) stack.push(tile.children[i]);
      }
    }

    tiles.forEach((tile: any, index: number) => {
      const boundingVolume = tile.boundingVolume;
      if (!boundingVolume?.boundingSphere) return;

      const sphere = boundingVolume.boundingSphere;
      const cesiumCenter = sphere.center;
      const cesiumRadius = sphere.radius;

      const babylonCenter = new Vector3(cesiumCenter.x, cesiumCenter.z, -cesiumCenter.y);

      const depth = tile._depth ?? tile.level ?? tile._tileId?.level ?? 0;

      const wireframeSphere = MeshBuilder.CreateSphere(
        `boundingVolume_${index}_L${depth}`,
        { diameter: cesiumRadius * 2, segments: 8 },
        this.babylonScene
      );
      wireframeSphere.position = babylonCenter;

      const material = new StandardMaterial(`boundingMaterial_${index}`, this.babylonScene);
      material.wireframe = true;
      material.disableLighting = true;

      const isSelected = (this.cesiumTileset._selectedTiles || []).includes(tile);
      if (isSelected) {
        const dn = Math.min(Math.max(depth / 12, 0), 1); // normalized depth
        // Far (higher depth) = green, near (lower depth) = teal
        const r = 0.0 + 0.0 * (1 - dn);
        const g = 0.4 + 0.6 * (1 - dn);
        const b = 0.3 + 0.3 * (1 - dn);
        material.emissiveColor = new Color3(r, g, b);
        material.alpha = 1.0;
      } else {
        // Cached/non-selected: uniform yellow, highly transparent
        material.emissiveColor = new Color3(1.0, 1.0, 0.0);
        material.alpha = 0.1;
      }

      wireframeSphere.material = material;

      // Store depth in metadata for easy inspection
      wireframeSphere.metadata = { ...(wireframeSphere.metadata || {}), tileDepth: depth };

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

  private updateCameraOrientationVisualization(cesiumCamera: any): void {
    this.clearCameraOrientationLines();

    if (!cesiumCamera) return;

    const cameraPos = cesiumToBabylonVec3(cesiumCamera.position);
    const forwardDir = cesiumToBabylonVec3(cesiumCamera.direction).normalize();
    const lineLength = 1000000; // 1000km lines

    // Down vector (toward planet center) - RED line going to origin
    const downLine = MeshBuilder.CreateLines('cameraDown', {
      points: [cameraPos, Vector3.Zero()]
    }, this.babylonScene);
    downLine.color = Color3.Red();
    this.cameraOrientationLines.push(downLine);

    // Forward direction - GREEN line based on Cesium camera direction
    const forwardEnd = cameraPos.add(forwardDir.scale(lineLength));
    
    const forwardLine = MeshBuilder.CreateLines('cameraForward', {
      points: [cameraPos, forwardEnd]
    }, this.babylonScene);
    forwardLine.color = Color3.Green();
    this.cameraOrientationLines.push(forwardLine);
  }

  private clearCameraOrientationLines(): void {
    this.cameraOrientationLines.forEach((line) => {
      line.dispose();
    });
    this.cameraOrientationLines = [];
  }

  dispose(): void {
    this.clearBoundingVolumeWireframes();
    this.clearFrustumWireframes();
    this.clearCameraOrientationLines();
    this.clearAxisMarkers();
    if (this.frustumVisualization) {
      this.frustumVisualization.dispose();
      this.frustumVisualization = null;
    }
  }

  private drawFrustumPlanes(babylonCorners: Vector3[], scene: Scene): void {
    // Build six quads: near, far, left, right, top, bottom
    const planes = [
      [1, 2, 3, 4], // near
      [5, 6, 7, 8], // far
      [1, 5, 8, 4], // left
      [2, 6, 7, 3], // right
      [4, 3, 7, 8], // top
      [1, 2, 6, 5], // bottom
    ];

    const colors = [
      new Color3(1, 0, 0),   // near - red
      new Color3(0, 1, 0),   // far - green
      new Color3(0, 0, 1),   // left - blue
      new Color3(1, 1, 0),   // right - yellow
      new Color3(1, 0, 1),   // top - magenta
      new Color3(0, 1, 1),   // bottom - cyan
    ];

    planes.forEach((indices, idx) => {
      const name = `frustumPlane_${idx}`;
      const [i0, i1, i2, i3] = indices;
      const p0 = babylonCorners[i0];
      const p1 = babylonCorners[i1];
      const p2 = babylonCorners[i2];
      const p3 = babylonCorners[i3];

      const quad = new Mesh(name, scene);
      const positions = [
        p0.x, p0.y, p0.z,
        p1.x, p1.y, p1.z,
        p2.x, p2.y, p2.z,
        p3.x, p3.y, p3.z,
      ];
      const indicesArr = [0, 1, 2, 0, 2, 3];
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indicesArr;
      vertexData.normals = [];
      VertexData.ComputeNormals(positions, indicesArr, vertexData.normals);
      vertexData.applyToMesh(quad);

      quad.alphaIndex = 0;
      quad.isPickable = false;
      quad.renderingGroupId = undefined as any;
      const mat = new StandardMaterial(`${name}_mat`, scene);
      const color = colors[idx % colors.length];
      mat.emissiveColor = color;
      mat.diffuseColor = color;
      mat.specularColor = new Color3(0, 0, 0);
      mat.alpha = 0.25; // translucent so tiles remain visible
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.disableDepthWrite = true; // do not occlude scene content
      mat.zOffset = 0;
      quad.material = mat;
      this.frustumPlanes.push(quad);
      if (this.frustumVisualization) quad.parent = this.frustumVisualization;
    });
  }

  private clearFrustumPlanes(): void {
    this.frustumPlanes.forEach((m) => m.dispose());
    this.frustumPlanes = [];
  }
}
