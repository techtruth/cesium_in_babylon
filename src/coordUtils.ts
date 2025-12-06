import { Matrix, Vector3 } from '@babylonjs/core';
import { Cartesian3, Matrix4 } from 'cesium';

// Cesium (X, Y, Z) -> Babylon (X, Z, -Y)
export function cesiumToBabylonVec3(cart: Cartesian3): Vector3 {
  return new Vector3(cart.x, cart.z, -cart.y);
}

// Babylon (X, Y, Z) -> Cesium (X, -Z, Y)
export function babylonToCesiumVec3(vec: Vector3): Cartesian3 {
  return new Cartesian3(vec.x, -vec.z, vec.y);
}

// Axis swap matrices as 4x4 (column-major for Cesium)
const CESIUM_TO_BABYLON_MATRIX = Matrix4.fromColumnMajorArray([
  1, 0, 0, 0, // column 0
  0, 0, -1, 0, // column 1
  0, 1, 0, 0, // column 2
  0, 0, 0, 1, // column 3
]);

const BABYLON_TO_CESIUM_MATRIX = Matrix4.fromColumnMajorArray([
  1, 0, 0, 0, // column 0
  0, 0, 1, 0, // column 1
  0, -1, 0, 0, // column 2
  0, 0, 0, 1, // column 3
]);

const scratchMatrixA = new Matrix4();
const scratchMatrixB = new Matrix4();

// Convert Cesium Matrix4 (column-major, Cesium basis) to Babylon Matrix (row-major, Babylon basis)
export function cesiumMatrixToBabylonMatrix(cesiumMatrix: Matrix4): any {
  // Apply basis change: B = C2B * M_c * B2C
  const cesiumWithBasis = Matrix4.multiply(
    CESIUM_TO_BABYLON_MATRIX,
    Matrix4.multiply(cesiumMatrix, BABYLON_TO_CESIUM_MATRIX, scratchMatrixA),
    scratchMatrixB
  );

  return Matrix.FromArray([
    cesiumWithBasis[0],
    cesiumWithBasis[4],
    cesiumWithBasis[8],
    cesiumWithBasis[12],
    cesiumWithBasis[1],
    cesiumWithBasis[5],
    cesiumWithBasis[9],
    cesiumWithBasis[13],
    cesiumWithBasis[2],
    cesiumWithBasis[6],
    cesiumWithBasis[10],
    cesiumWithBasis[14],
    cesiumWithBasis[3],
    cesiumWithBasis[7],
    cesiumWithBasis[11],
    cesiumWithBasis[15],
  ]);
}
