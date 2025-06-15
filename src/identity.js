/*package annotator.identity */

"use strict";

/**
 * SimpleIdentityPolicy
 *
 * A simple identity policy that treats the identity as an opaque identifier.
 */
class SimpleIdentityPolicy {
    /**
     * The current user identity.
     * Defaults to `null`, disabling identity-related functionality.
     */
    identity = null;

    /**
     * Returns the current user identity.
     * @returns {any} The identity value.
     */
    who() {
        return this.identity;
    }
}

/**
 * simple
 *
 * Configures and registers an instance of SimpleIdentityPolicy.
 * @returns {object} Module with configure and beforeAnnotationCreated hooks.
 */
export const simple = () => {
    const identity = new SimpleIdentityPolicy();

    return {
        /**
         * Registers the identity policy utility.
         * @param {object} registry - The registry to register with.
         */
        configure(registry) {
            registry.registerUtility(identity, 'identityPolicy');
        },

        /**
         * Sets the user property on the annotation before creation.
         * @param {object} annotation - The annotation object.
         */
        beforeAnnotationCreated(annotation) {
            annotation.user = identity.who();
        }
    };
};
