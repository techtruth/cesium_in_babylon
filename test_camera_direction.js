// Test camera direction calculation
import * as Cesium from 'cesium';

console.log('🎯 CAMERA DIRECTION TEST');
console.log('=======================');

// NYC coordinates (Statue of Liberty)
const libertyLat = 40.6892 * Math.PI / 180;
const libertyLon = -74.0445 * Math.PI / 180;
const surfaceAltitude = 0;
const cameraAltitude = 10000; // 10km above surface

// Get ECEF positions
const nycSurfaceCesium = Cesium.Cartesian3.fromRadians(libertyLon, libertyLat, surfaceAltitude);
const cameraPositionCesium = Cesium.Cartesian3.fromRadians(libertyLon, libertyLat, cameraAltitude);

console.log(`Camera ECEF: (${cameraPositionCesium.x.toFixed(0)}, ${cameraPositionCesium.y.toFixed(0)}, ${cameraPositionCesium.z.toFixed(0)})`);
console.log(`Surface ECEF: (${nycSurfaceCesium.x.toFixed(0)}, ${nycSurfaceCesium.y.toFixed(0)}, ${nycSurfaceCesium.z.toFixed(0)})`);

// Calculate direction vector from camera to surface (what Babylon setTarget would create)
const directionCesium = new Cesium.Cartesian3();
Cesium.Cartesian3.subtract(nycSurfaceCesium, cameraPositionCesium, directionCesium);
Cesium.Cartesian3.normalize(directionCesium, directionCesium);

console.log(`Direction (Cesium): (${directionCesium.x.toFixed(6)}, ${directionCesium.y.toFixed(6)}, ${directionCesium.z.toFixed(6)})`);

// This should point straight down (towards Earth center) since camera is directly above surface
// For a camera 10km directly above NYC surface, direction should be approximately towards Earth center

// Calculate expected direction (towards Earth center from camera position)
const earthCenter = new Cesium.Cartesian3(0, 0, 0);
const expectedDirection = new Cesium.Cartesian3();
Cesium.Cartesian3.subtract(earthCenter, cameraPositionCesium, expectedDirection);
Cesium.Cartesian3.normalize(expectedDirection, expectedDirection);

console.log(`Expected direction (toward Earth center): (${expectedDirection.x.toFixed(6)}, ${expectedDirection.y.toFixed(6)}, ${expectedDirection.z.toFixed(6)})`);

// Calculate angle between actual and expected direction
const dotProduct = Cesium.Cartesian3.dot(directionCesium, expectedDirection);
const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
const angleDegrees = Cesium.Math.toDegrees(angle);

console.log(`\n📐 DIRECTION ANALYSIS:`);
console.log(`   Angle difference: ${angleDegrees.toFixed(4)}°`);
console.log(`   Expected: Close to 0° (camera looking straight down at surface)`);

if (angleDegrees < 1.0) {
    console.log('   ✅ Direction is correct - camera looking straight down');
} else {
    console.log('   ❌ Direction error - camera not looking straight down');
}

// Test the Babylon coordinate transformation
console.log('\n🔄 BABYLON COORDINATE TRANSFORMATION:');

// Transform to Babylon coordinates (Y↔Z swap)
const cameraPosBabylon = {
    x: cameraPositionCesium.x,
    y: cameraPositionCesium.z,  // Z → Y
    z: cameraPositionCesium.y   // Y → Z  
};

const surfacePosBabylon = {
    x: nycSurfaceCesium.x,
    y: nycSurfaceCesium.z,  // Z → Y
    z: nycSurfaceCesium.y   // Y → Z
};

console.log(`Babylon Camera: (${cameraPosBabylon.x.toFixed(0)}, ${cameraPosBabylon.y.toFixed(0)}, ${cameraPosBabylon.z.toFixed(0)})`);
console.log(`Babylon Surface: (${surfacePosBabylon.x.toFixed(0)}, ${surfacePosBabylon.y.toFixed(0)}, ${surfacePosBabylon.z.toFixed(0)})`);

// Calculate Babylon direction vector (what setTarget would create)
const directionBabylon = {
    x: surfacePosBabylon.x - cameraPosBabylon.x,
    y: surfacePosBabylon.y - cameraPosBabylon.y,
    z: surfacePosBabylon.z - cameraPosBabylon.z
};

// Normalize
const length = Math.sqrt(directionBabylon.x**2 + directionBabylon.y**2 + directionBabylon.z**2);
directionBabylon.x /= length;
directionBabylon.y /= length;  
directionBabylon.z /= length;

console.log(`Babylon Direction: (${directionBabylon.x.toFixed(6)}, ${directionBabylon.y.toFixed(6)}, ${directionBabylon.z.toFixed(6)})`);

// Transform back to Cesium for verification
const directionBackToCesium = new Cesium.Cartesian3(
    directionBabylon.x,  // X unchanged
    directionBabylon.z,  // Z → Y (reverse of Y → Z)  
    directionBabylon.y   // Y → Z (reverse of Z → Y)
);

console.log(`Direction back to Cesium: (${directionBackToCesium.x.toFixed(6)}, ${directionBackToCesium.y.toFixed(6)}, ${directionBackToCesium.z.toFixed(6)})`);

// Compare with original direction
const transformError = new Cesium.Cartesian3();
Cesium.Cartesian3.subtract(directionCesium, directionBackToCesium, transformError);
const errorMagnitude = Cesium.Cartesian3.magnitude(transformError);

console.log(`\n📊 DIRECTION TRANSFORMATION ERROR: ${errorMagnitude.toFixed(8)}`);

if (errorMagnitude < 0.000001) {
    console.log('✅ Direction transformation is correct');
    console.log('\n🔍 CONCLUSION: Coordinate transformations and camera direction are mathematically correct.');
    console.log('   Issue likely in:');
    console.log('   1. Cesium tile selection algorithm'); 
    console.log('   2. Google 3D Tiles regional coverage');
    console.log('   3. Frustum culling calculation');
    console.log('   4. Tile LOD/zoom level logic');
} else {
    console.log('❌ Direction transformation error detected');
}