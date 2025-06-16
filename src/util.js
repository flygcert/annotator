"use strict";

var ESCAPE_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#47;"
};

/**
 * Node type constants for DOM nodes.
 */
const NodeTypes = {
  ELEMENT_NODE: 1,
  ATTRIBUTE_NODE: 2,
  TEXT_NODE: 3,
  CDATA_SECTION_NODE: 4,
  ENTITY_REFERENCE_NODE: 5,
  ENTITY_NODE: 6,
  PROCESSING_INSTRUCTION_NODE: 7,
  COMMENT_NODE: 8,
  DOCUMENT_NODE: 9,
  DOCUMENT_TYPE_NODE: 10,
  DOCUMENT_FRAGMENT_NODE: 11,
  NOTATION_NODE: 12
};

/**
 * Represents a browser range and provides normalization utilities.
 */
class BrowserRange {
  /**
   * @param {Object} obj - An object with range properties.
   */
  constructor(obj) {
    // Store range endpoints and ancestor
    this.commonAncestorContainer = obj.commonAncestorContainer;
    this.startContainer = obj.startContainer;
    this.startOffset = obj.startOffset;
    this.endContainer = obj.endContainer;
    this.endOffset = obj.endOffset;
    this.tainted = false; // Prevent multiple normalizations
  }

  /**
   * Normalize the range to text nodes, splitting as needed.
   * @param {Element} root - The root element for normalization.
   * @returns {NormalizedRange}
   */
  normalize(root) {
    if (this.tainted) {
      console.error("You may only call normalize() once on a BrowserRange!");
      return false;
    }
    this.tainted = true;

    const r = {};
    this._normalizeStart(r);
    this._normalizeEnd(r);

    const nr = {};

    // Split start node if needed
    if (r.startOffset > 0) {
      if (r.start.nodeValue.length > r.startOffset) {
        nr.start = r.start.splitText(r.startOffset);
      } else {
        nr.start = r.start.nextSibling;
      }
    } else {
      nr.start = r.start;
    }

    // Handle end node
    if (r.start === r.end) {
      if (nr.start.nodeValue.length > (r.endOffset - r.startOffset)) {
        nr.start.splitText(r.endOffset - r.startOffset);
      }
      nr.end = nr.start;
    } else {
      if (r.end.nodeValue.length > r.endOffset) {
        r.end.splitText(r.endOffset);
      }
      nr.end = r.end;
    }

    // Find common ancestor element
    nr.commonAncestor = this.commonAncestorContainer;
    while (nr.commonAncestor.nodeType !== NodeTypes.ELEMENT_NODE) {
      nr.commonAncestor = nr.commonAncestor.parentNode;
    }

    return new NormalizedRange(nr);
  }

  /**
   * Normalize the start of the range to a text node.
   * @param {Object} r - The result object to populate.
   * @private
   */
  _normalizeStart(r) {
    if (this.startContainer.nodeType === NodeTypes.ELEMENT_NODE) {
      r.start = getFirstTextNodeNotBefore(this.startContainer.childNodes[this.startOffset]);
      r.startOffset = 0;
    } else {
      r.start = this.startContainer;
      r.startOffset = this.startOffset;
    }
  }

  /**
   * Normalize the end of the range to a text node.
   * @param {Object} r - The result object to populate.
   * @private
   */
  _normalizeEnd(r) {
    let n, node;
    if (this.endContainer.nodeType === NodeTypes.ELEMENT_NODE) {
      node = this.endContainer.childNodes[this.endOffset];
      if (node != null) {
        n = node;
        while (n != null && n.nodeType !== NodeTypes.TEXT_NODE) {
          n = n.firstChild;
        }
        if (n != null) {
          r.end = n;
          r.endOffset = 0;
        }
      }
      if (r.end == null) {
        if (this.endOffset) {
          node = this.endContainer.childNodes[this.endOffset - 1];
        } else {
          node = this.endContainer.previousSibling;
        }
        r.end = getLastTextNodeUpTo(node);
        r.endOffset = r.end.nodeValue.length;
      }
    } else {
      r.end = this.endContainer;
      r.endOffset = this.endOffset;
    }
  }

  /**
   * Serialize the normalized range.
   * @param {Element} root
   * @param {boolean} ignoreSelector
   * @returns {Object}
   */
  serialize(root, ignoreSelector) {
    return this.normalize(root).serialize(root, ignoreSelector);
  }
}

/**
 * Represents a normalized range (start/end are text nodes).
 */
class NormalizedRange {
  /**
   * @param {Object} obj - Object with commonAncestor, start, and end nodes.
   */
  constructor(obj) {
    this.commonAncestor = obj.commonAncestor;
    this.start = obj.start;
    this.end = obj.end;
  }

  /**
   * Get all text nodes between start and end (inclusive).
   * @returns {Node[]}
   */
  textNodes() {
    const textNodes = [];
    const walker = document.createTreeWalker(
      this.commonAncestor,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }
    const start = textNodes.indexOf(this.start);
    const end = textNodes.indexOf(this.end);
    return textNodes.slice(start, end + 1);
  }

  /**
   * Serialize the normalized range (stub for compatibility).
   * @param {Element} root
   * @param {boolean} ignoreSelector
   * @returns {Object}
   */
  serialize(root, ignoreSelector) {
    // Implement serialization logic as needed
    return {
      commonAncestor: this.commonAncestor,
      start: this.start,
      end: this.end
    };
  }
}

/**
 * Escapes special HTML characters in a string to prevent HTML injection.
 * @param {string} string - The string to escape.
 * @returns {string} - The escaped string.
 */
function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, c => ESCAPE_MAP[c]);
}

/**
 * Internationalization (i18n) function.
 * Uses global.Gettext if available, otherwise returns the original string.
 * @param {string} msgid - The message id to translate.
 * @returns {string} - The translated string or original if not available.
 */
const gettext = (() => {
    if (typeof global.Gettext === 'function') {
        const _gettext = new global.Gettext({ domain: "annotator" });
        return msgid => _gettext.gettext(msgid);
    }
    return msgid => msgid;
})();


// Returns the absolute position of the mouse relative to the top-left rendered
// corner of the page (taking into account padding/margin/border on the body
// element as necessary).
function mousePosition(event) {
    const body = window.document.body;
    let offset = { top: 0, left: 0 };

    const bodyStyle = window.getComputedStyle(body);
    if (bodyStyle.position !== "static") {
        const rect = body.getBoundingClientRect();
        offset = {
            top: rect.top + window.scrollY,
            left: rect.left + window.scrollX
        };
    }

    return {
        top: `${event.pageY - offset.top}px`,
        left: `${event.pageX - offset.left}px`
    };
}

/**
 * Deeply merges source objects into the target object.
 * Arrays are shallow-copied, objects are merged recursively.
 * @param {Object} target - The target object.
 * @param  {...Object} sources - Source objects.
 * @returns {Object} - The merged object.
 */
function deepMerge(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (typeof target !== 'object' || target === null) target = {};

    if (typeof source === 'object' && source !== null) {
        for (const key of Object.keys(source)) {
            if (
                typeof source[key] === 'object' &&
                source[key] !== null &&
                !Array.isArray(source[key])
            ) {
                target[key] = deepMerge(target[key], source[key]);
            } else {
                target[key] = Array.isArray(source[key])
                    ? source[key].slice()
                    : source[key];
            }
        }
    }

    return deepMerge(target, ...sources);
}

/**
 * Creates a DOM element from an HTML string.
 * Only the first top-level node is returned.
 * @param {string} htmlString - The HTML string.
 * @returns {Element} - The created DOM element.
 */
function createElementFromHTML(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    // Change this to div.childNodes to support multiple top-level nodes.
    return div.firstChild;
}


/**
 * Recursively finds the first text node not before the given node.
 * @param {Node} n
 * @returns {Node|null}
 */
const getFirstTextNodeNotBefore = (n) => {
  let result;
  switch (n.nodeType) {
    case NodeTypes.TEXT_NODE:
      return n;
    case NodeTypes.ELEMENT_NODE:
      if (n.firstChild != null) {
        result = getFirstTextNodeNotBefore(n.firstChild);
        if (result != null) return result;
      }
      break;
  }
  n = n.nextSibling;
  if (n != null) {
    return getFirstTextNodeNotBefore(n);
  }
  return null;
};

/**
 * Recursively finds the last text node up to the given node.
 * @param {Node} n
 * @returns {Node|null}
 */
const getLastTextNodeUpTo = (n) => {
  let result;
  switch (n.nodeType) {
    case NodeTypes.TEXT_NODE:
      return n;
    case NodeTypes.ELEMENT_NODE:
      if (n.lastChild != null) {
        result = getLastTextNodeUpTo(n.lastChild);
        if (result != null) return result;
      }
      break;
  }
  n = n.previousSibling;
  if (n != null) {
    return getLastTextNodeUpTo(n);
  }
  return null;
};

/**
 * Recursively collects all text nodes under a node (not used in main logic).
 * @param {Node} node
 * @returns {Node[]|Node}
 */
const getTextNodes = (node) => {
  if (node && node.nodeType !== NodeTypes.TEXT_NODE) {
    const nodes = [];
    if (node.nodeType !== NodeTypes.COMMENT_NODE) {
      node = node.lastChild;
      while (node) {
        nodes.push(getTextNodes(node));
        node = node.previousSibling;
      }
    }
    return nodes.reverse();
  }
  return node;
};


exports.Promise = Promise;
exports.gettext = gettext;
exports.escapeHtml = escapeHtml;
exports.mousePosition = mousePosition;
exports.deepMerge = deepMerge;
exports.createElementFromHTML = createElementFromHTML;
exports.BrowserRange = BrowserRange;
