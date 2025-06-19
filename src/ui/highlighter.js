"use strict";

import { TextPositionAnchor, TextQuoteAnchor } from '../libs/anchors.js';
import * as util from '../util.js';

// highlightRange wraps the DOM Nodes within the provided range with a highlight
// element of the specified class and returns the highlight Elements.
//
// normedRange - A NormalizedRange to be highlighted.
// cssClass - A CSS class to use for the highlight (default: 'annotator-hl')
//
// Returns an array of highlight Elements.
const highlightRange = (normedRange, cssClass = 'annotator-hl') => {
    const white = /^\s*$/;

    // Ignore text nodes that contain only whitespace characters. This prevents
    // spans being injected between elements that can only contain a restricted
    // subset of nodes such as table rows and lists. This does mean that there
    // may be the odd abandoned whitespace node in a paragraph that is skipped
    // but better than breaking table layouts.
    const nodes = normedRange.textNodes();
    const results = [];

    for (const node of nodes) {
        if (!white.test(node.nodeValue)) {
            const hl = document.createElement('span');
            hl.className = cssClass;
            node.parentNode.replaceChild(hl, node);
            hl.appendChild(node);

            results.push(hl);
        }
    }

    return results;
};


// reanchorRange will attempt to normalize a range, swallowing Range.RangeErrors
// for those ranges which are not reanchorable in the current document.
const reanchorRange = (range, rootElement) => {
    try {
        return new util.BrowserRange(range).normalize(rootElement);
    } catch (e) {
        throw e;
    }
};

const querySelector = async (type, root, selector, options) => {
    try {
        const anchor = type.fromSelector(root, selector, options);
        const range = anchor.toRange(options);

        return range;
    } catch (e) {
        throw e;
    }
};

// selectorsToRange will attempt to convert selectors to a range
const selectorsToRange = async (annotation, rootElement) => {
    let position = null,
        quote = null,
        selectors = [],
        options = {};

    const targets = annotation.target ?? [];

    for (const target of targets) {
        if (!target.selector) continue;
        selectors = target.selector;
    }

    for (const selector of selectors) {
        switch (selector.type) {
            case 'TextPositionSelector':
                position = selector;
                break;
            case 'TextQuoteSelector':
                quote = selector;
                break;
        }
    }

    const maybeAssertQuote = r => {
        if (quote?.exact != null && r.toString() !== quote.exact) {
            throw new Error('quote mismatch');
        }
        return r;
    };

    // Try each selector type in order of specificity
    if (position) {
        try {
            const r = await querySelector(TextPositionAnchor, rootElement, position);
            return maybeAssertQuote(r);
        } catch (e) {
            // fall through
        }
    }
    if (quote) {
        try {
            return await querySelector(TextQuoteAnchor, rootElement, quote, options);
        } catch (e) {
            // fall through
        }
    }

    throw new Error('unable to anchor');
};

// Highlighter provides a simple way to draw highlighted <span> tags over
// annotated ranges within a document.
//
// element - The root Element on which to dereference annotation ranges and
//           draw highlights.
// options - An options Object containing configuration options for the plugin.
//           See `Highlighter.options` for available options.
//
export class Highlighter {
    static options = {
        // The CSS class to apply to drawn highlights
        highlightClass: 'annotator-hl',
        // Number of annotations to draw at once
        chunkSize: 10,
        // Time (in ms) to pause between drawing chunks of annotations
        chunkDelay: 10
    };
    

    constructor(element, options) {
        this.element = element;
        this.options = util.deepMerge({}, Highlighter.options, options);
    }

    destroy() {
        this.element.querySelectorAll("." + this.options.highlightClass).forEach(el => {
            // Move all child nodes out of the highlight span
            while (el.firstChild) {
                el.parentNode.insertBefore(el.firstChild, el);
            }
            // Remove the highlight span itself
            el.parentNode.removeChild(el);
        });
    }

    // Public: Draw highlights for all the given annotations
    //
    // annotations - An Array of annotation Objects for which to draw highlights.
    //
    // Returns nothing.
    async drawAll(annotations) {
        const highlights = [];
        const clone = annotations.slice();

        const loader = async (annList) => {
            if (!annList) return;

            const now = annList.splice(0, this.options.chunkSize);
            for (const annotation of now) {
                const result = await this.draw(annotation);
                if (Array.isArray(result)) {
                    highlights.push(...result);
                }
            }

            if (annList.length > 0) {
                await new Promise(resolve => setTimeout(resolve, this.options.chunkDelay));
                await loader(annList);
            }
        };

        await loader(clone);
        
        return highlights;
    }

    // Public: Draw highlights for the annotation.
    //
    // annotation - An annotation Object for which to draw highlights.
    //
    // Returns an Array of drawn highlight elements.
    async draw(annotation) {
        const normedRanges = [];

        const range = await selectorsToRange(annotation, this.element);

        if (!annotation._local) {
            annotation._local = {};
        }

        if (!annotation._local.ranges) {
            annotation._local.ranges = [];
        }
        annotation._local.ranges = [range];

        for (let i = 0, ilen = annotation._local.ranges.length; i < ilen; i++) {
            const r = reanchorRange(annotation._local.ranges[i], this.element);
            if (r !== null) {
                normedRanges.push(r);
            }
        }

        if (!annotation._local.highlights) {
            annotation._local.highlights = [];
        }

        for (let normed of normedRanges) {
            annotation._local.highlights.push(
                ...highlightRange(normed, this.options.highlightClass)
            );
        }

        // Save the annotation data on each highlighter element.
        for (const hl of annotation._local.highlights) {
            hl.annotation = annotation;
        }

        // Add a data attribute for annotation id if the annotation has one
        if (typeof annotation.id !== 'undefined' && annotation.id !== null) {
            for (const hl of annotation._local.highlights) {
                hl.setAttribute('data-annotation-id', annotation.id);
            }
        }

        return annotation._local.highlights;
    }

    // Public: Remove the drawn highlights for the given annotation.
    //
    // annotation - An annotation Object for which to purge highlights.
    //
    // Returns nothing.
    undraw(annotation) {
        const hasHighlights = annotation._local?.highlights != null;

        if (!hasHighlights) {
            return;
        }

        for (const h of annotation._local.highlights) {
            if (h.parentNode !== null) {
                while (h.firstChild) {
                    h.parentNode.insertBefore(h.firstChild, h);
                }
                h.parentNode.removeChild(h);
            }
        }
        
        delete annotation._local.highlights;
    }

    // Public: Redraw the highlights for the given annotation.
    //
    // annotation - An annotation Object for which to redraw highlights.
    //
    // Returns the list of newly-drawn highlights.
    redraw(annotation) {
        this.undraw(annotation);
        
        return this.draw(annotation);
    }
};
