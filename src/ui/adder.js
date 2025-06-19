"use strict";

import { Widget } from './widget';
import * as util from '../util.js';

// Adder shows and hides an annotation adder button that can be clicked on to
// create an annotation.
export class Adder extends Widget {
    static template = [
        '<div class="annotator annotator--adder annotator--hide">',
        '<div class="adder">',
        '<div class="adder__body">',
        '<button class="adder__button" type="button">',
        '<span class="fa-solid fa-quote-right adder__icon" aria-hidden="true"></span>',
        '<span class="adder__label">' + util.gettext('Annotate') + '</span>',
        '</button>',
        '</div>',
        '</div>',
        '</div>',
    ].join('\n');

    // Configuration options
    static options = {
        // Callback, called when the user clicks the adder when an
        // annotation is loaded.
        onCreate: null
    };

    ignoreMouseup = false;
    annotation = null;
    direction = null;
    mouseDownOffset = null;

    constructor(options) {
        super(options);

        this.onCreate = this.options.onCreate;

        const button = this.element.querySelector('.adder__button');
        button.addEventListener('click', this._onClick.bind(this));
        button.addEventListener('mousedown', this._onMousedown.bind(this));

        this.document = this.element.ownerDocument;
        this.document.body.addEventListener('mouseup', this._onMouseup.bind(this));
        this.document.body.addEventListener('mousedown', this.textSelectionDirection.bind(this));
        this.document.body.addEventListener('mouseup', this.textSelectionDirection.bind(this));    
    }

    textSelectionDirection(event) {
        if( event.type == 'mousedown' ) {
            this.mouseDownOffset = event.clientY;
        }
        else if( event.type == 'mouseup' ){
            this.direction = event.clientY < this.mouseDownOffset ? 'down' : 'up';
        }
    }

    destroy() {
        // Remove all event listeners added in the constructor
        const button = this.element.querySelector('.adder__button');
        if (button) {
            button.removeEventListener('click', this._onClick);
            button.removeEventListener('mousedown', this._onMousedown);
        }

        if (this.document && this.document.body) {
            this.document.body.removeEventListener('mouseup', this._onMouseup);
            this.document.body.removeEventListener('mousedown', this.textSelectionDirection);
            this.document.body.removeEventListener('mouseup', this.textSelectionDirection);
        }

        Widget.prototype.destroy.call(this);
    }

    // Public: Load an annotation and show the adder.
    //
    // annotation - An annotation Object to load.
    // position - An Object specifying the position in which to show the editor
    //            (optional).
    //
    // If the user clicks on the adder with an annotation loaded, the onCreate
    // handler will be called. In this way, the adder can serve as an
    // intermediary step between making a selection and creating an annotation.
    //
    // Returns nothing.
    load(annotation, position) {
        this.annotation = annotation;
        this.show(position);
    }

    // Public: Show the adder.
    //
    // position - An Object specifying the position in which to show the editor
    //            (optional).
    //
    // Examples
    //
    //   adder.show()
    //   adder.hide()
    //   adder.show({top: '100px', left: '80px'})
    //
    // Returns nothing.
    show(position) {
        if (typeof position !== 'undefined' && position !== null) {
            this.element.style.top = position.top;
            this.element.style.left = position.left;            

            const body = this.element.querySelector('.adder__body');

            if (body) {
                body.classList.remove('arrow-up', 'arrow-down');
                body.classList.add('arrow-' + this.direction);
            }
        }

        Widget.prototype.show.call(this);
    }

    // Event callback: called when the mouse button is depressed on the adder.
    //
    // event - A mousedown Event object
    //
    // Returns nothing.
    _onMousedown(event) {
        // Do nothing for right-clicks, middle-clicks, etc.
        if (event.which > 1) {
            return;
        }

        event.preventDefault();
        // Prevent the selection code from firing when the mouse button is
        // released
        this.ignoreMouseup = true;
    }

    // Event callback: called when the mouse button is released
    //
    // event - A mouseup Event object
    //
    // Returns nothing.
    _onMouseup(event) {
        // Do nothing for right-clicks, middle-clicks, etc.
        if (event.which > 1) {
            return;
        }

        // Prevent the selection code from firing when the ignoreMouseup flag is
        // set
        if (this.ignoreMouseup) {
            event.stopImmediatePropagation();
        }
    }

    // Event callback: called when the adder is clicked. The click event is used
    // as well as the mousedown so that we get the :active state on the adder
    // when clicked.
    //
    // event - A mousedown Event object
    //
    // Returns nothing.
    _onClick(event) {
        // Do nothing for right-clicks, middle-clicks, etc.
        if (event.which > 1) {
            return;
        }

        event.preventDefault();

        // Hide the adder
        this.hide();
        this.ignoreMouseup = false;

        // Create a new annotation
        if (this.annotation !== null && typeof this.onCreate === 'function') {
            this.onCreate(this.annotation, event);
        }
    }
}
