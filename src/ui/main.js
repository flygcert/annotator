/* package annotator.ui */
"use strict";

import { Adder } from './adder.js';
import { Editor } from './editor.js';
import { Highlighter } from './highlighter.js';
import { TextSelector } from './textselector.js';
import { Viewer } from './viewer.js';
import * as util from '../util.js';

/**
 * Trims whitespace from both ends of a string.
 * Uses native String.prototype.trim if available, otherwise falls back to regex.
 * @param {string} s - The string to trim.
 * @returns {string} - The trimmed string.
 */
const trim = s => {
    if (typeof String.prototype.trim === 'function') {
        return String.prototype.trim.call(s);
    } else {
        return s.replace(/^[\s\xA0]+|[\s\xA0]+$/g, '');
    }
};

/**
 * Returns a function that constructs an annotation from a list of selected ranges.
 * @param {HTMLElement} contextEl - The context element.
 * @param {string} ignoreSelector - Selector for elements to ignore.
 * @returns {Function} - Function that takes ranges and returns an annotation object.
 */
const annotationFactory = (contextEl, ignoreSelector) => ranges => {
    const text = [];

    for (let i = 0, len = ranges[0].length; i < len; i++) {
        const r = ranges[0][i];
        text.push(trim(r.toString()));
    }

    const pathOnly = window.location.pathname + window.location.search + window.location.hash;

    return {
        quote: text.join(' / '),
        target: [{
            source: decodeURIComponent(pathOnly),
            selector: ranges[1]
        }]
    };
};

/**
 * Main UI module for Annotator.
 * Provides a default user interface for creating annotations by selecting text.
 * @param {Object} options - Configuration options.
 * @returns {Object} - API with start, destroy, and annotation event handlers.
 */
export const main = (options = {}) => {
    options.element = options.element || window.document.body;
    options.editorExtensions = options.editorExtensions || [];
    options.viewerExtensions = options.viewerExtensions || [];

    // Helper to create annotation objects from selection ranges
    const makeAnnotation = annotationFactory(options.element, '.annotator-hl');

    // Local state object
    const s = {
        interactionPoint: null
    };

    /**
     * Initializes and attaches all UI components.
     * @param {Object} app - The annotator app instance.
     */
    const start = app => {
        const ident = app.registry.getUtility('identityPolicy');
        const authz = app.registry.getUtility('authorizationPolicy');

        // Adder: UI for creating new annotations
        s.adder = new Adder({
            onCreate: ann => {
                app.annotations.create(ann);
            }
        });
        s.adder.attach();

        // Editor: UI for editing annotations
        s.editor = new Editor({
            extensions: options.editorExtensions
        });
        s.editor.attach();

        // Highlighter: Handles annotation highlights in the document
        s.highlighter = new Highlighter(options.element);

        // TextSelector: Handles text selection and triggers adder
        s.textselector = new TextSelector(options.element, {
            onSelection: (ranges, event) => {
                if (ranges.length > 0) {
                    const annotation = makeAnnotation(ranges);
                    s.interactionPoint = util.mousePosition(event);
                    s.adder.load(annotation, s.interactionPoint);
                } else {
                    s.adder.hide();
                }
            }
        });

        // Viewer: UI for viewing, editing, and deleting annotations
        s.viewer = new Viewer({
            onEdit: ann => {
                // Copy the interaction point from the shown viewer
                const el = s.viewer.element;
                const style = window.getComputedStyle(el);
                s.interactionPoint = {
                    top: style.top,
                    left: style.left
                };

                app.annotations.update(ann);
            },
            onDelete: ann => {
                app.annotations.delete(ann);
            },
            permitEdit: ann => authz.permits('update', ann, ident.who()),
            permitDelete: ann => authz.permits('delete', ann, ident.who()),
            autoViewHighlights: options.element,
            extensions: options.viewerExtensions
        });
        s.viewer.attach();
    };

    return {
        start,

        /**
         * Destroys all UI components and cleans up event listeners.
         */
        destroy: () => {
            s.adder.destroy();
            s.editor.destroy();
            s.highlighter.destroy();
            s.textselector.destroy();
            s.viewer.destroy();
        },

        /**
         * Draws all loaded annotations.
         * @param {Array} anns - Array of annotation objects.
         */
        annotationsLoaded: anns => { s.highlighter.drawAll(anns); },

        /**
         * Draws a newly created annotation.
         * @param {Object} ann - The annotation object.
         */
        annotationCreated: ann => { s.highlighter.draw(ann); },

        /**
         * Removes a deleted annotation highlight.
         * @param {Object} ann - The annotation object.
         */
        annotationDeleted: ann => { s.highlighter.undraw(ann); },

        /**
         * Redraws an updated annotation.
         * @param {Object} ann - The annotation object.
         */
        annotationUpdated: ann => { s.highlighter.redraw(ann); },

        /**
         * Called before an annotation is created.
         * Returns a promise that resolves when editing is complete.
         * @param {Object} annotation - The annotation object.
         * @returns {Promise}
         */
        beforeAnnotationCreated: annotation => {
            return s.editor.load(annotation, s.interactionPoint);
        },

        /**
         * Called before an annotation is updated.
         * Returns a promise that resolves when editing is complete.
         * @param {Object} annotation - The annotation object.
         * @returns {Promise}
         */
        beforeAnnotationUpdated: annotation => {
            return s.editor.load(annotation, s.interactionPoint);
        }
    };
};
