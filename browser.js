"use strict";

var app = require('./src/app');
var util = require('./src/util');

// Core annotator components
exports.App = app.App;

// Access to libraries (for browser installations)
exports.authz = require('./src/authz');
exports.identity = require('./src/identity');
exports.storage = require('./src/storage');
exports.ui = require('./src/ui');
exports.util = util;

// Ext namespace (for core-provided extension modules)
exports.ext = {};
