'use strict';

const rollup = require('rollup').rollup;
const fsp = require('fs-promise');
const co = require('co');
const url = require('url');
const dirname = require('path').dirname;
const join = require('path').join;
const log = require('./log');

class ExpressRollup {
  constructor(opts) {
    this.opts = opts;

    // Cache for bundles' dependencies list
    this.cache = {};
  }

  *handle(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const opts = this.opts;
    const src = opts.src;
    const dest = opts.dest;
    const root = opts.root;
    const rollupOpts = Object.assign({}, opts.rollupOpts);
    const bundleOpts = Object.assign({}, opts.bundleOpts);
    const extRegex = /\.js$/;

    let path = url.parse(req.url).pathname;
    if (opts.prefix && path.indexOf(opts.prefix) === 0) {
      path = path.substring(opts.prefix.length);
    }
    if (!extRegex.test(path)) {
      return next();
    }
    const jsPath = join(root, dest, path.replace(new RegExp(`^${dest}`), ''));
    const bundlePath = join(root, src, path
          .replace(new RegExp(`^${dest}`), '')
          .replace(extRegex, opts.bundleExtension));

    if (opts.debug) {
      log('source', bundlePath);
      log('dest', jsPath);
    }

    rollupOpts.entry = bundlePath;
    bundleOpts.dest = jsPath;

    try {
      const rebuild = yield co(this.checkNeedsRebuild(jsPath, rollupOpts));
      if (rebuild.needed) {
        if (opts.debug) {
          log('Needs rebuild', 'true');
          log('Rolling up', 'started');
        }
        // checkNeedsRebuild may need to inspect the bundle, so re-use the
        // one already available instead of creating a new one
        const bundle = rebuild.bundle || (yield rollup(rollupOpts));
        co(this.processBundle(bundle, bundleOpts, res, next, opts));
        return true;
      }
    } catch (err) {
      console.error(err);
    }

    if (opts.serve === true) {
      this.serveByOurselves(jsPath, res);
      return true;
    }

    return next();
  }

  /**
   * serves js code from cache by ourselves
   */
  serveByOurselves(jsPath, res) {
    const opts = this.opts;

    res.status(200)
      .type('javascript')
      .set('Cache-Control', `max-age=${opts.maxAge}`)
      .sendFile(jsPath, err => {
        if (err) {
          console.error(err);
          res.status(err.status).end();
        } else if (opts.debug) {
          log('Serving', 'ourselves');
        }
      });
  }

  /**
   * generate code and serve it
   */
  *processBundle(bundle, bundleOpts, res, next, opts) {
    const bundled = bundle.generate(bundleOpts);
    const serve = opts.serve === true || opts.serve === 'on-compile';

    if (opts.debug) { log('Rolling up', 'finished'); }

    if (serve) {
      /** serves js code by ourselves */
      if (opts.debug) { log('Serving', 'ourselves'); }
      res.status(200)
        .type('javascript')
        .set('Cache-Control', `max-age=${opts.maxAge}`)
        .send(bundled.code);
    }

    try {
      if (opts.debug) { log('Writing out', 'started'); }
      yield co(this.writeBundle(bundled.code, bundled.map, bundleOpts.dest));
      if (!serve) {
        if (opts.debug) { log('Serving', 'by next()'); }
        next();
      }
      if (opts.debug) { log('Writing out', 'finished'); }
    } catch (err) {
      console.error(err);
      // Hope, that maybe another middleware can handle things
      next();
    }
  }

  /**
   * write into file
   */
  *writeBundle(code, map, dest) {
    try {
      const stats = yield fsp.stat(dirname(dest));
      if (!stats.isDirectory()) {
        throw new Error('Directory to write to does not exist (not a directory)');
      }
      yield fsp.writeFile(dest, code);
      if (map) {
        yield fsp.writeFile(`${dest}.map`, map);
      }
    } catch (err) {
      throw err;
    }
  }

  /**
   * check all files are older than the file
   */
  *allFilesOlder(file, files) {
    try {
      const stat = yield fsp.stat(file);
      const stats = yield Promise.all(files.map(f => fsp.stat(f)));
      const flag = stats.some(s => stat.mtime.valueOf() <= s.mtime.valueOf());
      if (this.opts.debug) {
        log('Stats loaded', `${stats.length} dependencies`);
        if (flag) log('File is newer');
      }
      return !flag;
    } catch (err) {
      throw err;
    }
  }

  *checkNeedsRebuild(jsPath, rollupOpts) {
    const cache = this.cache;
    let needed = true;

    try {
      yield fsp.access(jsPath, fsp.F_OK);
    } catch (err) {
      // it does not exist, so we MUST rebuild
      return { needed };
    }

    if (!cache[jsPath]) {
      try {
        const bundle = yield rollup(rollupOpts);
        const dependencies = bundle.modules.map(module => module.id);
        if (this.opts.debug) { log('Bundle loaded'); }
        cache[jsPath] = dependencies;
        needed = !(yield co(this.allFilesOlder(jsPath, dependencies)));
        return { needed, bundle };
      } catch (err) {
        throw err;
      }
    }

    try {
      needed = !(yield co(this.allFilesOlder(jsPath, cache[jsPath])));
    } catch (err) {
      console.error(err);
    }
    return { needed };
  }
}

module.exports = ExpressRollup;
