/**
 * @fileoverview Heap Sort implementation for use with Huffman coding.
 */

export class Heap {
    buffer: Uint16Array;
    length: number = 0;
    nodes: number = 0;
    
    /**
     * A heap implementation for use with custom Huffman codes.
     * @param {number} size Heap size
     * @constructor
     */
    constructor(size: number) {
        this.buffer = new Uint16Array(size * 2);
    }

    /**
     * Get the parent node index
     * @param {number} index Child node index
     * @return {number} Parent node index.
     */
    getParent(index: number): number {
        return ((index - 2) >> 2) << 1;
    };

    /**
     * Get the index of a child node
     * @param {number} index Parent node index.
     * @return {number} Child node index.
     */
    getChild(index: number): number {
        return 2 * index + 2;
    };

    /**
     * Add a value to Heap
     * @param {number} index key index.
     * @param {number} value Value.
     * @return {number} Current heap length.
     */
    push(index: number, value: number): number {
        var current, parent,
            heap = this.buffer,
            swap;

        current = this.length;
        heap[this.length++] = value;
        heap[this.length++] = index;
        this.nodes++;

        // Swapping until the root node is reached
        while (current > 0) {
            parent = this.getParent(current);

            // Compare with the parent node and swap their places if the parent is smaller
            if (heap[current] > heap[parent]) {
                swap = heap[current];
                heap[current] = heap[parent];
                heap[parent] = swap;

                swap = heap[current + 1];
                heap[current + 1] = heap[parent + 1];
                heap[parent + 1] = swap;

                current = parent;
            } else {
                // Exit when replacement is no longer needed
                break;
            }
        }

        return this.length;
    };

    /**
     * Pops the largest value from the heap
     * @return {{index: number, value: number, length: number}} {index: key index,
     *     value: key, length: new heap size}
     */
    pop(): {index: number, value: number, length: number} {
        var heap = this.buffer, swap;

        var value = heap[0];
        var index = heap[1];

        // Get the value one before this
        this.nodes--;
        this.length -= 2;
        heap[0] = heap[this.length];
        heap[1] = heap[this.length + 1];

        var parent = 0;
        // Go down the tree from the root node
        while (true) {
            var current = this.getChild(parent);

            // check range
            if (current >= this.length) {
                break;
            }

            // Compare with the neighboring node. If it has a larger value, use it as the current node instead.
            if (current + 2 < this.length && heap[current + 2] > heap[current]) {
                current += 2;
            }

            // Swap is the parent is smaller than the current node
            if (heap[current] > heap[parent]) {
                swap = heap[parent];
                heap[parent] = heap[current];
                heap[current] = swap;

                swap = heap[parent + 1];
                heap[parent + 1] = heap[current + 1];
                heap[current + 1] = swap;
            } else {
                break;
            }

            parent = current;
        }

        return { index: index, value: value, length: this.length };
    };

}