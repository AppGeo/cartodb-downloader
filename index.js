'use strict';
var https = require('https');
var Transform = require('readable-stream').Transform;
var noms = require('noms').obj;
var fs = require('fs');
var mkdirp = require('mkdirp');
var once = require('once');
var path = require('path');

module.exports = downloadAll;
function downloadAll(key, account, root, callback) {
  var onerr = once(callback);
  var mapIdsUrl = `https://${account}.cartodb.com/api/v1/viz?api_key=${key}`;
  var id = 1;
  noms(function (done) {
    var self = this;
    var newURL = mapIdsUrl + `&page=${id++}`;
    getJson(newURL, function (err, resp) {
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
      getJson(`https://${account}.cartodb.com/u/mapgeoprod/api/v2/viz/${mapdata.id}/viz.json?api_key=${key}`, next);
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
      var mapurl = `https://${account}.cartodb.com/api/v1/map/named/${mapName}?api_key=${key}`;
      getJson(mapurl, function (err, resp) {
        if (err) {
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
              next();
            }
          }
          Object.keys(item).forEach(function (name) {
            var fullPathName = path.join(pathName, name + '.json');
            fs.writeFile(fullPathName, JSON.stringify(item[name], false, 2), after);
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
function getJson(url, callback) {
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
  }).on('error', callback);
}
