/**
 * Stores tiles with content loaded using a doubly linked list for LRU cache management.
 * 
 * Extracted from Cesium Engine (@cesium/engine/Source/Scene/Cesium3DTilesetCache.js)
 * This is a Cesium internal class not exported in the public API.
 * 
 * @private
 */

/**
 * Simple DoublyLinkedList node implementation
 */
class DoublyLinkedListNode<T = any> {
    item: T;
    previous?: DoublyLinkedListNode<T>;
    next?: DoublyLinkedListNode<T>;

    constructor(item: T, previous?: DoublyLinkedListNode<T>, next?: DoublyLinkedListNode<T>) {
        this.item = item;
        this.previous = previous;
        this.next = next;
    }
}

/**
 * Simple DoublyLinkedList implementation
 */
class DoublyLinkedList<T = any> {
    head?: DoublyLinkedListNode<T>;
    tail?: DoublyLinkedListNode<T>;
    private _length: number = 0;

    get length(): number {
        return this._length;
    }

    /**
     * Adds the item to the end of the list
     */
    add(item?: T): DoublyLinkedListNode<T> {
        const node = new DoublyLinkedListNode(item, this.tail, undefined);

        if (this.tail) {
            this.tail.next = node;
            this.tail = node;
        } else {
            this.head = node;
            this.tail = node;
        }

        ++this._length;
        return node;
    }

    private removeNode(node: DoublyLinkedListNode<T>): void {
        if (node.previous && node.next) {
            node.previous.next = node.next;
            node.next.previous = node.previous;
        } else if (node.previous) {
            // Remove last node
            node.previous.next = undefined;
            this.tail = node.previous;
        } else if (node.next) {
            // Remove first node
            node.next.previous = undefined;
            this.head = node.next;
        } else {
            // Remove last node in the linked list
            this.head = undefined;
            this.tail = undefined;
        }

        node.next = undefined;
        node.previous = undefined;
    }

    /**
     * Removes the given node from the list
     */
    remove(node?: DoublyLinkedListNode<T>): void {
        if (!node) {
            return;
        }

        this.removeNode(node);
        --this._length;
    }

    /**
     * Moves nextNode after node
     */
    splice(node: DoublyLinkedListNode<T>, nextNode: DoublyLinkedListNode<T>): void {
        if (node === nextNode) {
            return;
        }

        // Remove nextNode, then insert after node
        this.removeNode(nextNode);

        const oldNodeNext = node.next;
        node.next = nextNode;

        // nextNode is the new tail
        if (this.tail === node) {
            this.tail = nextNode;
        } else {
            if (oldNodeNext) {
                oldNodeNext.previous = nextNode;
            }
        }

        nextNode.next = oldNodeNext;
        nextNode.previous = node;
    }
}

/**
 * Cesium 3D Tileset cache for managing loaded tiles
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
    }

    /**
     * Reset the cache for a new frame - move sentinel to tail so all tiles may be potentially replaced
     */
    reset(): void {
        // Move sentinel node to the tail so, at the start of the frame, all tiles
        // may be potentially replaced.  Tiles are moved to the right of the sentinel
        // when they are selected so they will not be replaced.
        if (this._list.tail) {
            this._list.splice(this._list.tail, this._sentinel);
        }
    }

    /**
     * Touch a tile to mark it as recently used
     */
    touch(tile: any): void {
        const node = tile.cacheNode;
        if (node) {
            this._list.splice(this._sentinel, node);
        }
    }

    /**
     * Add a tile to the cache
     */
    add(tile: any): void {
        if (!tile.cacheNode) {
            tile.cacheNode = this._list.add(tile);
        }
    }

    /**
     * Unload a specific tile from the cache
     */
    unloadTile(tileset: any, tile: any, unloadCallback: (tileset: any, tile: any) => void): void {
        const node = tile.cacheNode;
        if (!node) {
            return;
        }

        this._list.remove(node);
        tile.cacheNode = undefined;
        unloadCallback(tileset, tile);
    }

    /**
     * Unload tiles from cache based on memory usage
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
            (tileset.totalMemoryUsageInBytes > tileset.cacheBytes || trimTiles)
        ) {
            const tile = node.item;
            node = node.next;
            this.unloadTile(tileset, tile, unloadCallback);
        }
    }

    /**
     * Mark cache for trimming on next unloadTiles call
     */
    trim(): void {
        this._trimTiles = true;
    }
}

export default Cesium3DTilesetCache;