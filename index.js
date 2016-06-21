'use strict';

const assert = require('./lib/assert');
const ExpressRollup = require('./lib/express-rollup');

const defaults = {
  bundleExtension: '.bundle',
  src: null,
  dest: null,
  root: process.cwd(),
  prefix: null,
  rebuild: 'deps-change', // or 'never' or 'always'
  serve: false, // or 'on-compile' or true. 'on-compile' has the benefit
                // that the bundle which is already in memory will be
                // written directly into the response
  rollupOpts: {},
  bundleOpts: { format: 'iife' },
  debug: false,
  maxAge: 0
};

module.exports = function createExpressRollup(options) {
  const opts = Object.assign({}, defaults);
  Object.assign(opts, options);
  // We're not fancy enough to use recursive option merging (yet), so...
  opts.rollupOpts = Object.assign({}, defaults.rollupOpts);
  Object.assign(opts.rollupOpts, options.rollupOpts);
  opts.bundleOpts = Object.assign({}, defaults.bundleOpts);
  Object.assign(opts.bundleOpts, options.bundleOpts);

  // Source directory (required)
  assert(opts.src, 'rollup middleware requires src directory.');
  // Destination directory (source by default)
  opts.dest = opts.dest || opts.src;

  const expressRollup = new ExpressRollup(opts);
  const middleware = (...args) => expressRollup.handle(...args);
  return middleware;
};
