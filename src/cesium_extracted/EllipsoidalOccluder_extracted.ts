/**
 * CESIUM REFERENCE: @cesium/engine/Source/Core/EllipsoidalOccluder.js
 * 
 * Determine whether or not other objects are visible or hidden behind the visible horizon defined by
 * an {@link Ellipsoid} and a camera position.  The ellipsoid is assumed to be located at the
 * origin of the coordinate system.  This class uses the algorithm described in the
 * {@link https://cesium.com/blog/2013/04/25/Horizon-culling/|Horizon Culling} blog post.
 *
 * @alias EllipsoidalOccluder
 * @constructor
 */

import { 
    Cartesian3, 
    Ellipsoid, 
    BoundingSphere, 
    defined, 
    Rectangle 
} from 'cesium';

export class EllipsoidalOccluder {
    private _ellipsoid: Ellipsoid;
    private _cameraPosition: Cartesian3;
    private _cameraPositionInScaledSpace: Cartesian3;
    private _distanceToLimbInScaledSpaceSquared: number;

    /**
     * @param {Ellipsoid} ellipsoid The ellipsoid to use as an occluder.
     * @param {Cartesian3} [cameraPosition] The coordinate of the viewer/camera.
     */
    constructor(ellipsoid: Ellipsoid, cameraPosition?: Cartesian3) {
        this._ellipsoid = ellipsoid;
        this._cameraPosition = new Cartesian3();
        this._cameraPositionInScaledSpace = new Cartesian3();
        this._distanceToLimbInScaledSpaceSquared = 0.0;

        // cameraPosition fills in the above values
        if (defined(cameraPosition)) {
            this.cameraPosition = cameraPosition;
        }
    }

    /**
     * Gets the occluding ellipsoid.
     */
    get ellipsoid(): Ellipsoid {
        return this._ellipsoid;
    }

    /**
     * Gets or sets the position of the camera.
     */
    get cameraPosition(): Cartesian3 {
        return this._cameraPosition;
    }

    set cameraPosition(cameraPosition: Cartesian3) {
        // See https://cesium.com/blog/2013/04/25/Horizon-culling/
        const ellipsoid = this._ellipsoid;
        const cv = ellipsoid.transformPositionToScaledSpace(
            cameraPosition,
            this._cameraPositionInScaledSpace,
        );
        const vhMagnitudeSquared = Cartesian3.magnitudeSquared(cv) - 1.0;

        Cartesian3.clone(cameraPosition, this._cameraPosition);
        this._cameraPositionInScaledSpace = cv;
        this._distanceToLimbInScaledSpaceSquared = vhMagnitudeSquared;
    }

    /**
     * Determines whether or not a point, the occludee, is hidden from view by the occluder.
     * @param {Cartesian3} occludee The point to test for visibility.
     * @returns {boolean} true if the occludee is visible; otherwise false.
     */
    isPointVisible(occludee: Cartesian3): boolean {
        const ellipsoid = this._ellipsoid;
        const scratchCartesian = new Cartesian3();
        const occludeeScaledSpacePosition = ellipsoid.transformPositionToScaledSpace(
            occludee,
            scratchCartesian,
        );
        return this.isScaledSpacePointVisible(occludeeScaledSpacePosition);
    }

    /**
     * Determines whether or not a point expressed in the ellipsoid scaled space, is hidden from view by the
     * occluder.  To transform a Cartesian X, Y, Z position in the coordinate system aligned with the ellipsoid
     * into the scaled space, call {@link Ellipsoid#transformPositionToScaledSpace}.
     */
    isScaledSpacePointVisible(occludeeScaledSpacePosition: Cartesian3): boolean {
        return isScaledSpacePointVisible(
            occludeeScaledSpacePosition,
            this._cameraPositionInScaledSpace,
            this._distanceToLimbInScaledSpaceSquared,
        );
    }

    /**
     * Determines whether or not a point expressed in the ellipsoid scaled space, is hidden from view by the
     * occluder, taking into account terrain that might be below the ellipsoid surface.
     * 
     * This method is used for terrain tiles that might extend below the reference ellipsoid (e.g., ocean floors,
     * valleys below sea level). When minimumHeight is negative and significant relative to the ellipsoid size,
     * the method adjusts the occlusion calculation by effectively shrinking the ellipsoid.
     * 
     * @param {Cartesian3} occludeeScaledSpacePosition The point to test for visibility in scaled space.
     * @param {number} minimumHeight The minimum height of the terrain being tested. When negative and 
     *                               significant, causes the ellipsoid to be effectively shrunk for occlusion.
     * @returns {boolean} true if the occludee is visible; otherwise false.
     */
    isScaledSpacePointVisiblePossiblyUnderEllipsoid(
        occludeeScaledSpacePosition: Cartesian3, 
        minimumHeight: number
    ): boolean {
        const ellipsoid = this._ellipsoid;
        let vhMagnitudeSquared: number;
        let cv: Cartesian3;

        // If minimumHeight is significantly below the ellipsoid surface, we need to adjust
        // the camera position calculation to account for the "shrunk" ellipsoid
        if (defined(minimumHeight) && 
            minimumHeight < 0 && 
            ellipsoid.minimumRadius > -minimumHeight) {
            
            // Create a shrunk camera position in scaled space
            const scratchCameraPositionInScaledSpaceShrunk = new Cartesian3();
            cv = scratchCameraPositionInScaledSpaceShrunk;
            cv.x = this._cameraPosition.x / (ellipsoid.radii.x + minimumHeight);
            cv.y = this._cameraPosition.y / (ellipsoid.radii.y + minimumHeight);  
            cv.z = this._cameraPosition.z / (ellipsoid.radii.z + minimumHeight);
            vhMagnitudeSquared = cv.x * cv.x + cv.y * cv.y + cv.z * cv.z - 1.0;
        } else {
            // Use the standard camera position and distance to limb
            cv = this._cameraPositionInScaledSpace;
            vhMagnitudeSquared = this._distanceToLimbInScaledSpaceSquared;
        }

        return isScaledSpacePointVisible(
            occludeeScaledSpacePosition,
            cv,
            vhMagnitudeSquared
        );
    }

    /**
     * Computes a point that can be used for horizon culling from a list of positions.  If the point is below
     * the horizon, all of the positions are guaranteed to be below the horizon as well.
     */
    computeHorizonCullingPoint(
        directionToPoint: Cartesian3,
        positions: Cartesian3[],
        result?: Cartesian3
    ): Cartesian3 | undefined {
        return computeHorizonCullingPointFromPositions(
            this._ellipsoid,
            directionToPoint,
            positions,
            result,
        );
    }

    /**
     * Computes a point that can be used for horizon culling of a rectangle.
     */
    computeHorizonCullingPointFromRectangle(
        rectangle: Rectangle,
        ellipsoid: Ellipsoid,
        result?: Cartesian3
    ): Cartesian3 | undefined {
        const subsampleScratch: Cartesian3[] = [];
        const positions = Rectangle.subsample(rectangle, ellipsoid, 0.0, subsampleScratch);
        const bs = BoundingSphere.fromPoints(positions);

        // If the bounding sphere center is too close to the center of the occluder, it doesn't make
        // sense to try to horizon cull it.
        if (Cartesian3.magnitude(bs.center) < 0.1 * ellipsoid.minimumRadius) {
            return undefined;
        }

        return this.computeHorizonCullingPoint(bs.center, positions, result);
    }
}

/**
 * CESIUM INTERNAL: Check if a scaled space point is visible 
 * See https://cesium.com/blog/2013/04/25/Horizon-culling/
 */
function isScaledSpacePointVisible(
    occludeeScaledSpacePosition: Cartesian3,
    cameraPositionInScaledSpace: Cartesian3,
    distanceToLimbInScaledSpaceSquared: number,
): boolean {
    const cv = cameraPositionInScaledSpace;
    const vhMagnitudeSquared = distanceToLimbInScaledSpaceSquared;
    const scratchCartesian = new Cartesian3();
    const vt = Cartesian3.subtract(
        occludeeScaledSpacePosition,
        cv,
        scratchCartesian,
    );
    const vtDotVc = -Cartesian3.dot(vt, cv);
    // If vhMagnitudeSquared < 0 then we are below the surface of the ellipsoid and
    // in this case, set the culling plane to be on V.
    const isOccluded =
        vhMagnitudeSquared < 0
            ? vtDotVc > 0
            : vtDotVc > vhMagnitudeSquared &&
              (vtDotVc * vtDotVc) / Cartesian3.magnitudeSquared(vt) >
                vhMagnitudeSquared;
    return !isOccluded;
}

/**
 * CESIUM INTERNAL: Compute horizon culling point from positions
 */
function computeHorizonCullingPointFromPositions(
    ellipsoid: Ellipsoid,
    directionToPoint: Cartesian3,
    positions: Cartesian3[],
    result?: Cartesian3,
): Cartesian3 | undefined {
    if (!defined(result)) {
        result = new Cartesian3();
    }

    const scaledSpaceDirectionToPoint = computeScaledSpaceDirectionToPoint(
        ellipsoid,
        directionToPoint,
    );
    let resultMagnitude = 0.0;

    for (let i = 0, len = positions.length; i < len; ++i) {
        const position = positions[i];
        const candidateMagnitude = computeMagnitude(
            ellipsoid,
            position,
            scaledSpaceDirectionToPoint,
        );
        if (candidateMagnitude < 0.0) {
            // all points should face the same direction, but this one doesn't, so return undefined
            return undefined;
        }
        resultMagnitude = Math.max(resultMagnitude, candidateMagnitude);
    }

    return magnitudeToPoint(scaledSpaceDirectionToPoint, resultMagnitude, result);
}

/**
 * CESIUM INTERNAL: Helper functions
 */
function computeMagnitude(ellipsoid: Ellipsoid, position: Cartesian3, scaledSpaceDirectionToPoint: Cartesian3): number {
    const scaledSpaceScratch = new Cartesian3();
    const directionScratch = new Cartesian3();
    
    const scaledSpacePosition = ellipsoid.transformPositionToScaledSpace(position, scaledSpaceScratch);
    let magnitudeSquared = Cartesian3.magnitudeSquared(scaledSpacePosition);
    let magnitude = Math.sqrt(magnitudeSquared);
    const direction = Cartesian3.divideByScalar(scaledSpacePosition, magnitude, directionScratch);

    // For the purpose of this computation, points below the ellipsoid are consider to be on it instead.
    magnitudeSquared = Math.max(1.0, magnitudeSquared);
    magnitude = Math.max(1.0, magnitude);

    const cosAlpha = Cartesian3.dot(direction, scaledSpaceDirectionToPoint);
    const sinAlpha = Cartesian3.magnitude(
        Cartesian3.cross(direction, scaledSpaceDirectionToPoint, direction),
    );
    const cosBeta = 1.0 / magnitude;
    const sinBeta = Math.sqrt(magnitudeSquared - 1.0) * cosBeta;

    return 1.0 / (cosAlpha * cosBeta - sinAlpha * sinBeta);
}

function magnitudeToPoint(
    scaledSpaceDirectionToPoint: Cartesian3,
    resultMagnitude: number,
    result: Cartesian3,
): Cartesian3 | undefined {
    // The horizon culling point is undefined if there were no positions from which to compute it,
    // the directionToPoint is pointing opposite all of the positions,  or if we computed NaN or infinity.
    if (
        resultMagnitude <= 0.0 ||
        resultMagnitude === 1.0 / 0.0 ||
        resultMagnitude !== resultMagnitude
    ) {
        return undefined;
    }

    return Cartesian3.multiplyByScalar(
        scaledSpaceDirectionToPoint,
        resultMagnitude,
        result,
    );
}

function computeScaledSpaceDirectionToPoint(ellipsoid: Ellipsoid, directionToPoint: Cartesian3): Cartesian3 {
    const directionToPointScratch = new Cartesian3();
    
    if (Cartesian3.equals(directionToPoint, Cartesian3.ZERO)) {
        return directionToPoint;
    }

    ellipsoid.transformPositionToScaledSpace(directionToPoint, directionToPointScratch);
    return Cartesian3.normalize(directionToPointScratch, directionToPointScratch);
}