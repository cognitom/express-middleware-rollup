'use strict';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`\x07\x1B[31m${message}\x1B[91m`);
  }
}

module.exports = assert;
