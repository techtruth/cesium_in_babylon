/**
 * A wrapper around arrays so that the internal length of the array can be manually managed.
 * 
 * Extracted from Cesium Engine (@cesium/engine/Source/Core/ManagedArray.js)
 * This is a Cesium internal class not exported in the public API.
 *
 * @alias ManagedArray
 * @constructor
 * @private
 *
 * @param {number} [length=0] The initial length of the array.
 */
export class ManagedArray<T = any> {
    private _array: Array<T>;
    private _length: number;

    constructor(length: number = 0) {
        this._array = new Array<T>(length);
        this._length = length;
    }

    /**
     * Gets or sets the length of the array.
     * If the set length is greater than the length of the internal array, the internal array is resized.
     */
    get length(): number {
        return this._length;
    }

    set length(length: number) {
        if (length < 0) {
            throw new Error('length must be greater than or equal to 0');
        }

        const array = this._array;
        const originalLength = this._length;
        if (length < originalLength) {
            // Remove trailing references
            for (let i = length; i < originalLength; ++i) {
                array[i] = undefined as any;
            }
        } else if (length > array.length) {
            array.length = length;
        }
        this._length = length;
    }

    /**
     * Gets the internal array.
     */
    get values(): Array<T> {
        return this._array;
    }

    /**
     * Gets the element at an index.
     *
     * @param {number} index The index to get.
     */
    get(index: number): T {
        if (index >= this._array.length) {
            throw new Error('index must be less than array length');
        }
        return this._array[index];
    }

    /**
     * Sets the element at an index. Resizes the array if index is greater than the length of the array.
     *
     * @param {number} index The index to set.
     * @param {T} element The element to set at index.
     */
    set(index: number, element: T): void {
        if (typeof index !== 'number') {
            throw new Error('index must be a number');
        }

        if (index >= this._length) {
            this.length = index + 1;
        }
        this._array[index] = element;
    }

    /**
     * Returns the last element in the array without modifying the array.
     *
     * @returns {T} The last element in the array.
     */
    peek(): T {
        return this._array[this._length - 1];
    }

    /**
     * Push an element into the array.
     *
     * @param {T} element The element to push.
     */
    push(element: T): void {
        const index = this.length++;
        this._array[index] = element;
    }

    /**
     * Pop an element from the array.
     *
     * @returns {T} The last element in the array.
     */
    pop(): T | undefined {
        if (this._length === 0) {
            return undefined;
        }
        const element = this._array[this._length - 1];
        --this.length;
        return element;
    }

    /**
     * Resize the internal array if length > _array.length.
     *
     * @param {number} length The length.
     */
    reserve(length: number): void {
        if (length < 0) {
            throw new Error('length must be greater than or equal to 0');
        }

        if (length > this._array.length) {
            this._array.length = length;
        }
    }

    /**
     * Resize the array.
     *
     * @param {number} length The length.
     */
    resize(length: number): void {
        if (length < 0) {
            throw new Error('length must be greater than or equal to 0');
        }
        this.length = length;
    }

    /**
     * Trim the internal array to the specified length. Defaults to the current length.
     *
     * @param {number} [length] The length.
     */
    trim(length?: number): void {
        const trimLength = length ?? this._length;
        this._array.length = trimLength;
    }
}

export default ManagedArray;