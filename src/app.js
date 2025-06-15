/*package annotator */

"use strict";

import { acl } from './authz';
import { simple } from './identity';
import { Registry } from './registry';
import { noop, StorageAdapter } from './storage';

/**
 * App
 *
 * The coordination point for all annotation functionality.
 * Manages configuration and acts as the entry point for deployments.
 */
export class App {
    constructor() {
        this.modules = [];
        this.registry = new Registry();
        this._started = false;

        // Set up default components.
        this.include(acl);
        this.include(simple);
        this.include(noop);
    }

    /**
     * Include an extension module.
     * If an options object is supplied, it is passed to the module.
     * If the module has a configure function, it is called with the registry.
     * @param {Function} module - The module to include.
     * @param {Object} [options] - Optional options for the module.
     * @returns {App} The App instance.
     */
    include(module, options) {
        const mod = module(options);
        if (typeof mod.configure === 'function') {
            mod.configure(this.registry);
        }
        this.modules.push(mod);
        return this;
    }

    /**
     * Start the app, binding components and running 'start' hooks.
     * @returns {Promise} Resolves when all module 'start' hooks complete.
     */
    start() {
        if (this._started) return;
        this._started = true;

        const reg = this.registry;

        this.authz = reg.getUtility('authorizationPolicy');
        this.ident = reg.getUtility('identityPolicy');

        this.annotations = new StorageAdapter(
            reg.getUtility('storage'),
            (...args) => this.runHook(...args)
        );

        return this.runHook('start', [this]);
    }

    /**
     * Destroy the app, running the 'destroy' module hook.
     * @returns {Promise} Resolves when destroyed.
     */
    destroy() {
        return this.runHook('destroy');
    }

    /**
     * Run the named module hook and return a promise of all results.
     * @param {string} name - The hook name.
     * @param {Array} [args] - Arguments to pass to each hook.
     * @returns {Promise} Resolves when all hooks are complete.
     */
    runHook(name, args = []) {
        const results = [];
        for (const mod of this.modules) {
            if (typeof mod[name] === 'function') {
                results.push(mod[name](...args));
            }
        }
        return Promise.all(results);
    }
}
