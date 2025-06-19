"use strict";

import { TextPositionAnchor, TextQuoteAnchor } from '../libs/anchors.js';
import * as util from '../util.js';

/**
 * Checks if the given element is part of Annotator UI.
 * @param {Element|TextNode} element
 * @returns {boolean}
 */
const isAnnotator = (element) => {
    let el = element;
    while (el) {
        if (
            el.nodeType === 1 &&
            [...el.classList].some(cls => cls.startsWith('annotator-'))
        ) {
            return true;
        }
        el = el.parentElement;
    }
    return false;
};

/**
 * TextSelector monitors a document (or a specific element) for text selections
 * and can notify another object of a selection event.
 */
export class TextSelector {
    // Default configuration options
    static options = {
        /**
         * Callback, called when the user makes a selection.
         * Receives the list of selected ranges (may be empty) and the DOM Event
         * that was detected as a selection.
         */
        onSelection: null
    };

    /**
     * @param {Element} element - The DOM element to monitor for selections.
     * @param {Object} options - Configuration options.
     */
    constructor(element, options) {
        this.element = element;
        // Merge user options with defaults
        this.options = util.deepMerge({}, TextSelector.options, options);
        this.onSelection = this.options.onSelection;

        if (typeof this.element.ownerDocument !== 'undefined' &&
            this.element.ownerDocument !== null) {
            this.document = this.element.ownerDocument;

            // Bind event handler to this instance and store reference for removal
            this._onMouseUp = this._checkForEndSelection.bind(this);
            this.document.body.addEventListener("mouseup", this._onMouseUp);
        } else {
            console.warn(
                "You created an instance of the TextSelector on an " +
                "element that doesn't have an ownerDocument. This won't " +
                "work! Please ensure the element is added to the DOM " +
                "before the plugin is configured:", this.element
            );
        }
    }

    /**
     * Clean up event listeners.
     */
    destroy() {
        if (this.document && this._onMouseUp) {
            this.document.body.removeEventListener("mouseup", this._onMouseUp);
        }
    }

    /**
     * Get all selection ranges inside a given element.
     * @param {string|Element} selector - CSS selector or DOM element.
     * @returns {Range[]} Array of Range objects inside the element.
     */
    getRangesInsideElement(selector) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return [];

        const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!container) return [];

        const validRanges = [];

        for (let i = 0; i < selection.rangeCount; i++) {
            const range = selection.getRangeAt(i);

            if (!range.intersectsNode(container)) continue;

            const newRange = document.createRange();

            // Calculate Start
            if (container.contains(range.startContainer)) {
                newRange.setStart(range.startContainer, range.startOffset);
            } else {
                const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
                const firstText = walker.nextNode();
                if (!firstText) continue;
                newRange.setStart(firstText, 0);
            }

            // Calculate End
            if (container.contains(range.endContainer)) {
                newRange.setEnd(range.endContainer, range.endOffset);
            } else {
                const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
                let lastText = null, node;
                while (node = walker.nextNode()) lastText = node;
                if (!lastText) continue;
                newRange.setEnd(lastText, lastText.textContent.length);
            }

            // Only add non-collapsed ranges (start != end)
            if (!(newRange.startContainer === newRange.endContainer && newRange.startOffset === newRange.endOffset)) {
                validRanges.push(newRange);
            }
        }

        return validRanges;
    }

    /**
     * Generate an array of selectors for a given range.
     * @param {Range} range
     * @returns {Array} Array of selectors.
     */
    getSelectors(range) {
        const results = [];
        const types = [TextPositionAnchor, TextQuoteAnchor];

        for (const type of types) {
            try {
                const anchor = type.fromRange(this.element, range, this.options);
                results.push(anchor.toSelector(this.options));
            } catch (e) {
                // Ignore errors for unsupported selector types
                continue;
            }
        }
        return results;
    }

    /**
     * Event callback: called when the mouse button is released.
     * Checks to see if a selection has been made and if so, notifies via callback.
     * @param {MouseEvent} event
     * @private
     */
    _checkForEndSelection(event) {
        const _nullSelection = () => {
            if (typeof this.onSelection === 'function') {
                this.onSelection([], event);
            }
        };

        // Get the currently selected ranges.
        const selectedRanges = [];

        // Get ranges inside the monitored element
        selectedRanges.push(this.getRangesInsideElement(this.element));

        if (selectedRanges[0].length === 0) {
            _nullSelection();
            return;
        }

        // Ignore selection if it is part of Annotator UI.
        for (const range of selectedRanges[0]) {
            let container = range.commonAncestorContainer;
            if (container.classList && container.classList.contains('annotator-hl')) {
                // Find first ancestor that does not have 'annotator-hl' class
                let parent = container.parentElement;
                while (parent && parent.classList && parent.classList.contains('annotator-hl')) {
                    parent = parent.parentElement;
                }
                container = parent;
            }
            if (isAnnotator(container)) {
                _nullSelection();
                return;
            }
        }

        const selection = window.getSelection();
        // Most browsers do not support multi-select, so just append selectors for the first range
        selectedRanges.push(this.getSelectors(selection.getRangeAt(0)));

        if (typeof this.onSelection === 'function') {
            this.onSelection(selectedRanges, event);
        }
    }
}
