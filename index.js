'use strict';
var https = require('https');
var Transform = require('readable-stream').Transform;
var noms = require('noms').obj;
var fs = require('fs');
var mkdirp = require('mkdirp');
var once = require('once');
var path = require('path');
var ProgressBar = require('progress');

module.exports = downloadAll;
function downloadAll(key, account, root, opts, callback) {
  if (typeof callback === 'undefined') {
    callback = opts;
    opts = {};
  }
  if (!key || !account) {
    return process.nextTick(function () {
      callback(new Error('missing required argument: ' + (!key ? 'key' : 'username')));
    });
  }
  var useProgresBar = opts.progress;
  var bar = null;
  function tick() {
    if (useProgresBar && bar) {
      bar.tick();
    }
  }
  var onerr = once(callback);
  var mapIdsUrl = 'https://' + account + '.cartodb.com/api/v1/viz?api_key=' + key;
  var id = 1;
  noms(function (done) {
    var self = this;
    var newURL = mapIdsUrl + '&page=';
    newURL += id;
    id++;
    getJson(newURL, function (err, resp) {
      if (useProgresBar && !bar) {
        bar = new ProgressBar('[:bar] :current/:total  ', {
          total: resp.total_entries,
          width: 20
        });
      }
      if (err) {
        return done(err);
      }
      if (!resp.visualizations.length) {
        self.push(null);
        return done();
      }
      resp.visualizations.forEach(function (item) {
        self.push(item);
      });
      done();
    });
  })
  .on('error', onerr)
  .pipe(new Transform({
    objectMode: true,
    transform: function (mapdata, _, next) {
      getJson('https://' + account + '.cartodb.com/u/' + account + '/api/v2/viz/' + mapdata.id + '/viz.json?api_key=' + key, next);
    }
  }))
  .on('error', onerr)
  .pipe(new Transform({
    objectMode: true,
    transform: function (item, _, next) {
      if (item.layers.filter(function (thing) {
        return thing.type === 'namedmap';
      }).length) {
        this.push(item);
      } else {
        tick();
      }
      next();
    }
  }))
  .on('error', onerr)
  .pipe(new Transform({
    objectMode: true,
    transform: function (item, _, next) {
      var self = this;
      var map = item.layers.filter(function (thing) {
        return thing.type === 'namedmap';
      })[0];
      var mapName = map.options.named_map.name;
      var mapurl = 'https://' + account + '.cartodb.com/api/v1/map/named/' + mapName + '?api_key=' + key;
      getJson(mapurl, function (err, resp) {
        if (err) {
          if (opts.warn) {
            console.log(' ');
            console.warn(err);
            return next();
          }
          return next(err);
        }
        var out = {
          viz: item
        };
        out[mapName] = resp;
        self.push(out);
        next();
      });
    }
  }))
  .on('error', onerr)
  .pipe(new Transform({
      objectMode: true,
      transform: function (item, _, next) {
        var pathName = path.join(root, item.viz.title);
        mkdirp(pathName, function (err) {
          if (err) {
            return next(err);
          }
          var done = 0;
          function after(err) {
            done++;
            if (err) {
              return next(err);
            }
            if (done === 2) {
              tick();
              next();
            }
          }
          Object.keys(item).forEach(function (name) {
            var fullPathName = path.join(pathName, name + '.json');
            fs.writeFile(fullPathName, JSON.stringify(item[name], false, 2).replace('\r', ''), after);
          });
        });
      },
      flush: function (done) {
        onerr();
        done();
      }
  }))
  .on('error', onerr);
}
function getJson(url, callback, run) {
  run = run || 5;
  https.get(url, function(res) {
    var out = [];
    res
      .on('error', callback)
      .on('data', function (d) {
        out.push(d);
      }).on('end', function () {
        var json = JSON.parse(Buffer.concat(out).toString());
        if (res.statusCode > 299) {
          callback(json);
        } else {
          callback(null, json);
        }
      });
  }).on('error', function (e) {
    if (run === 1) {
      return callback(e);
    }
    getJson(url, callback, run - 1);
  });
}
