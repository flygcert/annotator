/* package annotator.storage */

"use strict";

import * as util from './util.js';

const deepMerge = util.deepMerge;
const _t = util.gettext;

/**
 * Generates a unique identifier for each annotation within the session.
 * @returns {number} Unique ID
 */
const id = (() => {
    let counter = -1;
    return () => ++counter;
})();

/**
 * Debug storage component for development.
 * Logs all storage actions to the console.
 * @returns {object} Storage interface
 */
export const debug = () => {
    const trace = (action, annotation) => {
        const copyAnno = JSON.parse(JSON.stringify(annotation));
        console.debug(`annotator.storage.debug: ${action}`, copyAnno);
    };

    return {
        create(annotation) {
            annotation.id = id();
            trace('create', annotation);
            return annotation;
        },
        update(annotation) {
            trace('update', annotation);
            return annotation;
        },
        delete(annotation) {
            trace('destroy', annotation);
            return annotation;
        },
        query(queryObj) {
            trace('query', queryObj);
            return { results: [], meta: { total: 0 } };
        },
        configure(registry) {
            registry.registerUtility(this, 'storage');
        }
    };
};

/**
 * No-op storage component.
 * Swallows all calls and does not persist data.
 * @returns {object} Storage interface
 */
export const noop = () => ({
    create(annotation) {
        if (annotation.id === undefined || annotation.id === null) {
            annotation.id = id();
        }
        return annotation;
    },
    update: annotation => annotation,
    delete: annotation => annotation,
    query: () => ({ results: [] }),
    configure(registry) {
        registry.registerUtility(this, 'storage');
    }
});

/**
 * Configures an HttpStorage instance as the storage component.
 * @param {object} options - Configuration options
 * @returns {object} Storage interface
 */
export const http = (options = {}) => {
    options.onError = options.onError || ((msg, xhr) => {
        console.error(msg, xhr);
    });

    const storage = new HttpStorage(options);

    return {
        configure(registry) {
            registry.registerUtility(storage, 'storage');
        }
    };
};

/**
 * HttpStorage: communicates with a remote JSON+HTTP API.
 */
export class HttpStorage {
    /**
     * Default configuration options.
     */
    static options = {
        headers: {},
        onError: message => {
            console.error("API request failed: " + message);
        },
        prefix: '/store',
        urls: {
            create: '/annotations',
            update: '/annotations/{id}',
            destroy: '/annotations/{id}',
            search: '/search'
        }
    };

    /**
     * @param {object} options - Custom options
     */
    constructor(options) {
        this.options = deepMerge({}, HttpStorage.options, options);
        this.onError = this.options.onError;
    }

    /**
     * Create an annotation (HTTP POST).
     * @param {object} annotation
     * @returns {Promise<object>}
     */
    create(annotation) {
        return this._apiRequest('create', annotation);
    }

    /**
     * Update an annotation (HTTP PUT).
     * @param {object} annotation
     * @returns {Promise<object>}
     */
    update(annotation) {
        return this._apiRequest('update', annotation);
    }

    /**
     * Delete an annotation (HTTP DELETE).
     * @param {object} annotation
     * @returns {Promise<object>}
     */
    delete(annotation) {
        return this._apiRequest('destroy', annotation);
    }

    /**
     * Search for annotations (HTTP GET).
     * @param {object} queryObj
     * @returns {Promise<{results: Array, meta: object}>}
     */
    async query(queryObj) {
        const obj = await this._apiRequest('search', queryObj);
        const { rows, ...meta } = obj;
        return { results: rows, meta };
    }

    /**
     * Set a custom HTTP header.
     * @param {string} key
     * @param {string} value
     */
    setHeader(key, value) {
        this.options.headers[key] = value;
    }

    /**
     * Internal: Build and send an HTTP request for the given action.
     * @private
     */
    async _apiRequest(action, obj) {
        const id = obj && obj.id;
        let url = this._urlFor(action, id);
        const options = this._apiRequestOptions(action, obj);

        const fetchOptions = {
            method: options.method,
            headers: { ...options.headers }
        };

        if (options.contentType) {
            fetchOptions.headers['Content-Type'] = options.contentType;
        }

        if (options.data) {
            if (fetchOptions.method === 'GET') {
                const params = new URLSearchParams(options.data).toString();
                url += (url.includes('?') ? '&' : '?') + params;
            } else {
                fetchOptions.body = options.data;
            }
        }

        return fetch(url, fetchOptions)
            .then(async response => {
                if (!response.ok) {
                    options.error && options.error(response);
                    throw response;
                }
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return response.json();
                }
                return {};
            })
            .catch(err => {
                if (err instanceof Response && options.error) {
                    options.error(err);
                }
                throw err;
            });
    }

    /**
     * Internal: Build fetch options for the given action.
     * @private
     */
    _apiRequestOptions(action, obj) {
        const method = this._methodFor(action);
        const opts = {
            method,
            dataType: "json",
            error: (...args) => this._onError(...args),
            headers: this.options.headers
        };

        if (action === "search") {
            return { ...opts, data: obj };
        }

        const data = obj && JSON.stringify(obj);
        return { ...opts, data, contentType: "application/json; charset=utf-8" };
    }

    /**
     * Internal: Build the URL for the given action and id.
     * @private
     */
    _urlFor(action, id = '') {
        let url = this.options.prefix || '';
        url += this.options.urls[action];
        return url.replace(/\{id\}/, id);
    }

    /**
     * Internal: Map action to HTTP method.
     * @private
     */
    _methodFor(action) {
        const table = {
            create: 'POST',
            update: 'PUT',
            destroy: 'DELETE',
            search: 'GET'
        };
        return table[action];
    }

    /**
     * Internal: Handle HTTP errors.
     * @private
     */
    _onError(xhr) {
        if (typeof this.onError !== 'function') return;

        let message;
        switch (xhr.status) {
            case 400:
                message = _t("The annotation store did not understand the request! (Error 400)");
                break;
            case 401:
                message = _t("You must be logged in to perform this operation! (Error 401)");
                break;
            case 403:
                message = _t("You don't have permission to perform this operation! (Error 403)");
                break;
            case 404:
                message = _t("Could not connect to the annotation store! (Error 404)");
                break;
            case 500:
                message = _t("Internal error in annotation store! (Error 500)");
                break;
            default:
                message = _t("Unknown error while speaking to annotation store!");
        }
        this.onError(message, xhr);
    }
}

/**
 * StorageAdapter wraps a storage implementation and fires hooks for annotation lifecycle events.
 */
export class StorageAdapter {
    /**
     * @param {object} store - Storage implementation
     * @param {function} runHook - Hook runner
     */
    constructor(store, runHook) {
        this.store = store;
        this.runHook = runHook;
    }

    /**
     * Create a new annotation, firing hooks.
     * @param {object} obj
     * @returns {Promise<object>}
     */
    create(obj = {}) {
        return this._cycle(obj, 'create', 'beforeAnnotationCreated', 'annotationCreated');
    }

    /**
     * Update an annotation, firing hooks.
     * @param {object} obj
     * @returns {Promise<object>}
     */
    update(obj) {
        if (obj.id === undefined || obj.id === null) {
            throw new TypeError("annotation must have an id for update()");
        }
        return this._cycle(obj, 'update', 'beforeAnnotationUpdated', 'annotationUpdated');
    }

    /**
     * Delete an annotation, firing hooks.
     * @param {object} obj
     * @returns {Promise<object>}
     */
    delete(obj) {
        if (obj.id === undefined || obj.id === null) {
            throw new TypeError("annotation must have an id for delete()");
        }
        return this._cycle(obj, 'delete', 'beforeAnnotationDeleted', 'annotationDeleted');
    }

    /**
     * Query the store.
     * @param {object} query
     * @returns {Promise<object>}
     */
    query(query) {
        return Promise.resolve(this.store.query(query));
    }

    /**
     * Load and draw annotations from a query, firing hooks.
     * @param {object} query
     * @returns {Promise<void>}
     */
    async load(query) {
        return this.query(query)
            .then(data => {
                this.runHook('annotationsLoaded', [data.results]);
            });
    }

    /**
     * Internal: Run a storage event, updating the annotation object as needed.
     * @private
     */
    _cycle(obj, storeFunc, beforeEvent, afterEvent) {
        return this.runHook(beforeEvent, [obj])
            .then(() => {
                const safeCopy = deepMerge({}, obj);
                delete safeCopy._local;
                return Promise.resolve(this.store[storeFunc](safeCopy));
            })
            .then(ret => {
                // Remove all properties except _local
                Object.keys(obj).forEach(k => {
                    if (k !== '_local') delete obj[k];
                });
                // Update with store return value
                Object.assign(obj, ret);
                this.runHook(afterEvent, [obj]);
                return obj;
            });
    }
}
