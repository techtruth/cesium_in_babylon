import { Scene as BabylonScene } from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
export class SimpleBabylonTileContent {
  private _tileset: any;
  private _tile: any;
  private _resource: any;
  private _babylonScene: BabylonScene;
  private _ready: boolean = false;
  private _meshes: any[] = [];
  private _lastUpdateFrame: number = -1;

  constructor(tileset: any, tile: any, resource: any, babylonScene: BabylonScene) {
    this._tileset = tileset;
    this._tile = tile;
    this._resource = resource;
    this._babylonScene = babylonScene;
  }

  private async loadContent(gltfData: Uint8Array): Promise<void> {
    try {
      const blob = new Blob([gltfData as any], { type: 'model/gltf-binary' });
      const objectURL = URL.createObjectURL(blob);

      const result = await SceneLoader.ImportMeshAsync(
        '',
        '',
        objectURL,
        this._babylonScene,
        undefined,
        '.glb'
      );

      result.meshes.forEach((mesh) => {
        mesh.setEnabled(false);
        // Mark meshes (and children) so integration can toggle visibility generically
        const tagMesh = (m: any) => {
          m.metadata = { ...(m.metadata || {}), isTileMesh: true };
        };
        tagMesh(mesh);
        if (typeof mesh.getChildMeshes === 'function') {
          mesh.getChildMeshes().forEach((child: any) => tagMesh(child));
        }

        // Ensure all materials are fully opaque (tolerate varying material types)
        const mat: any = mesh.material;
        if (mat) {
          if (mat.alpha !== undefined) {
            mat.alpha = 1.0;
          }
          if (mat.transparencyMode !== undefined) {
            mat.transparencyMode = 0; // OPAQUE mode
          }
          if (mat.baseColor && mat.baseColor.a !== undefined) {
            mat.baseColor.a = 1.0;
          }
          if (mat.albedoColor && mat.albedoColor.a !== undefined) {
            mat.albedoColor.a = 1.0;
          }
        }
      });

      this._meshes = result.meshes;

      this.storeCesiumTransform();

      URL.revokeObjectURL(objectURL);
    } catch (error) {
      console.error('Failed to load tile content:', error);
    }
  }

  private storeCesiumTransform(): void {
    const cesiumTransform = this._tile.computedTransform;
    if (cesiumTransform) {
      (this as any)._storedTransform = cesiumTransform;
    }
  }

  get featuresLength(): number {
    return 0;
  }
  get pointsLength(): number {
    return 0;
  }

  get trianglesLength(): number {
    if (!this._ready || !this._meshes) return 0;

    return this._meshes.reduce((total, mesh) => {
      const indices = mesh.getTotalIndices ? mesh.getTotalIndices() : 0;
      return total + Math.floor(indices / 3);
    }, 0);
  }

  // Keep Cesium's memory accounting numeric so cache trimming works
  get batchTableByteLength(): number {
    return 0;
  }

  get geometryByteLength(): number {
    if (!this._ready || !this._meshes) return 0;

    let byteLength = 0;
    this._meshes.forEach((mesh) => {
      if (mesh.geometry) {
        const vertices = mesh.geometry.getTotalVertices ? mesh.geometry.getTotalVertices() : 0;
        const indices = mesh.getTotalIndices ? mesh.getTotalIndices() : 0;
        byteLength += vertices * 8 * 4;
        byteLength += indices * 2;
      }
    });

    return byteLength || this._resource?.arrayBuffer?.byteLength || 0;
  }

  get texturesByteLength(): number {
    return 0;
  }

  get ready(): boolean {
    return this._ready;
  }
  get tileset(): any {
    return this._tileset;
  }
  get tile(): any {
    return this._tile;
  }

  get url(): string | undefined {
    return this._resource?.getUrlComponent();
  }
  getBabylonMeshes(): any[] {
    return this._meshes || [];
  }
  getStoredTransform(): any {
    return (this as any)._storedTransform;
  }
  applyStyle(style: any): void {
    (this as any)._style = style;
  }

  update(_tileset: any, frameState: any): void {
    if (!this._ready) {
      this._ready = !this._meshes?.length || this._meshes.every((mesh) => mesh.isReady?.());
    }

    this._meshes?.forEach((mesh) => {
      if (!mesh.isEnabled()) mesh.setEnabled(true);
    });

    this._lastUpdateFrame = frameState.frameNumber;
  }

  isDestroyed(): boolean {
    return false;
  }

  destroy(): void {
    this._meshes.forEach((mesh) => {
      if (mesh.dispose) {
        mesh.dispose();
      }
    });
    this._meshes = [];
    this._ready = false;
  }

  static async fromB3dm(
    tileset: any,
    tile: any,
    resource: any,
    arrayBuffer: ArrayBuffer,
    byteOffset: number,
    babylonScene: BabylonScene
  ): Promise<SimpleBabylonTileContent> {
    const content = new SimpleBabylonTileContent(tileset, tile, resource, babylonScene);

    try {
      const dataView = new DataView(arrayBuffer, byteOffset);
      const magic = new TextDecoder().decode(new Uint8Array(arrayBuffer, byteOffset, 4));
      if (magic !== 'b3dm') throw new Error(`Invalid B3DM magic: ${magic}`);

      const byteLength = dataView.getUint32(8, true);
      let gltfOffset = byteOffset + 28;
      gltfOffset += dataView.getUint32(12, true) + dataView.getUint32(16, true);
      gltfOffset += dataView.getUint32(20, true) + dataView.getUint32(24, true);

      const gltfByteLength = byteLength - (gltfOffset - byteOffset);
      const gltfData = new Uint8Array(arrayBuffer, gltfOffset, gltfByteLength);
      await content.loadContent(gltfData);
    } catch (error) {
      console.error('B3DM parsing failed:', error);
    }

    return content;
  }

  static async fromGltf(
    tileset: any,
    tile: any,
    resource: any,
    gltf: ArrayBuffer,
    babylonScene: BabylonScene
  ): Promise<SimpleBabylonTileContent> {
    const content = new SimpleBabylonTileContent(tileset, tile, resource, babylonScene);

    try {
      const gltfData = new Uint8Array(gltf);
      await content.loadContent(gltfData);
    } catch (error) {
      console.error('GLB loading failed:', error);
    }

    return content;
  }

  hideTile(): void {
    //console.log("HIDING TILE!?")
    this._meshes.forEach((mesh) => mesh.setEnabled(false));
  }
}
