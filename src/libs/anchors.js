"use strict";

import { fromRange as textPositionFromRange, toRange as textPositionToRange } from 'dom-anchor-text-position';
import { fromRange as textQuoteFromRange, toRange as textQuoteToRange, toTextPosition } from './dom-anchor-text-quote';

/**
 * Converts between TextPositionSelector selectors and Range objects.
 */
export class TextPositionAnchor {
  /**
   * @param {Element} root
   * @param {number} start
   * @param {number} end
   */
  constructor(root, start, end) {
    this.root = root;
    this.start = start;
    this.end = end;
  }

  /**
   * Create a TextPositionAnchor from a DOM Range.
   * @param {Element} root
   * @param {Range} range
   * @returns {TextPositionAnchor}
   */
  static fromRange(root, range) {
    const selector = textPositionFromRange(root, range);
    return TextPositionAnchor.fromSelector(root, selector);
  }

  /**
   * Create a TextPositionAnchor from a selector object.
   * @param {Element} root
   * @param {Object} selector
   * @returns {TextPositionAnchor}
   */
  static fromSelector(root, selector) {
    return new TextPositionAnchor(root, selector.start, selector.end);
  }

  /**
   * Serialize this anchor to a selector object.
   * @returns {Object}
   */
  toSelector() {
    return {
      type: 'TextPositionSelector',
      start: this.start,
      end: this.end
    };
  }

  /**
   * Convert this anchor to a DOM Range.
   * @returns {Range}
   */
  toRange() {
    return textPositionToRange(this.root, {
      start: this.start,
      end: this.end
    });
  }
}

/**
 * Converts between TextQuoteSelector selectors and Range objects.
 */
export class TextQuoteAnchor {
  /**
   * @param {Element} root
   * @param {string} exact
   * @param {Object} [context={}]
   */
  constructor(root, exact, context = {}) {
    this.root = root;
    this.exact = exact;
    this.context = context;
  }

  /**
   * Create a TextQuoteAnchor from a DOM Range.
   * @param {Element} root
   * @param {Range} range
   * @param {Object} [options]
   * @returns {TextQuoteAnchor}
   */
  static fromRange(root, range, options) {
    const selector = textQuoteFromRange(root, range, options);
    return TextQuoteAnchor.fromSelector(root, selector);
  }

  /**
   * Create a TextQuoteAnchor from a selector object.
   * @param {Element} root
   * @param {Object} selector
   * @returns {TextQuoteAnchor}
   */
  static fromSelector(root, selector) {
    const { prefix, suffix } = selector;
    return new TextQuoteAnchor(root, selector.exact, { prefix, suffix });
  }

  /**
   * Serialize this anchor to a selector object.
   * @returns {Object}
   */
  toSelector() {
    return {
      type: 'TextQuoteSelector',
      exact: this.exact,
      prefix: this.context.prefix,
      suffix: this.context.suffix
    };
  }

  /**
   * Convert this anchor to a DOM Range.
   * @param {Object} [options]
   * @returns {Range}
   */
  toRange(options = {}) {
    const range = textQuoteToRange(this.root, this.toSelector(), options);
    if (range === null) {
      throw new Error('Quote not found');
    }
    return range;
  }

  /**
   * Convert this anchor to a TextPositionAnchor.
   * @param {Object} [options]
   * @returns {TextPositionAnchor}
   */
  toPositionAnchor(options = {}) {
    const anchor = toTextPosition(this.root, this.toSelector(), options);
    if (anchor === null) {
      throw new Error('Quote not found');
    }
    return new TextPositionAnchor(this.root, anchor.start, anchor.end);
  }
}
