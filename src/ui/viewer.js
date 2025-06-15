/* global window */
"use strict";

var Widget = require('./widget').Widget,
    util = require('../util');

var _t = util.gettext;

// preventEventDefault prevents an event's default, but handles the condition
// that the event is null or doesn't have a preventDefault function.
const preventEventDefault = (event) => {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }
};

// Public: Creates an element for viewing annotations.
class Viewer extends Widget {
    // Classes for toggling annotator state.
    static classes = {
        showControls: 'annotator--visible'
    };

    // HTML templates for this.widget and this.item properties.
    static template = [
        '<div class="annotator annotator--viewer annotator--hide">',
        '<div class="viewer">',
        '<div class="viewer__body">',
        '<ul class="viewer__listing"></ul>',
        '</div>',
        '</div>',
        '</div>'
    ].join('\n');

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

    // Configuration options
    static options = {
        // Add the default field(s) to the viewer.
        defaultFields: true,

        // Time, in milliseconds, before the viewer is hidden when a user mouses off
        // the viewer.
        inactivityDelay: 500,

        // Time, in milliseconds, before the viewer is updated when a user mouses
        // over another annotation.
        activityDelay: 100,

        // Hook, passed an annotation, which determines if the viewer's "edit"
        // button is shown. If it is not a function, the button will not be shown.
        permitEdit: function () { return false; },

        // Hook, passed an annotation, which determines if the viewer's "delete"
        // button is shown. If it is not a function, the button will not be shown.
        permitDelete: function () { return false; },

        // If set to a DOM Element, will set up the viewer to automatically display
        // when the user hovers over Annotator highlights within that element.
        autoViewHighlights: null,

        // Callback, called when the user clicks the edit button for an annotation.
        onEdit: function () {},

        // Callback, called when the user clicks the delete button for an
        // annotation.
        onDelete: function () {}
    };

    itemTemplate = Viewer.itemTemplate;
    fields = [];
    annotations = [];
    hideTimer = null;
    hideTimerPromise = null;
    hideTimerActivity = null;
    mouseDown = false;

    // Public: Creates an instance of the Viewer object.
    //
    // options - An Object containing options.
    //
    // Examples
    //
    //   # Creates a new viewer, adds a custom field and displays an annotation.
    //   viewer = new Viewer()
    //   viewer.addField({
    //     load: someLoadCallback
    //   })
    //   viewer.load(annotation)
    //
    // Returns a new Viewer instance.
    constructor(options) {
        super(options);

        this.render = function (annotation) {
            if (annotation.text) {
                return util.escapeHtml(annotation.text);
            } else {
                return "<i>" + _t('No comment') + "</i>";
            }
        };

        var self = this;

        if (this.options.defaultFields) {
            this.addField({
                load: function (field, annotation) {
                    field.innerHTML = self.render(annotation);
                }
            });
        }

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

        if (this.options.autoViewHighlights) {
            this.document = this.options.autoViewHighlights.ownerDocument;

            this.options.autoViewHighlights.addEventListener("mouseover", function (event) {
                if (event.target.classList.contains('annotator-hl')) {
                    self._onHighlightMouseover(event);
                }
            });

            this.options.autoViewHighlights.addEventListener("mouseleave", function (event) {
                if (event.target.classList.contains('annotator-hl')) {
                    self._startHideTimer();
                }
            });

            this.document.body.addEventListener("mousedown", function (e) {
                if (e.which === 1) {
                    self.mouseDown = true;
                }
            });

            this.document.body.addEventListener("mouseup", function (e) {
                if (e.which === 1) {
                    self.mouseDown = false;
                }
            });
        }

        // Replace jQuery event delegation with native event listeners
        this.element.addEventListener("click", function (e) {
            if (e.target.closest('.viewer__edit')) {
                self._onEditClick.bind(this);
            } else if (e.target.closest('.viewer__delete')) {
                self._onDeleteClick.bind(this);
            }
        });

        this.element.addEventListener("mouseenter", function () {
            self._clearHideTimer();
        });

        this.element.addEventListener("mouseleave", function () {
            self._startHideTimer();
        });
    }

    destroy() {
        if (this.options.autoViewHighlights) {
            // Remove event listeners from autoViewHighlights
            this.options.autoViewHighlights.removeEventListener("mouseover", this._onHighlightMouseover);
            this.options.autoViewHighlights.removeEventListener("mouseleave", this._startHideTimer);

            if (this.document && this.document.body) {
                this.document.body.removeEventListener("mousedown", this._onBodyMouseDown);
                this.document.body.removeEventListener("mouseup", this._onBodyMouseUp);
            }
        }

        // Remove event listeners from this.element
        this.element.removeEventListener("click", this._onElementClick);
        this.element.removeEventListener("mouseenter", this._onElementMouseEnter);
        this.element.removeEventListener("mouseleave", this._onElementMouseLeave);

        super.destroy(this);
    }

    // Public: Show the viewer.
    //
    // position - An Object specifying the position in which to show the editor
    //            (optional).
    //
    // Examples
    //
    //   viewer.show()
    //   viewer.hide()
    //   viewer.show({top: '100px', left: '80px'})
    //
    // Returns nothing.
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

    // Public: Load annotations into the viewer and show it.
    //
    // annotation - An Array of annotations.
    //
    // Examples
    //
    //   viewer.load([annotation1, annotation2, annotation3])
    //
    // Returns nothing.
    load(annotations = [], position) {
        this.annotations = annotations;

        // Find the first <ul> element and clear its contents
        const list = this.element.querySelector('ul');
        if (list) {
            list.innerHTML = '';
        }

        for (const annotation of this.annotations) {
            const item = this._annotationItem(annotation);
            
            if (list) {
                list.appendChild(item);
            }

            item.annotation = annotation; // Attach annotation data
        }

        this.show(position);
    }

    // Public: Set the annotation renderer.
    //
    // renderer - A function that accepts an annotation and returns HTML.
    //
    // Returns nothing.
    setRenderer(renderer) {
        this.render = renderer;
    }

    // Private: create the list item for a single annotation
    _annotationItem(annotation) {
        // Create a new list item from the template
        const temp = document.createElement('div');
        temp.innerHTML = this.itemTemplate;
        const item = temp.firstElementChild;

        // Find controls, edit, and delete elements
        const controls = item.querySelector('.viewer__controls');
        const edit = controls ? controls.querySelector('.viewer__edit') : null;
        const del = controls ? controls.querySelector('.viewer__delete') : null;

        const controller = {};

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

        for (let i = 0, len = this.fields.length; i < len; i++) {
            const field = this.fields[i];
            const fieldElement = field.element.cloneNode(true);
            item.appendChild(fieldElement);
            field.load(fieldElement, annotation, controller);
        }

        return item;
    }

    // Public: Adds an additional field to an annotation view. A callback can be
    // provided to update the view on load.
    //
    // options - An options Object. Options are as follows:
    //           load - Callback Function called when the view is loaded with an
    //                  annotation. Recieves a newly created clone of an item
    //                  and the annotation to be displayed (it will be called
    //                  once for each annotation being loaded).
    //
    // Examples
    //
    //   # Display a user name.
    //   viewer.addField({
    //     # This is called when the viewer is loaded.
    //     load: (field, annotation) ->
    //       field = $(field)
    //
    //       if annotation.user
    //         field.text(annotation.user) # Display the user
    //       else
    //         field.remove()              # Do not display the field.
    //   })
    //
    // Returns itself.
    addField(options = {}) {
        const field = {
            load: () => {},
            ...options,
            element: document.createElement('div')
        };

        this.fields.push(field);

        return this;
    }

    // Event callback: called when the edit button is clicked.
    //
    // event - An Event object.
    //
    // Returns nothing.
    _onEditClick(event) {
        preventEventDefault(event);

        const annotationElement = event.target.closest('.viewer__annotation');
        const item = annotationElement ? annotationElement.annotation : undefined;

        this.hide();

        this.options.onEdit(item);
    }

    // Event callback: called when the delete button is clicked.
    //
    // event - An Event object.
    //
    // Returns nothing.
    _onDeleteClick (event) {
        preventEventDefault(event);

        if (window.confirm(_t('Delete this annotation?'))) {
            // Find the closest parent with class 'viewer__annotation'
            const annotationElement = event.target.closest('.viewer__annotation');
            const item = annotationElement ? annotationElement.annotation : undefined;

            this.hide();

            this.options.onDelete(item);
        }
    }

    // Event callback: called when a user triggers `mouseover` on a highlight
    // element.
    //
    // event - An Event object.
    //
    // Returns nothing.
    _onHighlightMouseover(event) {
        // If the mouse button is currently depressed, we're probably trying to
        // make a selection, so we shouldn't show the viewer.
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

                // Now show the viewer with the wanted annotations
                this.load(annotations, util.mousePosition(event));
            })
    }

    // Starts the hide timer. This returns a promise that is resolved when the
    // viewer has been hidden. If the viewer is already hidden, the promise will
    // be resolved instantly.
    //
    // activity - A boolean indicating whether the need to hide is due to a user
    //            actively indicating a desire to view another annotation (as
    //            opposed to merely mousing off the current one). Default: false
    //
    // Returns a Promise.
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

    // Clears the hide timer. Also rejects any promise returned by a previous
    // call to _startHideTimer.
    //
    // Returns nothing.
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
};

exports.Viewer = Viewer;