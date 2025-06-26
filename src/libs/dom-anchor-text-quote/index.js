'use strict';

import * as textPosition from 'dom-anchor-text-position';

const CONTEXT_LENGTH = 32;

export const fromRange = (root, range) => {
  if (root === undefined) {
    throw new Error('missing required parameter "root"');
  }
  if (range === undefined) {
    throw new Error('missing required parameter "range"');
  }

  const position = textPosition.fromRange(root, range);
  return fromTextPosition(root, position);
};

export const fromTextPosition = (root, selector) => {
  if (root === undefined) {
    throw new Error('missing required parameter "root"');
  }
  if (selector === undefined) {
    throw new Error('missing required parameter "selector"');
  }

  const { start, end } = selector;

  if (start === undefined) {
    throw new Error('selector missing required property "start"');
  }
  if (start < 0) {
    throw new Error('property "start" must be a non-negative integer');
  }
  if (end === undefined) {
    throw new Error('selector missing required property "end"');
  }
  if (end < 0) {
    throw new Error('property "end" must be a non-negative integer');
  }

  const exact = root.textContent.substr(start, end - start);

  const prefixStart = Math.max(0, start - CONTEXT_LENGTH);
  const prefix = root.textContent.substr(prefixStart, start - prefixStart);

  const suffixEnd = Math.min(root.textContent.length, end + CONTEXT_LENGTH);
  const suffix = root.textContent.substr(end, suffixEnd - end);

  return { exact, prefix, suffix };
};

export const toRange = (root, selector, options = {}) => {
  const position = toTextPosition(root, selector, options);
  if (position === null) {
    return null;
  } else {
    return textPosition.toRange(root, position);
  }
};

export const toTextPosition = (root, selector, options = {}) => {
  if (root === undefined) {
    throw new Error('missing required parameter "root"');
  }
  if (selector === undefined) {
    throw new Error('missing required parameter "selector"');
  }

  const { exact, prefix, suffix } = selector;

  if (exact === undefined) {
    throw new Error('selector missing required property "exact"');
  }

  const hint = options.hint;
  let loc = hint === undefined ? 0 : hint;
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  let result = -1;
  const havePrefix = prefix !== undefined;
  const haveSuffix = suffix !== undefined;
  let foundPrefix = false;

  // If the prefix is known then search for that first.
  if (havePrefix) {
    result = root.textContent.indexOf(prefix, loc);
    if (result > -1) {
      loc = result + prefix.length;
      foundPrefix = true;
    }
  }

  // If we have a suffix, and the prefix wasn't found, then search for it.
  if (haveSuffix && !foundPrefix) {
    result = root.textContent.indexOf(suffix, loc + exact.length);
    if (result > -1) {
      loc = result - exact.length;
    }
  }

  // Search for the first slice.
  result = root.textContent.indexOf(exact, loc);
  if (result > -1) {
    start = result;
    end = start + exact.length;
  } else {
    return null;
  }

  return { start, end }
}
