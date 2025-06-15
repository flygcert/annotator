"use strict";

var Widget = require('./widget').Widget,
    util = require('../util');

var _t = util.gettext;

// id returns an identifier unique within this session
const id = (() => {
    let counter = -1;
    return () => ++counter;
})();


// preventEventDefault prevents an event's default, but handles the condition
// that the event is null or doesn't have a preventDefault function.
const preventEventDefault = (event) => {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }
};

// dragTracker is a function which allows a callback to track changes made to
// the position of a draggable "handle" element.
//
// handle - A DOM element to make draggable
// callback - Callback function
//
// Callback arguments:
//
// delta - An Object with two properties, "x" and "y", denoting the amount the
//         mouse has moved since the last (tracked) call.
//
// Callback returns: Boolean indicating whether to track the last movement. If
// the movement is not tracked, then the amount the mouse has moved will be
// accumulated and passed to the next mousemove event.
//
const dragTracker = (handle, callback) => {
    let lastPos = null;
    let throttled = false;

    // Event handler for mousemove
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

    // Event handler for mouseup
    const mouseUp = () => {
        lastPos = null;
        handle.ownerDocument.removeEventListener('mouseup', mouseUp);
        handle.ownerDocument.removeEventListener('mousemove', mouseMove);
    };

    // Event handler for mousedown -- starts drag tracking
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

    // Public: turn off drag tracking for this dragTracker object.
    const destroy = () => {
        handle.ownerDocument.removeEventListener('mousedown', mouseDown);
    };

    handle.ownerDocument.addEventListener('mousedown', mouseDown);

    return { destroy };
};

// resizer is a component that uses a dragTracker under the hood to track the
// dragging of a handle element, using that motion to resize another element.
//
// element - DOM Element to resize
// handle - DOM Element to use as a resize handle
// options - Object of options.
//
// Available options:
//
// invertedX - If this option is defined as a function, and that function
//             returns a truthy value, the horizontal sense of the drag will be
//             inverted. Useful if the drag handle is at the left of the
//             element, and so dragging left means "grow the element"
// invertedY - If this option is defined as a function, and that function
//             returns a truthy value, the vertical sense of the drag will be
//             inverted. Useful if the drag handle is at the bottom of the
//             element, and so dragging down means "grow the element"
const resizer = (element, handle, options = {}) => {
    // Translate the delta supplied by dragTracker into a delta that takes
    // account of the invertedX and invertedY callbacks if defined.
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

    // Callback for dragTracker
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

    // We return the dragTracker object in order to expose its methods.
    return dragTracker(handle, resize);
};

// mover is a component that uses a dragTracker under the hood to track the
// dragging of a handle element, using that motion to move another element.
//
// element - DOM Element to move
// handle - DOM Element to use as a move handle
//
const mover = (element, handle) => {
    const move = (delta) => {
        // Get current top and left, default to 0 if not set
        let top = parseInt(element.style.top, 10) || 0;
        let left = parseInt(element.style.left, 10) || 0;

        element.style.top = (top + delta.y) + "px";
        element.style.left = (left + delta.x) + "px";
    };

    // We return the dragTracker object in order to expose its methods.
    return dragTracker(handle, move);
};

// Public: Creates an element for editing annotations.
class Editor extends Widget {
    // Classes to toggle state.
    static classes = {
        hide: 'annotator--hide',
    };

    // HTML template for this.element.
    static template = [
        '<div class="annotator annotator--editor annotator--hide">',
        '<div class="editor">',
        '<form class="editor__body">',
        '<ul class="editor__listing"></ul>',
        '<div class="editor__controls">',
        '<a href="#cancel" class="btn btn-outline-warning editor__cancel">' + _t('Cancel') + '</a>',
        '<a href="#save" class="btn btn-warning editor__save">' + _t('Save') + '</a>',
        '</div>',
        '</form>',
        '</div>',
        '</div>'
    ].join('\n');

    // Configuration options
    static options = {
        // Add the default field(s) to the editor.
        defaultFields: true
    };

    // Public: Creates an instance of the Editor object.
    //
    // options - An Object literal containing options.
    //
    // Examples
    //
    //   # Creates a new editor, adds a custom field and
    //   # loads an annotation for editing.
    //   editor = new Annotator.Editor
    //   editor.addField({
    //     label: 'My custom input field',
    //     type:  'textarea'
    //     load:  someLoadCallback
    //     save:  someSaveCallback
    //   })
    //   editor.load(annotation)
    //
    // Returns a new Editor instance.
    constructor(options) {
        super(options);

        this.fields = [];
        this.annotation = {};

        if (this.options.defaultFields) {
            this.addField({
                type: 'textarea',
                label: _t('Comments') + '\u2026',
                load: function (field, annotation) {
                    field.querySelector('textarea').value = annotation.text || '';
                },
                submit: function (field, annotation) {
                    annotation.text = field.querySelector('textarea').value;
                }
            });
        }

        this.element.querySelector('form').addEventListener('submit', this._onFormSubmit.bind(this));
        this.element.querySelector('.editor__save').addEventListener('click', this._onSaveClick.bind(this));
        this.element.querySelector('.editor__cancel').addEventListener('click', this._onCancelClick.bind(this));
        this.element.querySelector('textarea').addEventListener('keydown', this._onTextareaKeydown.bind(this));
    }

    destroy() {
        // Remove all event listeners added in the constructor
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

    // Public: Show the editor.
    //
    // position - An Object specifying the position in which to show the editor
    //            (optional).
    //
    // Examples
    //
    //   editor.show()
    //   editor.hide()
    //   editor.show({top: '100px', left: '80px'})
    //
    // Returns nothing.
    show(position) {
        if (typeof position !== 'undefined' && position !== null) {
            this.element.style.top = position.top;
            this.element.style.left = position.left; 
        }

        super.show(this);

        // give main textarea focus
        const firstInput = this.element.querySelector('textarea');
        if (firstInput) {
            firstInput.focus();
        }

        this._setupDraggables();
    }

    // Public: Load an annotation into the editor and display it.
    //
    // annotation - An annotation Object to display for editing.
    // position - An Object specifying the position in which to show the editor
    //            (optional).
    //
    // Returns a Promise that is resolved when the editor is submitted, or
    // rejected if editing is cancelled.
    load(annotation, position) {
        this.annotation = annotation;

        for (let i = 0, len = this.fields.length; i < len; i++) {
            let field = this.fields[i];
            field.load(field.element, this.annotation);
        }
        
        return new Promise((resolve, reject) => {
            this.dfd = { resolve, reject };
            this.show(position);
        });
    }

    // Public: Submits the editor and saves any changes made to the annotation.
    //
    // Returns nothing.
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

    // Public: Cancels the editing process, discarding any edits made to the
    // annotation.
    //
    // Returns itself.
    cancel() {
        if (typeof this.dfd !== 'undefined' && this.dfd !== null) {
            this.dfd.reject('editing cancelled');
        }
        this.hide();
    }

    // Public: Adds an additional form field to the editor. Callbacks can be
    // provided to update the view and anotations on load and submission.
    //
    // options - An options Object. Options are as follows:
    //           id     - A unique id for the form element will also be set as
    //                    the "for" attribute of a label if there is one.
    //                    (default: "annotator-field-{number}")
    //           type   - Input type String. One of "input", "textarea",
    //                    "checkbox", "select" (default: "input")
    //           label  - Label to display either in a label Element or as
    //                    placeholder text depending on the type. (default: "")
    //           load   - Callback Function called when the editor is loaded
    //                    with a new annotation. Receives the field <li> element
    //                    and the annotation to be loaded.
    //           submit - Callback Function called when the editor is submitted.
    //                    Receives the field <li> element and the annotation to
    //                    be updated.
    //
    // Examples
    //
    //   # Add a new input element.
    //   editor.addField({
    //     label: "Tags",
    //
    //     # This is called when the editor is loaded use it to update your
    //     # input.
    //     load: (field, annotation) ->
    //       # Do something with the annotation.
    //       value = getTagString(annotation.tags)
    //       $(field).find('input').val(value)
    //
    //     # This is called when the editor is submitted use it to retrieve data
    //     # from your input and save it to the annotation.
    //     submit: (field, annotation) ->
    //       value = $(field).find('input').val()
    //       annotation.tags = getTagsFromString(value)
    //   })
    //
    //   # Add a new checkbox element.
    //   editor.addField({
    //     type: 'checkbox',
    //     id: 'annotator-field-my-checkbox',
    //     label: 'Allow anyone to see this annotation',
    //     load: (field, annotation) ->
    //       # Check what state of input should be.
    //       if checked
    //         $(field).find('input').attr('checked', 'checked')
    //       else
    //         $(field).find('input').removeAttr('checked')

    //     submit: (field, annotation) ->
    //       checked = $(field).find('input').is(':checked')
    //       # Do something.
    //   })
    //
    // Returns the created <li> Element.
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

    checkOrientation() {
        Widget.prototype.checkOrientation.call(this);

        const list = this.element.querySelector('ul'),
            controls = this.element.querySelector('.editor__controls');

        if (this.element.classList.contains(this.classes.invert.y)) {
            this.element.insertBefore(controls, list);
        } else if (this.element.firstElementChild === controls) {
            this.element.insertBefore(list, controls.nextSibling);
        }

        return this;
    }

    // Event callback: called when a user clicks the editor form (by pressing
    // return, for example).
    //
    // Returns nothing
    _onFormSubmit(event) {
        preventEventDefault(event);
        this.submit();
    }

    // Event callback: called when a user clicks the editor's save button.
    //
    // Returns nothing
    _onSaveClick(event) {
        preventEventDefault(event);
        this.submit();
    }

    // Event callback: called when a user clicks the editor's cancel button.
    //
    // Returns nothing
    _onCancelClick(event) {
        preventEventDefault(event);
        this.cancel();
    }

    // Event callback: listens for the following special keypresses.
    // - escape: Hides the editor
    // - enter:  Submits the editor
    //
    // event - A keydown Event object.
    //
    // Returns nothing
    _onTextareaKeydown(event) {
        if (event.which === 27) {
            // "Escape" key => abort.
            this.cancel();
        } else if (event.which === 13 && !event.shiftKey) {
            // If "return" was pressed without the shift key, we're done.
            this.submit();
        }
    }

    // Sets up mouse events for resizing and dragging the editor window.
    //
    // Returns nothing.
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

        if (this.element.classList.contains(this.classes.invert.y)) {
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
            invertedX: () => self.element.classList.contains(self.classes.invert.x),
            invertedY: () => self.element.classList.contains(self.classes.invert.y)
        });

        this._mover = mover(this.element, controls);
    }
}

exports.Editor = Editor;