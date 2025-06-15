"use strict";

import * as util from '../util.js';

const createElementFromHTML = util.createElementFromHTML;

/**
 * Base class for Editor and Viewer widgets.
 * Provides shared methods for widget lifecycle, visibility, and orientation.
 */
export class Widget {
    /**
     * CSS classes used to alter widget state.
     */
    static classes = {
        hide: 'annotator--hide',
        invert: {
            x: 'annotator-invert-x',
            y: 'annotator-invert-y'
        }
    };

    /**
     * Default HTML template for the widget.
     */
    static template = "<div></div>";

    /**
     * Default options for the widget.
     * @property {string|Element} appendTo - Selector or element to append the widget to.
     */
    static options = {
        appendTo: 'body'
    };

    /**
     * Create a new Widget instance.
     * @param {Object} options - Widget options.
     */
    constructor(options = {}) {
        // Create the widget's root element from the template
        this.element = createElementFromHTML(this.constructor.template.trim());

        // Merge class and option defaults with subclass and instance options
        this.classes = { ...Widget.classes, ...this.constructor.classes };
        this.options = { ...Widget.options, ...this.constructor.options, ...options };
        this.extensionsInstalled = false;
    }

    /**
     * Destroy the widget, unbinding all events and removing the element.
     */
    destroy() {
        this.element.remove();
    }

    /**
     * Execute all widget extensions, if any are provided in options.
     */
    installExtensions() {
        if (this.options.extensions) {
            this.options.extensions.forEach(extension => extension(this));
        }
    }

    /**
     * Ensure extensions are installed only once.
     * @private
     */
    _maybeInstallExtensions() {
        if (!this.extensionsInstalled) {
            this.extensionsInstalled = true;
            this.installExtensions();
        }
    }

    /**
     * Attach the widget to the DOM and install extensions.
     */
    attach() {
        document.querySelector(this.options.appendTo).append(this.element);
        this._maybeInstallExtensions();
    }

    /**
     * Show the widget and check orientation.
     */
    show() {
        this.element.classList.remove(this.classes.hide);
        this.checkOrientation();
    }

    /**
     * Hide the widget.
     */
    hide() {
        this.element.classList.add(this.classes.hide);
    }

    /**
     * Check if the widget is currently visible.
     * @returns {boolean}
     */
    isShown() {
        return !this.element.classList.contains(this.classes.hide);
    }

    /**
     * Check and adjust widget orientation based on viewport.
     * Inverts X or Y if widget would overflow.
     * @returns {Widget} this
     */
    checkOrientation() {
        this.resetOrientation();

        const widget = this.element.firstElementChild;
        if (!widget) return this;

        const rect = widget.getBoundingClientRect();

        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        const viewport = {
            top: scrollTop,
            right: window.innerWidth + scrollLeft
        };

        const current = {
            top: rect.top + scrollTop,
            right: rect.left + scrollLeft + rect.width
        };

        if ((current.top - viewport.top) < 0) {
            this.invertY();
        }

        if ((current.right - viewport.right) > 0) {
            this.invertX();
        }

        return this;
    }

    /**
     * Reset widget orientation on both axes.
     * @returns {Widget} this
     */
    resetOrientation() {
        this.element.classList.remove(this.classes.invert.x, this.classes.invert.y);
        return this;
    }

    /**
     * Invert widget on the X axis (right align).
     * @returns {Widget} this
     */
    invertX() {
        this.element.classList.add(this.classes.invert.x);
        return this;
    }

    /**
     * Invert widget on the Y axis (upside down).
     * @returns {Widget} this
     */
    invertY() {
        this.element.classList.add(this.classes.invert.y);
        return this;
    }

    /**
     * Check if widget is currently inverted on the Y axis.
     * @returns {boolean}
     */
    isInvertedY() {
        return this.element.classList.contains(this.classes.invert.y);
    }

    /**
     * Check if widget is currently inverted on the X axis.
     * @returns {boolean}
     */
    isInvertedX() {
        return this.element.classList.contains(this.classes.invert.x);
    }
}
