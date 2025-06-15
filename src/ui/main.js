/*package annotator.ui */
"use strict";

var util = require('../util');

var adder = require('./adder');
var editor = require('./editor');
var highlighter = require('./highlighter');
var textselector = require('./textselector');
var viewer = require('./viewer');


// trim strips whitespace from either end of a string.
//
// This usually exists in native code, but not in IE8.
const trim = s => {
    if (typeof String.prototype.trim === 'function') {
        return String.prototype.trim.call(s);
    } else {
        return s.replace(/^[\s\xA0]+|[\s\xA0]+$/g, '');
    }
};


// annotationFactory returns a function that can be used to construct an
// annotation from a list of selected ranges.
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
 * function:: main([options])
 *
 * A module that provides a default user interface for Annotator that allows
 * users to create annotations by selecting text within (a part of) the
 * document.
 *
 * Example::
 *
 *     app.include(annotator.ui.main);
 *
 * :param Object options:
 *
 *   .. attribute:: options.element
 *
 *      A DOM element to which event listeners are bound. Defaults to
 *      ``document.body``, allowing annotation of the whole document.
 *
 *   .. attribute:: options.editorExtensions
 *
 *      An array of editor extensions. See the
 *      :class:`~annotator.ui.editor.Editor` documentation for details of editor
 *      extensions.
 *
 *   .. attribute:: options.viewerExtensions
 *
 *      An array of viewer extensions. See the
 *      :class:`~annotator.ui.viewer.Viewer` documentation for details of viewer
 *      extensions.
 *
 */
const main = (options = {}) => {
    options.element = options.element || global.document.body;
    options.editorExtensions = options.editorExtensions || [];
    options.viewerExtensions = options.viewerExtensions || [];

    // Local helpers
    const makeAnnotation = annotationFactory(options.element, '.annotator-hl');

    // Object to hold local state
    const s = {
        interactionPoint: null
    };

    const start = app => {
        const ident = app.registry.getUtility('identityPolicy');
        const authz = app.registry.getUtility('authorizationPolicy');

        s.adder = new adder.Adder({
            onCreate: ann => {
                app.annotations.create(ann);
            }
        });
        s.adder.attach();

        s.editor = new editor.Editor({
            extensions: options.editorExtensions
        });
        s.editor.attach();

        s.highlighter = new highlighter.Highlighter(options.element);

        s.textselector = new textselector.TextSelector(options.element, {
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

        s.viewer = new viewer.Viewer({
            onEdit: ann => {
                // Copy the interaction point from the shown viewer:
                const el = s.viewer.element;
                const style = window.getComputedStyle(el);
                s.interactionPoint = {
                    top: style.top,
                    left: style.left
                };

                app.annotations.update(ann);
            },
            onDelete: ann => {
                app.annotations['delete'](ann);
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

        destroy: () => {
            s.adder.destroy();
            s.editor.destroy();
            s.highlighter.destroy();
            s.textselector.destroy();
            s.viewer.destroy();
        },

        annotationsLoaded: anns => { s.highlighter.drawAll(anns); },
        annotationCreated: ann => { s.highlighter.draw(ann); },
        annotationDeleted: ann => { s.highlighter.undraw(ann); },
        annotationUpdated: ann => { s.highlighter.redraw(ann); },

        beforeAnnotationCreated: annotation => {
            // Editor#load returns a promise that is resolved if editing
            // completes, and rejected if editing is cancelled. We return it
            // here to "stall" the annotation process until the editing is
            // done.
            return s.editor.load(annotation, s.interactionPoint);
        },

        beforeAnnotationUpdated: annotation => {
            return s.editor.load(annotation, s.interactionPoint);
        }
    };
};


exports.main = main;
