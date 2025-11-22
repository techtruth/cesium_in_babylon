/**
 * A doubly linked list data structure.
 * 
 * Extracted from Cesium Engine (@cesium/engine/Source/Core/DoublyLinkedList.js)
 * This is a Cesium internal class not exported in the public API.
 *
 * @private
 */

import { defined } from 'cesium';

/**
 * A node in a doubly linked list
 * @private
 */
export class DoublyLinkedListNode<T = any> {
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
 * A doubly linked list implementation
 * @private
 */
export class DoublyLinkedList<T = any> {
    head?: DoublyLinkedListNode<T>;
    tail?: DoublyLinkedListNode<T>;
    private _length: number = 0;

    constructor() {
        this.head = undefined;
        this.tail = undefined;
        this._length = 0;
    }

    get length(): number {
        return this._length;
    }

    /**
     * Adds the item to the end of the list
     */
    add(item?: T): DoublyLinkedListNode<T> {
        const node = new DoublyLinkedListNode(item, this.tail, undefined);

        if (defined(this.tail)) {
            this.tail!.next = node;
            this.tail = node;
        } else {
            this.head = node;
            this.tail = node;
        }

        ++this._length;

        return node;
    }

    /**
     * Removes a node from the list
     */
    remove(node: DoublyLinkedListNode<T>): void {
        if (!defined(node)) {
            return;
        }

        if (defined(node.previous) && defined(node.next)) {
            node.previous!.next = node.next;
            node.next!.previous = node.previous;
        } else if (defined(node.previous)) {
            // Remove last node
            node.previous!.next = undefined;
            this.tail = node.previous;
        } else if (defined(node.next)) {
            // Remove first node
            node.next!.previous = undefined;
            this.head = node.next;
        } else {
            // Remove only node
            this.head = undefined;
            this.tail = undefined;
        }

        node.next = undefined;
        node.previous = undefined;

        --this._length;
    }

    /**
     * Moves nextNode after node - CESIUM EXACT COPY
     */
    splice(node: DoublyLinkedListNode<T>, nextNode: DoublyLinkedListNode<T>): void {
        if (node === nextNode) {
            return;
        }

        // Remove nextNode, then insert after node - CESIUM EXACT
        // Use internal remove logic (without _length decrement)
        if (defined(nextNode.previous) && defined(nextNode.next)) {
            nextNode.previous!.next = nextNode.next;
            nextNode.next!.previous = nextNode.previous;
        } else if (defined(nextNode.previous)) {
            // Remove last node
            nextNode.previous!.next = undefined;
            this.tail = nextNode.previous;
        } else if (defined(nextNode.next)) {
            // Remove first node
            nextNode.next!.previous = undefined;
            this.head = nextNode.next;
        } else {
            // Remove last node in the linked list
            this.head = undefined;
            this.tail = undefined;
        }

        nextNode.next = undefined;
        nextNode.previous = undefined;

        // CESIUM EXACT: Insert after node
        const oldNodeNext = node.next;
        node.next = nextNode;

        // nextNode is the new tail
        if (this.tail === node) {
            this.tail = nextNode;
        } else if (defined(oldNodeNext)) {
            oldNodeNext.previous = nextNode;
        }

        nextNode.next = oldNodeNext;
        nextNode.previous = node;
        
        // CESIUM EXACT: No _length change in splice - it's a move operation
    }
}