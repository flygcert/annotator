const path = require('path');

const common = {
  entry: './browser.js',
  output: {
    path: path.resolve(__dirname, 'pkg'),
    library: 'annotator',
  }
};

module.exports = [
  // Regular (unminified) build
  {
    ...common,
    mode: 'development',
    output: {
      ...common.output,
      filename: 'annotator.js'
    },
    optimization: {
      minimize: false
    }
  },

  // Minified build
  {
    ...common,
    mode: 'production',
    output: {
      ...common.output,
      filename: 'annotator.min.js'
    },
    optimization: {
      minimize: true
    }
  }
];