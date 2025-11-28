// Quick coordinate transformation test
import * as Cesium from 'cesium';

// NYC coordinates (Statue of Liberty)
const libertyLat = 40.6892 * Math.PI / 180;  // radians
const libertyLon = -74.0445 * Math.PI / 180; // radians
const cameraAltitude = 10000; // 10km

console.log('🗽 COORDINATE TRANSFORMATION TEST');
console.log('================================');

// Step 1: Convert lat/lon to ECEF using Cesium
const nycEcefCesium = Cesium.Cartesian3.fromRadians(libertyLon, libertyLat, cameraAltitude);
console.log(`1. NYC ECEF (Cesium): (${nycEcefCesium.x.toFixed(0)}, ${nycEcefCesium.y.toFixed(0)}, ${nycEcefCesium.z.toFixed(0)})`);

// Step 2: Transform to Babylon coordinates (Y↔Z swap)
const nycBabylon = { 
    x: nycEcefCesium.x, 
    y: nycEcefCesium.z,  // Z → Y 
    z: nycEcefCesium.y   // Y → Z
};
console.log(`2. NYC Babylon: (${nycBabylon.x.toFixed(0)}, ${nycBabylon.y.toFixed(0)}, ${nycBabylon.z.toFixed(0)})`);

// Step 3: Transform back to Cesium (reverse Y↔Z swap)  
const backToCesiumEcef = new Cesium.Cartesian3(
    nycBabylon.x,  // X unchanged
    nycBabylon.z,  // Z → Y (reverse of Y → Z)
    nycBabylon.y   // Y → Z (reverse of Z → Y)
);
console.log(`3. Back to Cesium ECEF: (${backToCesiumEcef.x.toFixed(0)}, ${backToCesiumEcef.y.toFixed(0)}, ${backToCesiumEcef.z.toFixed(0)})`);

// Step 4: Convert back to lat/lon to verify
const backToCartographic = Cesium.Cartographic.fromCartesian(backToCesiumEcef);
if (backToCartographic) {
    const backLat = Cesium.Math.toDegrees(backToCartographic.latitude);
    const backLon = Cesium.Math.toDegrees(backToCartographic.longitude);
    const backAlt = backToCartographic.height;
    
    console.log(`4. Back to Lat/Lon: ${backLat.toFixed(4)}°, ${backLon.toFixed(4)}°, ${backAlt.toFixed(0)}m`);
    
    // Check errors
    const latError = Math.abs(backLat - 40.6892);
    const lonError = Math.abs(backLon - (-74.0445));
    const altError = Math.abs(backAlt - cameraAltitude);
    
    console.log('\n📊 TRANSFORMATION ERRORS:');
    console.log(`   Latitude error: ${latError.toFixed(6)}° (${latError < 0.0001 ? '✅' : '❌'})`);
    console.log(`   Longitude error: ${lonError.toFixed(6)}° (${lonError < 0.0001 ? '✅' : '❌'})`);
    console.log(`   Altitude error: ${altError.toFixed(2)}m (${altError < 1 ? '✅' : '❌'})`);
    
    if (latError < 0.0001 && lonError < 0.0001 && altError < 1) {
        console.log('\n✅ COORDINATE TRANSFORMATIONS ARE CORRECT!');
        console.log('   The issue is likely NOT in the coordinate transformation logic.');
        console.log('   Check tile selection/culling logic or tile server regional coverage.');
    } else {
        console.log('\n❌ COORDINATE TRANSFORMATION ERROR DETECTED!');
        console.log('   This explains why tiles are loading from wrong regions.');
    }
} else {
    console.log('❌ Failed to convert back to cartographic coordinates');
}