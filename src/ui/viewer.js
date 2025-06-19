"use strict";

import { Widget } from './widget';
import * as util from '../util';

// preventEventDefault prevents an event's default, but handles the condition
// that the event is null or doesn't have a preventDefault function.
const preventEventDefault = (event) => {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }
};

/**
 * Viewer class for displaying annotation items.
 * Extends Widget and provides UI for viewing, editing, and deleting annotations.
 */
export class Viewer extends Widget {
    // CSS classes for toggling annotator state
    static classes = {
        showControls: 'annotator--visible'
    };

    // HTML template for the main viewer widget
    static template = [
        '<div class="annotator annotator--viewer annotator--hide">',
        '<div class="viewer">',
        '<div class="viewer__body">',
        '<ul class="viewer__listing"></ul>',
        '</div>',
        '</div>',
        '</div>'
    ].join('\n');

    // HTML template for a single annotation item
    static itemTemplate = [
        '<li class="viewer__annotation viewer__item">',
        '<span class="viewer__controls">',
        '<div class="svg-icon svg-icon--small svg-icon--yellow"><a href="#edit" class="viewer__edit">',
        '<img decoding="async" aria-hidden="true" height="16" src="/media/templates/site/g5_flygcert/images/icons/pencil-line-edit.svg" alt="">',
        '</a></div>',
        '<div class="svg-icon svg-icon--small svg-icon--yellow"><a href="#delete" class="viewer__delete">',
        '<img decoding="async" aria-hidden="true" height="16" src="/media/templates/site/g5_flygcert/images/icons/trash-01.svg" alt="">',
        '</a></div>',
        '</span>',
        '</li>'
    ].join('\n');

    // Default configuration options
    static options = {
        defaultFields: true,
        inactivityDelay: 500,
        activityDelay: 100,
        permitEdit: () => false,
        permitDelete: () => false,
        autoViewHighlights: null,
        onEdit: () => {},
        onDelete: () => {}
    };

    // Instance properties
    itemTemplate = Viewer.itemTemplate;
    fields = [];
    annotations = [];
    hideTimer = null;
    hideTimerPromise = null;
    hideTimerActivity = null;
    mouseDown = false;

    /**
     * Creates an instance of the Viewer object.
     * @param {Object} options - Configuration options for the viewer.
     */
    constructor(options) {
        super(options);

        // Default render function for annotation text
        this.render = (annotation) => {
            if (annotation.text) {
                return util.escapeHtml(annotation.text);
            } else {
                return `<i>${util.gettext('No comment')}</i>`;
            }
        };

        const self = this;

        // Add default field if enabled
        if (this.options.defaultFields) {
            this.addField({
                load: function (field, annotation) {
                    field.innerHTML = self.render(annotation);
                }
            });
        }

        // Validate required callbacks
        if (typeof this.options.onEdit !== 'function') {
            throw new TypeError("onEdit callback must be a function");
        }
        if (typeof this.options.onDelete !== 'function') {
            throw new TypeError("onDelete callback must be a function");
        }
        if (typeof this.options.permitEdit !== 'function') {
            throw new TypeError("permitEdit callback must be a function");
        }
        if (typeof this.options.permitDelete !== 'function') {
            throw new TypeError("permitDelete callback must be a function");
        }

        // Setup highlight event listeners if enabled
        if (this.options.autoViewHighlights) {
            this.document = this.options.autoViewHighlights.ownerDocument;

            this.options.autoViewHighlights.addEventListener("mouseover", (event) => {
                if (event.target.classList.contains('annotator-hl')) {
                    self._onHighlightMouseover(event);
                }
            });

            this.options.autoViewHighlights.addEventListener("mouseleave", (event) => {
                if (event.target.classList.contains('annotator-hl')) {
                    self._startHideTimer();
                }
            });

            this.document.body.addEventListener("mousedown", (event) => {
                if (event.which === 1) {
                    self.mouseDown = true;
                }
            });

            this.document.body.addEventListener("mouseup", (event) => {
                if (event.which === 1) {
                    self.mouseDown = false;
                }
            });
        }

        // Event listeners for viewer controls
        this.element.addEventListener("click", (event) => {
            if (event.target.closest('.viewer__edit')) {
                self._onEditClick(event);
            } else if (event.target.closest('.viewer__delete')) {
                self._onDeleteClick(event);
            }
        });

        this.element.addEventListener("mouseenter", () => {
            self._clearHideTimer();
        });

        this.element.addEventListener("mouseleave", () => {
            self._startHideTimer();
        });
    }

    /**
     * Clean up event listeners and resources.
     */
    destroy() {
        if (this.options.autoViewHighlights) {
            this.options.autoViewHighlights.removeEventListener("mouseover", this._onHighlightMouseover);
            this.options.autoViewHighlights.removeEventListener("mouseleave", this._startHideTimer);

            if (this.document && this.document.body) {
                this.document.body.removeEventListener("mousedown", this._onBodyMouseDown);
                this.document.body.removeEventListener("mouseup", this._onBodyMouseUp);
            }
        }

        this.element.removeEventListener("click", this._onElementClick);
        this.element.removeEventListener("mouseenter", this._onElementMouseEnter);
        this.element.removeEventListener("mouseleave", this._onElementMouseLeave);

        super.destroy(this);
    }

    /**
     * Show the viewer at a specific position.
     * @param {Object} position - {top, left} CSS position.
     */
    show(position) {
        if (position) {
            this.element.style.top = position.top;
            this.element.style.left = position.left;
        }

        const controls = this.element.querySelectorAll('.viewer__controls');
        controls.forEach(control => {
            control.classList.add(this.constructor.classes.showControls);
        });

        setTimeout(() => {
            controls.forEach(control => {
                control.classList.remove(this.constructor.classes.showControls);
            });
        }, 500);

        super.show(this);
    }

    /**
     * Load annotations into the viewer and show it.
     * @param {Array} annotations - Array of annotation objects.
     * @param {Object} position - Optional position to show the viewer.
     */
    load(annotations = [], position) {
        this.annotations = annotations;

        // Clear the annotation list
        const list = this.element.querySelector('ul');
        if (list) {
            list.innerHTML = '';
        }

        // Add each annotation item to the list
        for (const annotation of this.annotations) {
            const item = this._annotationItem(annotation);
            if (list) {
                list.appendChild(item);
            }

            item.annotation = annotation; // Attach annotation data
        }

        this.show(position);
    }

    /**
     * Set the annotation renderer function.
     * @param {Function} renderer - Function that returns HTML for an annotation.
     */
    setRenderer(renderer) {
        this.render = renderer;
    }

    /**
     * Create the list item for a single annotation.
     * @param {Object} annotation - Annotation data.
     * @returns {HTMLElement} - List item element.
     */
    _annotationItem(annotation) {
        // Create a new list item from the template
        const item = util.createElementFromHTML(this.itemTemplate);

        // Find controls, edit, and delete elements
        const controls = item.querySelector('.viewer__controls');
        const edit = controls ? controls.querySelector('.viewer__edit') : null;
        const del = controls ? controls.querySelector('.viewer__delete') : null;

        const controller = {};

        // Show or remove edit button based on permissions
        if (this.options.permitEdit(annotation)) {
            controller.showEdit = () => {
                if (edit) edit.removeAttribute('disabled');
            };
            controller.hideEdit = () => {
                if (edit) edit.setAttribute('disabled', 'disabled');
            };
        } else if (edit) {
            edit.parentNode && edit.parentNode.removeChild(edit);
        }

        // Show or remove delete button based on permissions
        if (this.options.permitDelete(annotation)) {
            controller.showDelete = () => {
                if (del) del.removeAttribute('disabled');
            };
            controller.hideDelete = () => {
                if (del) del.setAttribute('disabled', 'disabled');
            };
        } else if (del) {
            del.parentNode && del.parentNode.removeChild(del);
        }

        // Add custom fields to the annotation item
        for (let i = 0, len = this.fields.length; i < len; i++) {
            const field = this.fields[i];
            const fieldElement = field.element.cloneNode(true);
            item.appendChild(fieldElement);
            field.load(fieldElement, annotation, controller);
        }

        return item;
    }

    /**
     * Add an additional field to an annotation view.
     * @param {Object} options - Field options, including a load callback.
     * @returns {Viewer} - Returns itself for chaining.
     */
    addField(options = {}) {
        const field = {
            load: () => {},
            ...options,
            element: document.createElement('div')
        };

        this.fields.push(field);

        return this;
    }

    /**
     * Event callback: called when the edit button is clicked.
     * @param {Event} event - Click event.
     */
    _onEditClick(event) {
        preventEventDefault(event);

        const annotationElement = event.target.closest('.viewer__annotation');
        const item = annotationElement ? annotationElement.annotation : undefined;

        this.hide();

        this.options.onEdit(item);
    }

    /**
     * Event callback: called when the delete button is clicked.
     * @param {Event} event - Click event.
     */
    _onDeleteClick(event) {
        preventEventDefault(event);

        if (window.confirm(util.gettext('Delete this annotation?'))) {
            const annotationElement = event.target.closest('.viewer__annotation');
            const item = annotationElement ? annotationElement.annotation : undefined;

            this.hide();

            this.options.onDelete(item);
        }
    }

    /**
     * Event callback: called when a user triggers mouseover on a highlight element.
     * @param {Event} event - Mouseover event.
     */
    _onHighlightMouseover(event) {
        // If the mouse button is currently depressed, don't show the viewer.
        if (this.mouseDown) {
            return;
        }

        this._startHideTimer(true)
            .then(() => {
                // Collect all parent elements (including the target) with class 'annotator-hl'
                const elements = [];
                let el = event.target;
                while (el) {
                    if (el.classList && el.classList.contains('annotator-hl')) {
                        elements.push(el);
                    }
                    el = el.parentElement;
                }
                // Get the annotation data from each element
                const annotations = elements.map(elem => elem.annotation);

                // Show the viewer with the wanted annotations
                this.load(annotations, util.mousePosition(event));
            });
    }

    /**
     * Starts the hide timer. Returns a promise that resolves when the viewer is hidden.
     * @param {boolean} activity - True if hiding due to user activity.
     * @returns {Promise}
     */
    _startHideTimer(activity = false) {
        // If timer has already been set, use that one.
        if (this.hideTimer) {
            if (!activity || this.hideTimerActivity === activity) {
                return this.hideTimerPromise;
            } else {
                // The pending timeout is an inactivity timeout, so likely to be
                // too slow. Clear the pending timeout and start a new (shorter) one!
                this._clearHideTimer();
            }
        }

        const timeout = activity ? this.options.activityDelay : this.options.inactivityDelay;

        let resolveFn, rejectFn;
        this.hideTimerPromise = new Promise((resolve, reject) => {
            resolveFn = resolve;
            rejectFn = reject;
        }).catch(() => {
            // Timer was cleared/cancelled, do nothing
        });
        this.hideTimerPromise.resolve = resolveFn;
        this.hideTimerPromise.reject = rejectFn;

        if (!this.isShown()) {
            this.hideTimer = null;
            this.hideTimerPromise.resolve();
            this.hideTimerActivity = null;
        } else {
            this.hideTimer = setTimeout(() => {
                this.hide();
                this.hideTimerPromise.resolve();
                this.hideTimer = null;
            }, timeout);
            this.hideTimerActivity = Boolean(activity);
        }

        return this.hideTimerPromise;
    }

    /**
     * Clears the hide timer and rejects any pending promise.
     */
    _clearHideTimer() {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        if (this.hideTimerPromise && typeof this.hideTimerPromise.reject === 'function') {
            this.hideTimerPromise.reject();
        }
        this.hideTimerActivity = null;
    }
}