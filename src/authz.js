/*package annotator.authz */

"use strict";

/**
 * AclAuthzPolicy
 *
 * An authorization policy that permits actions based on access control lists (ACLs).
 */
class AclAuthzPolicy {
    /**
     * Determines if the user identified by `identity` is permitted to
     * perform the specified action in the given context.
     *
     * @param {string} action - The action to check permission for.
     * @param {object} context - The context containing permissions or user info.
     * @param {any} identity - The identity to check authorization for.
     * @returns {boolean} True if permitted, false otherwise.
     */
    permits(action, context, identity) {
        const userid = this.authorizedUserId(identity);
        const permissions = context.permissions;

        if (permissions) {
            // Fine-grained authorization: check permissions for the action
            const tokens = permissions[action];

            if (typeof tokens === 'undefined' || tokens === null) {
                // No tokens for this action: anyone can perform it
                return true;
            }

            // Check if the userid is in the allowed tokens
            for (let i = 0, len = tokens.length; i < len; i++) {
                if (userid === tokens[i]) {
                    return true;
                }
            }

            // Not permitted if no tokens matched
            return false;
        } else if (context.user) {
            // Coarse-grained authorization: only the context user is allowed
            return userid === context.user;
        }

        // No authorization info: allow anyone
        return true;
    }

    /**
     * Returns the authorized user ID for the given identity.
     * Override this if identity is not a simple user ID.
     * @param {any} identity
     * @returns {any}
     */
    authorizedUserId(identity) {
        return identity;
    }
}

/**
 * acl
 *
 * Configures and registers an instance of AclAuthzPolicy.
 * @returns {object} Module with a configure hook.
 */
export const acl = () => {
    const authorization = new AclAuthzPolicy();

    return {
        /**
         * Registers the authorization policy utility.
         * @param {object} registry - The registry to register with.
         */
        configure(registry) {
            registry.registerUtility(authorization, 'authorizationPolicy');
        }
    };
};
