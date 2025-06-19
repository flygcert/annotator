"use strict";


import { Widget } from './widget';
import * as util from '../util.js';

// id: Generates a unique identifier for each field instance
const id = (() => {
    let counter = -1;
    return () => ++counter;
})();

/**
 * Prevents the default action for an event, if possible.
 * @param {Event} event - The event to prevent.
 */
const preventEventDefault = (event) => {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }
};

/**
 * Enables drag tracking for a handle element.
 * @param {HTMLElement} handle - The element to make draggable.
 * @param {Function} callback - Called with delta {x, y} on drag.
 * @returns {Object} - Object with a destroy() method to remove listeners.
 */
const dragTracker = (handle, callback) => {
    let lastPos = null;
    let throttled = false;

    // Handles mouse movement during drag
    const mouseMove = (e) => {
        if (throttled || lastPos === null) return;

        const delta = {
            y: e.pageY - lastPos.top,
            x: e.pageX - lastPos.left
        };

        let trackLastMove = true;
        if (typeof callback === 'function') {
            trackLastMove = callback(delta);
        }

        if (trackLastMove !== false) {
            lastPos = {
                top: e.pageY,
                left: e.pageX
            };
        }

        throttled = true;
        setTimeout(() => { throttled = false; }, 1000 / 60);
    };

    // Handles mouse up event to stop dragging
    const mouseUp = () => {
        lastPos = null;
        handle.ownerDocument.removeEventListener('mouseup', mouseUp);
        handle.ownerDocument.removeEventListener('mousemove', mouseMove);
    };

    // Handles mouse down event to start dragging
    const mouseDown = (e) => {
        if (e.target !== handle) {
            return;
        }

        lastPos = {
            top: e.pageY,
            left: e.pageX
        };

        handle.ownerDocument.addEventListener('mouseup', mouseUp);
        handle.ownerDocument.addEventListener('mousemove', mouseMove);

        e.preventDefault();
    };

    // Public destroy method to remove mousedown listener
    const destroy = () => {
        handle.ownerDocument.removeEventListener('mousedown', mouseDown);
    };

    handle.ownerDocument.addEventListener('mousedown', mouseDown);

    return { destroy };
};

/**
 * Makes an element resizable using a handle.
 * @param {HTMLElement} element - The element to resize.
 * @param {HTMLElement} handle - The handle to drag for resizing.
 * @param {Object} options - Options for inversion of axes.
 * @returns {Object} - dragTracker object.
 */
const resizer = (element, handle, options = {}) => {
    // Adjusts delta based on inversion options
    const translate = (delta) => {
        let directionX = 1,
            directionY = -1;

        if (typeof options.invertedX === 'function' && options.invertedX()) {
            directionX = -1;
        }
        if (typeof options.invertedY === 'function' && options.invertedY()) {
            directionY = 1;
        }

        return {
            x: delta.x * directionX,
            y: delta.y * directionY
        };
    };

    // Callback for resizing
    const resize = (delta) => {
        const style = window.getComputedStyle(element);
        const height = parseInt(style.height, 10);
        const width = parseInt(style.width, 10);
        const translated = translate(delta);

        let newWidth = width;
        let newHeight = height;

        if (Math.abs(translated.x) > 0) {
            newWidth = width + translated.x;
            element.style.width = `${newWidth}px`;
        }
        if (Math.abs(translated.y) > 0) {
            newHeight = height + translated.y;
            element.style.height = `${newHeight}px`;
        }

        return (parseInt(element.style.height, 10) !== height || parseInt(element.style.width, 10) !== width);
    };

    return dragTracker(handle, resize);
};

/**
 * Makes an element movable using a handle.
 * @param {HTMLElement} element - The element to move.
 * @param {HTMLElement} handle - The handle to drag for moving.
 * @returns {Object} - dragTracker object.
 */
const mover = (element, handle) => {
    const move = (delta) => {
        let top = parseInt(element.style.top, 10) || 0;
        let left = parseInt(element.style.left, 10) || 0;

        element.style.top = (top + delta.y) + "px";
        element.style.left = (left + delta.x) + "px";
    };

    return dragTracker(handle, move);
};

/**
 * Editor class for editing annotations.
 * Extends Widget.
 */
export class Editor extends Widget {
    // CSS classes for toggling state
    static classes = {
        hide: 'annotator--hide',
    };

    // HTML template for the editor
    static template = [
        '<div class="annotator annotator--editor annotator--hide">',
        '<div class="editor">',
        '<form class="editor__body">',
        '<ul class="editor__listing"></ul>',
        '<div class="editor__controls">',
        `<a href="#cancel" class="btn btn-outline-warning editor__cancel">${util.gettext('Cancel')}</a>`,
        `<a href="#save" class="btn btn-warning editor__save">${util.gettext('Save')}</a>`,
        '</div>',
        '</form>',
        '</div>',
        '</div>'
    ].join('\n');

    // Default configuration options
    static options = {
        defaultFields: true
    };

    /**
     * Creates an Editor instance.
     * @param {Object} options - Configuration options.
     */
    constructor(options) {
        super(options);

        this.fields = [];
        this.annotation = {};

        // Add default textarea field if enabled
        if (this.options.defaultFields) {
            this.addField({
                type: 'textarea',
                label: util.gettext('Comments') + '\u2026',
                load: (field, annotation) => {
                    field.querySelector('textarea').value = annotation.text || '';
                },
                submit: (field, annotation) => {
                    annotation.text = field.querySelector('textarea').value;
                }
            });
        }

        // Bind event listeners
        this.element.querySelector('form').addEventListener('submit', this._onFormSubmit.bind(this));
        this.element.querySelector('.editor__save').addEventListener('click', this._onSaveClick.bind(this));
        this.element.querySelector('.editor__cancel').addEventListener('click', this._onCancelClick.bind(this));
        this.element.querySelector('textarea').addEventListener('keydown', this._onTextareaKeydown.bind(this));
    }

    /**
     * Cleans up event listeners and destroys the editor.
     */
    destroy() {
        const form = this.element.querySelector('form');
        if (form) {
            form.removeEventListener('submit', this._onFormSubmit);
        }

        const saveBtn = this.element.querySelector('.editor__save');
        if (saveBtn) {
            saveBtn.removeEventListener('click', this._onSaveClick);
        }

        const cancelBtn = this.element.querySelector('.editor__cancel');
        if (cancelBtn) {
            cancelBtn.removeEventListener('click', this._onCancelClick);
        }

        const textarea = this.element.querySelector('textarea');
        if (textarea) {
            textarea.removeEventListener('keydown', this._onTextareaKeydown);
        }

        super.destroy(this);
    }

    /**
     * Shows the editor at a given position.
     * @param {Object} [position] - {top, left} CSS values.
     */
    show(position) {
        if (typeof position !== 'undefined' && position !== null) {
            this.element.style.top = position.top;
            this.element.style.left = position.left; 
        }

        super.show(this);

        // Focus the first textarea
        const firstInput = this.element.querySelector('textarea');
        if (firstInput) {
            firstInput.focus();
        }

        this._setupDraggables();
    }

    /**
     * Loads an annotation into the editor and displays it.
     * @param {Object} annotation - The annotation to edit.
     * @param {Object} [position] - Optional position for the editor.
     * @returns {Promise} - Resolves on submit, rejects on cancel.
     */
    load(annotation, position) {
        this.annotation = annotation;

        for (let i = 0, len = this.fields.length; i < len; i++) {
            let field = this.fields[i];
            field.load(field.element, this.annotation);
        }
        
        // Add a default catch to avoid unhandled promise rejection
        const promise = new Promise((resolve, reject) => {
            this.dfd = { resolve, reject };
            this.show(position);
        });
        promise.catch(() => {}); // Prevent unhandled rejection warning
        
        return promise;
    }

    /**
     * Submits the editor, saving changes to the annotation.
     */
    submit() {
        for (let i = 0, len = this.fields.length; i < len; i++) {
            let field = this.fields[i];
            field.submit(field.element, this.annotation);
        }

        if (typeof this.dfd !== 'undefined' && this.dfd !== null) {
            this.dfd.resolve();
        }

        this.hide();
    }

    /**
     * Cancels editing, discarding changes.
     * @returns {Editor} - Returns itself.
     */
    cancel() {
        if (typeof this.dfd !== 'undefined' && this.dfd !== null) {
            this.dfd.reject('editing cancelled');
        }
        this.hide();
        return this;
    }

    /**
     * Adds a form field to the editor.
     * @param {Object} options - Field options.
     * @returns {HTMLElement} - The created <li> element.
     */
    addField(options) {
        let field = Object.assign({
            id: 'editor__field-' + id(),
            type: 'input',
            label: '',
            load: () => {},
            submit: () => {}
        }, options);

        let input = null,
            element = document.createElement('li');
        
        element.className = 'editor__item';

        field.element = element;

        if (field.type === 'textarea') {
            input = document.createElement('textarea');
        } else if (field.type === 'checkbox') {
            input = document.createElement('input');
            input.type = 'checkbox';
        } else if (field.type === 'input') {
            input = document.createElement('input');
        } else if (field.type === 'select') {
            input = document.createElement('select');
        }

        element.appendChild(input);

        input.id = field.id;

        if (field.type !== 'checkbox') {
            input.placeholder = field.label;
        }

        if (field.type === 'checkbox') {
            element.classList.add('annotator-checkbox');

            let label = document.createElement('label');

            label.setAttribute('for', field.id);
            label.innerHTML = field.label;

            element.appendChild(label);
        }

        this.element.querySelector('ul').appendChild(element);
        
        this.fields.push(field);

        return field.element;
    }

    /**
     * Checks and updates the orientation of the editor.
     * @returns {Editor} - Returns itself.
     */
    checkOrientation() {
        Widget.prototype.checkOrientation.call(this);

        const list = this.element.querySelector('ul'),
            controls = this.element.querySelector('.editor__controls');

        if (this.element.classList.contains(this.classes.invert?.y)) {
            this.element.insertBefore(controls, list);
        } else if (this.element.firstElementChild === controls) {
            this.element.insertBefore(list, controls.nextSibling);
        }

        return this;
    }

    /**
     * Handles form submission event.
     * @param {Event} event - The submit event.
     */
    _onFormSubmit(event) {
        preventEventDefault(event);
        this.submit();
    }

    /**
     * Handles save button click event.
     * @param {Event} event - The click event.
     */
    _onSaveClick(event) {
        preventEventDefault(event);
        this.submit();
    }

    /**
     * Handles cancel button click event.
     * @param {Event} event - The click event.
     */
    _onCancelClick(event) {
        preventEventDefault(event);
        this.cancel();
    }

    /**
     * Handles textarea keydown events for special keys.
     * @param {KeyboardEvent} event - The keydown event.
     */
    _onTextareaKeydown(event) {
        if (event.which === 27) {
            // Escape key
            this.cancel();
        } else if (event.which === 13 && !event.shiftKey) {
            // Enter key without shift
            this.submit();
        }
    }

    /**
     * Sets up mouse events for resizing and dragging the editor window.
     */
    _setupDraggables() {
        if (typeof this._resizer !== 'undefined' && this._resizer !== null) {
            this._resizer.destroy();
        }
        if (typeof this._mover !== 'undefined' && this._mover !== null) {
            this._mover.destroy();
        }

        this.element.querySelectorAll('.editor__resize').forEach(handle => handle.remove());

        // Find the first/last item element depending on orientation
        let cornerItem;
        const items = this.element.querySelectorAll('.editor__item');

        if (this.element.classList.contains(this.classes.invert?.y)) {
            cornerItem = items[items.length - 1];
        } else {
            cornerItem = items[0];
        }

        if (cornerItem) {
            const resizeSpan = document.createElement('span');
            resizeSpan.className = 'editor__resize';
            cornerItem.appendChild(resizeSpan);
        }

        const controls = this.element.querySelector('.editor__controls'),
            textarea = this.element.querySelector('textarea'),
            resizeHandle = this.element.querySelector('.editor__resize'),
            self = this;

        this._resizer = resizer(textarea, resizeHandle, {
            invertedX: () => self.element.classList.contains(self.classes.invert?.x),
            invertedY: () => self.element.classList.contains(self.classes.invert?.y)
        });

        this._mover = mover(this.element, controls);
    }
}