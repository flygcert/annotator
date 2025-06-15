// Main module: default UI
exports.main = require('./ui/main').main;

// Export submodules for browser environments
exports.adder = require('./ui/adder');
exports.editor = require('./ui/editor');
exports.highlighter = require('./ui/highlighter');
exports.textselector = require('./ui/textselector');
exports.viewer = require('./ui/viewer');
exports.widget = require('./ui/widget');
