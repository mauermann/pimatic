/*
node-coffee-cache
from: https://github.com/FogCreek/node-coffee-cache

The MIT License

Copyright (c) Fog Creek Software Inc. 2013

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
var fs     = require('fs.extra');
var path   = require('path');
var colors = require('colors');
// We don't want to include our own version of CoffeeScript since we don't know
// what version the parent relies on
var coffee;
try {
  coffee = require('coffee-script');
  // CoffeeScript 1.7 support
  if (typeof coffee.register === 'function') {
    coffee.register();
  }
} catch (e) {
  // No coffee-script installed in the project; warn them and stop
  process.stderr.write("coffee-cache: No coffee-script package found.\n");
  return;
}

// Directory to store compiled source
var cacheDir = process.env['COFFEE_CACHE_DIR'] || '.js';

// Storing coffee's require extension for backup use
var coffeeExtension = require.extensions['.coffee'];

// Set up an extension map for .coffee files -- we are completely overriding
// CoffeeScript's since it only returns the compiled module.
require.extensions['.coffee'] = function(module, filename) {
  // First, convert the filename to something more digestible and use our cache
  // folder
  var rootDir = ""
  var insideCache = ""
  var match = filename.match(/^(.*\/node_modules\/[^\/]+)\/(.*)$/);
  if(match) {
    rootDir = match[1];
    insideCache = match[2];
  } else {
    rootDir = __dirname;
    insideCache = path.relative(rootDir, filename);
  }

  var cachePath = path.resolve(rootDir, cacheDir, insideCache).replace(/\.coffee$/, '.js');
  var mapPath = path.resolve(cachePath.replace(/\.js$/, '.map'));
  var content;

  // Try and stat the files for their last modified time
  try {
    var sourceTime = fs.statSync(filename).mtime;
    var cacheTime = fs.statSync(cachePath).mtime;
    if (cacheTime > sourceTime) {
      // We can return the cached version
      content = fs.readFileSync(cachePath, 'utf8');
    }
  } catch (err) {
    // If the cached file was not created yet, this will fail, and that is okay
  }

  // If we don't have the content, we need to compile ourselves
  if (!content) {
    try {
      // Read from disk and then compile
      console.log(colors.italic(
        "coffee-cache: compiling coffee-script file \""+path.relative(rootDir, filename)+"\"..."
      ));
      var compiled = coffee.compile(fs.readFileSync(filename, 'utf8'), {
        filename: filename,
        sourceMap: true
      });
      content = compiled.js;

      // Since we don't know which version of CoffeeScript we have, make sure
      // we handle the older versions that return just the compiled version.
      if (content == null)
        content = compiled;

      // Try writing to cache
      fs.mkdirs(path.dirname(cachePath));
      fs.writeFileSync(cachePath, content, 'utf8');
      if (mapPath)
        fs.writeFileSync(mapPath, compiled.v3SourceMap, 'utf8');
    } catch (err) {
      // Let's fail silently and use coffee's require if we need to
      if (!content)
        return coffeeExtension.apply(this, arguments);
    }
  }

  return module._compile(content, filename);
};
