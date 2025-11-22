// DERIVED FROM: @cesium/engine/Source/Scene/B3dmParser.js
// Modified to support B3DM version 2

import { 
  Check,
  RuntimeError 
} from 'cesium';

const defaultValue = (value: any, defaultVal: any) => value !== undefined ? value : defaultVal;
const defined = (value: any) => value !== undefined && value !== null;
const deprecationWarning = (id: string, message: string) => console.warn(`DEPRECATION (${id}): ${message}`);

/**
 * B3DM Parser that supports both version 1 and 2
 */
export const B3dmParserV2 = {
  parse: function (arrayBuffer: ArrayBuffer, byteOffset?: number): {
    batchLength: number;
    featureTableJSON: any;
    featureTableBinary: Uint8Array;
    batchTableJSON: any;
    batchTableBinary: Uint8Array;
    gltf: Uint8Array;
  } {
    //>>includeStart('debug', pragmas.debug);
    Check.defined("arrayBuffer", arrayBuffer);
    //>>includeEnd('debug');

    byteOffset = defaultValue(byteOffset, 0);

    const dataView = new DataView(arrayBuffer, byteOffset);

    // 28-byte header

    // 4 bytes - magic
    const magic = new Uint8Array(arrayBuffer, byteOffset, 4);
    if (magic[0] !== 0x62 || magic[1] !== 0x33 || magic[2] !== 0x64 || magic[3] !== 0x6d) {
      throw new RuntimeError("Invalid b3dm magic");
    }

    // 4 bytes - version
    const version = dataView.getUint32(4, true);
    console.log(`🔍 B3dmParserV2: Processing version ${version}`);
    
    if (version !== 1 && version !== 2) {
      throw new RuntimeError(
        `Only Batched 3D Model version 1 and 2 are supported. Version ${version} is not.`,
      );
    }

    // 4 bytes - total byte length
    const byteLength = dataView.getUint32(8, true);

    // Header field order differs between versions
    let featureTableJSONByteLength: number;
    let featureTableBinaryByteLength: number;  
    let batchTableJSONByteLength: number;
    let batchTableBinaryByteLength: number;

    if (version === 1) {
      // V1: batch table fields first, then feature table fields
      batchTableJSONByteLength = dataView.getUint32(12, true);
      batchTableBinaryByteLength = dataView.getUint32(16, true);
      featureTableJSONByteLength = dataView.getUint32(20, true);
      featureTableBinaryByteLength = dataView.getUint32(24, true);
    } else {
      // V2: feature table fields first, then batch table fields
      featureTableJSONByteLength = dataView.getUint32(12, true);
      featureTableBinaryByteLength = dataView.getUint32(16, true);
      batchTableJSONByteLength = dataView.getUint32(20, true);
      batchTableBinaryByteLength = dataView.getUint32(24, true);
    }

    let headerByteLength = 28;

    // Legacy header check (v1 only)
    if (version === 1 && featureTableJSONByteLength === 0 && featureTableBinaryByteLength === 0) {
      // 24-byte header
      headerByteLength = 20;
      deprecationWarning(
        "b3dm-legacy-header",
        "This b3dm uses the legacy 24-byte header and will be deprecated in a future version. Use the new 28-byte header instead."
      );
    } else if (
      batchTableJSONByteLength + batchTableBinaryByteLength === 0 ||
      batchTableJSONByteLength === 0
    ) {
      throw new RuntimeError(
        "If batch table binary is defined, then batch table JSON must be defined."
      );
    }

    let featureTableJSON: any = {};
    let featureTableBinary = new Uint8Array();
    let batchTableJSON: any = {};
    let batchTableBinary = new Uint8Array();

    // Legacy header (v1 only)
    if (version === 1 && headerByteLength === 20) {
      featureTableJSON.BATCH_LENGTH = batchTableJSONByteLength;
    } else {
      // Get Feature Table
      if (featureTableJSONByteLength > 0) {
        const featureTableString = new TextDecoder("utf-8").decode(
          new Uint8Array(
            arrayBuffer,
            byteOffset + headerByteLength,
            featureTableJSONByteLength
          )
        );
        Object.assign(featureTableJSON, JSON.parse(featureTableString));
      }

      if (featureTableBinaryByteLength > 0) {
        // Copy the feature table binary into a new Uint8Array to remove the reference to the entire array buffer
        const featureTableBinaryView = new Uint8Array(
          arrayBuffer,
          byteOffset + headerByteLength + featureTableJSONByteLength,
          featureTableBinaryByteLength
        );
        featureTableBinary = featureTableBinaryView.slice();
      }
    }

    // Get Batch Table
    if (batchTableJSONByteLength > 0) {
      const batchTableString = new TextDecoder("utf-8").decode(
        new Uint8Array(
          arrayBuffer,
          byteOffset + headerByteLength + featureTableJSONByteLength + featureTableBinaryByteLength,
          batchTableJSONByteLength
        )
      );
      Object.assign(batchTableJSON, JSON.parse(batchTableString));
    }

    if (batchTableBinaryByteLength > 0) {
      // Copy the batch table binary into a new Uint8Array to remove the reference to the entire array buffer
      const batchTableBinaryView = new Uint8Array(
        arrayBuffer,
        byteOffset +
          headerByteLength +
          featureTableJSONByteLength +
          featureTableBinaryByteLength +
          batchTableJSONByteLength,
        batchTableBinaryByteLength
      );
      batchTableBinary = batchTableBinaryView.slice();
    }

    const batchLength = featureTableJSON.BATCH_LENGTH;
    if (!defined(batchLength)) {
      throw new RuntimeError("Feature table global property: BATCH_LENGTH must be defined");
    }

    // Get glTF
    const gltfStart =
      byteOffset +
      headerByteLength +
      featureTableJSONByteLength +
      featureTableBinaryByteLength +
      batchTableJSONByteLength +
      batchTableBinaryByteLength;

    const gltfByteLength = byteLength - (gltfStart - byteOffset);

    if (gltfByteLength === 0) {
      throw new RuntimeError("glTF byte length must be greater than 0.");
    }

    const gltfView = new Uint8Array(arrayBuffer, gltfStart, gltfByteLength);

    // Ensure this is a glTF or glb
    const gltfMagic = new Uint8Array(gltfView.buffer, gltfView.byteOffset, 4);
    if (gltfMagic[0] === 0x67 && gltfMagic[1] === 0x6c && gltfMagic[2] === 0x54 && gltfMagic[3] === 0x46) {
      // glTF JSON
      throw new RuntimeError("Embedded glTF in b3dm must be binary glTF, not JSON");
    }

    // Check if byte alignment is needed
    // glTF must be aligned to 4-byte boundaries
    const remainder = gltfStart % 4;
    if (remainder !== 0) {
      const byteAlignmentPadding = 4 - remainder;
      if (gltfByteLength < byteAlignmentPadding) {
        throw new RuntimeError("glTF is not big enough to contain byte alignment padding.");
      }

      // Skip padding
      const gltfStartAligned = gltfStart + byteAlignmentPadding;
      const gltfByteLengthAligned = gltfByteLength - byteAlignmentPadding;
      const gltfViewAligned = new Uint8Array(arrayBuffer, gltfStartAligned, gltfByteLengthAligned);

      console.log(`✅ B3dmParserV2: Successfully parsed v${version}, batch length: ${batchLength}, glTF size: ${gltfByteLengthAligned} bytes`);

      return {
        batchLength: batchLength,
        featureTableJSON: featureTableJSON,
        featureTableBinary: featureTableBinary,
        batchTableJSON: batchTableJSON,
        batchTableBinary: batchTableBinary,
        gltf: gltfViewAligned,
      };
    }

    console.log(`✅ B3dmParserV2: Successfully parsed v${version}, batch length: ${batchLength}, glTF size: ${gltfByteLength} bytes`);

    return {
      batchLength: batchLength,
      featureTableJSON: featureTableJSON,
      featureTableBinary: featureTableBinary,
      batchTableJSON: batchTableJSON,
      batchTableBinary: batchTableBinary,
      gltf: gltfView,
    };
  }
};

export default B3dmParserV2;