'use strict';

function log(key, val) {
  if (!val) {
    console.error('  \x1B[0m\x1B[36m%s\x1B[0m', key);
  } else {
    console.error('  \x1B[90m%s:\x1B[0m \x1B[36m%s\x1B[0m', key, val);
  }
}

module.exports = log;
