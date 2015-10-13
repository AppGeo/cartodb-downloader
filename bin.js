#!/usr/bin/env node

'use strict';
require('colors');
var downloader = require('./');
var argv = require('yargs')
    .usage('Usage: $0 [path] [options]')
    .alias('u', 'user')
    .describe('u', 'cartodb username'.yellow)
    .default('u', null, '$CARTODB_USER_NAME')
    .alias('v', 'version')
    .alias('a', 'apikey')
    .describe('a', 'cartodb apikey'.yellow)
    .default('a', null, '$CARTODB_API_KEY')
    .example('$0 ./path', 'download to ./path using enviromental variables'.green)
    .example('$0 -u yourname -a apikey', 'download to current directory'.green)
    .help('h', 'Show Help'.yellow)
   .alias('h', 'help')
    .argv;
if (argv.v) {
  console.log(require('./package.json').version);
  process.exit();
}
var user = argv.user;
if (user === null) {
  user = process.env.CARTODB_USER_NAME;
}

var key = argv.apikey;
if (key === null) {
  key = process.env.CARTODB_API_KEY;
}

var pathName = argv._[0] || './';
downloader(key, user, pathName, {
  progress: true,
  warn: true
}, function (err) {
    /*eslint no-process-exit:0*/
  if (err) {
    var e = err;
    if (err.stack) {
      e = err.stack;
    } else if (err.errors) {
      e = err.errors;
    } else {
      e = err.toString();
    }
    if (Array.isArray(e)) {
      e = e.join('\n');
    }
    process.stdout.write('\n');
    console.log(e.red);
    process.exit(1);
  } else {
    process.stdout.write('\n');
    console.log('done'.green);
    process.exit();
  }
});
