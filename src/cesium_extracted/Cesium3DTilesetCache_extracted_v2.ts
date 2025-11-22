/**
 * Stores tiles with content loaded using a doubly linked list for LRU cache management.
 * 
 * Extracted from Cesium Engine (@cesium/engine/Source/Scene/Cesium3DTilesetCache.js)
 * This is a Cesium internal class not exported in the public API.
 * 
 * @private
 */

import { defined } from 'cesium';
import { DoublyLinkedList, DoublyLinkedListNode } from './DoublyLinkedList_extracted';

/**
 * Cesium3DTilesetCache implementation
 */
export class Cesium3DTilesetCache {
    private _list: DoublyLinkedList<any>;
    private _sentinel: DoublyLinkedListNode<any>;
    private _trimTiles: boolean = false;

    constructor() {
        // [head, sentinel) -> tiles that weren't selected this frame and may be removed from the cache
        // (sentinel, tail] -> tiles that were selected this frame
        this._list = new DoublyLinkedList();
        this._sentinel = this._list.add();
        this._trimTiles = false;
    }

    /**
     * Reset the cache for a new frame
     */
    reset(): void {
        // Move sentinel node to the tail so, at the start of the frame, all tiles
        // may be potentially replaced. Tiles are moved to the right of the sentinel
        // when they are selected so they will not be replaced.
        this._list.splice(this._list.tail!, this._sentinel);
    }

    /**
     * Touch a tile to mark it as recently used
     */
    touch(tile: any): void {
        const node = tile.cacheNode;
        if (defined(node)) {
            this._list.splice(this._sentinel, node);
        }
    }

    /**
     * Add a tile to the cache
     */
    add(tile: any): void {
        if (!defined(tile.cacheNode)) {
            tile.cacheNode = this._list.add(tile);
        }
    }

    /**
     * Unload a specific tile from the cache
     */
    unloadTile(tileset: any, tile: any, unloadCallback: (tileset: any, tile: any) => void): void {
        const node = tile.cacheNode;
        if (!defined(node)) {
            return;
        }

        this._list.remove(node);
        tile.cacheNode = undefined;        // CESIUM EXACT: Set to undefined BEFORE callback
        unloadCallback(tileset, tile);     // CESIUM EXACT: Callback called AFTER cleanup
    }

    /**
     * Unload tiles to maintain cache size
     */
    unloadTiles(tileset: any, unloadCallback: (tileset: any, tile: any) => void): void {
        const trimTiles = this._trimTiles;
        this._trimTiles = false;

        const list = this._list;

        // Traverse the list only to the sentinel since tiles/nodes to the
        // right of the sentinel were used this frame.
        //
        // The sub-list to the left of the sentinel is ordered from LRU to MRU.
        const sentinel = this._sentinel;
        let node = list.head;
        while (
            node !== sentinel &&
            (tileset.totalMemoryUsageInBytes > tileset.cacheBytes || trimTiles)  // CESIUM EXACT
        ) {
            const tile = node.item;
            node = node.next;
            this.unloadTile(tileset, tile, unloadCallback);
        }
    }

    /**
     * Trim the cache
     */
    trim(): void {
        this._trimTiles = true;
    }
}

export default Cesium3DTilesetCache;