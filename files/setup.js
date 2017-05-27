'use strict';

var db = require('@arangodb').db,
    fs = require("fs"),
    directory = module.context.fileName("storage"),
    collectionName = module.context.collectionName('filestore');

if (db._collection(collectionName) === null) {
  db._create(collectionName);
}

if (! fs.isDirectory(directory)) {
  fs.makeDirectory(directory);
}
