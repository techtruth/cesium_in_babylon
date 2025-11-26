// Type declarations for CesiumTilesetDerived.js (native Cesium3DTileset)

declare class Cesium3DTileset {
  constructor(options?: any);
  
  // Core properties used in simpleIntegration.ts
  readonly asset: any;
  readonly extensions: any;
  readonly properties: any;
  readonly tilesLoaded: boolean;
  readonly resource: any;
  readonly root: any;
  readonly boundingSphere: any;
  readonly maximumMemoryUsage: number;
  readonly totalMemoryUsageInBytes: number;
  readonly url: string;
  readonly ready: boolean;
  readonly readyPromise: Promise<Cesium3DTileset>;
  readonly selectedTiles: any[];
  readonly statistics: any;
  
  // Configuration properties
  show: boolean;
  modelMatrix: any;
  shadows: any;
  maximumScreenSpaceError: number;
  
  // Methods
  destroy(): void;
  isDestroyed(): boolean;
  update(frameState: any): void;
  
  // Static methods
  static fromUrl(url: string | any, options?: any): Promise<Cesium3DTileset>;
  static fromIonAssetId(assetId: number, options?: any): Promise<Cesium3DTileset>;
  
  // Events
  allTilesLoaded: any;
  initialTilesLoaded: any;
  tileLoad: any;
  tileLoadProgress: any;
  tileFailed: any;
  tileUnload: any;
  tileVisible: any;
}

export default Cesium3DTileset;