(function() {
  "use strict";
  
  const createRouter = require('@arangodb/foxx/router');
  const router = createRouter();
  module.context.use(router);

  var fs = require("fs");
  var db = require("@arangodb").db;
  var joi = require("joi");

  var baseUrl  = "/_db/" + encodeURIComponent(db._name()) + module.context.mount;
  var directory = module.context.fileName("storage");
  var collectionName = module.context.collectionName('filestore');
  var nameGenerator = require("internal").genRandomAlphaNumbers;

  var generateName = function () {
    while (true) {
      var name = nameGenerator(10);
      var filename = fs.join(directory, name);
      if (! fs.isFile(filename)) {
        // found a not-yet used filename
        return name;
      }
    }
  };

  var buildList = function (res) {
    // TODO: use a template
    var body = "<html><head><title>Filelist</title></head><body>";
   
    var files = db[collectionName].toArray().sort(function (l, r) {
      if (l.description != r.description) {
        return l.description < r.description ? -1 : 1;
      }
      return 0;
    });

    body += "<h1>List of files</h1>";
    if (files.length) {
      body += "<ul>"; 
      files.forEach(function (file) {
        // TODO: HTML-escape user-generated data
        var description = file.description;
        if (! description) {
          description = "no description";
        }
        var link = "<a href=\"" + baseUrl + "/fetch/" + encodeURIComponent(file.name) + "\">" + description + "</a>";
        body += "<li>" + link + " (" + file.originalName + ", " + file.size + " bytes)</li>";
      });
      body += "</ul>"; 
    }
    else {
      body += "<strong>No files found yet.</strong><br />";
    }

    body += "<h1>Upload a file</h1>";
    body += "<form action=\"" + baseUrl + "/store\" method=\"post\" enctype=\"multipart/form-data\">";
    body += "Description: <input type=\"text\" name=\"description\"><br />";
    body += "File: <input type=\"file\" name=\"file\"><br />";
    body += "<input type=\"submit\" value=\"upload\">";
    body += "</form>";

    body += "</body></html>";
    return body;
  };

 
  router.get('/list', function (req, res) {
	res.set("Content-Type", "text/html; charset=utf-8");
	res.body = buildList();
  })
  .summary("returns a list of all files");


  router.post('/store', function (req, res) {
    var filename = generateName();
    var description, data, contentType, originalName;
    var parts = req.body;

    parts.forEach(function (part, i) {
      if (i === 0) {
        description = part.data.toString('utf-8');
      }
      else {
        data = part.data;
        var cd = part.headers["Content-Disposition"];
        if (cd) {
          var pos = cd.indexOf("filename=\"");
          var len = "filename=\"".length;
          if (pos !== -1) {
            originalName = cd.substring(pos + len, cd.length - 1);
          }
          contentType = part.headers["Content-Type"];
        }
      }
    });

    fs.write(fs.safeJoin(directory, filename), data);

    try {
      var doc = { 
        name: filename, 
        size: data.length
      };
      if (description !== undefined) {
        doc.description = description;
      }
      if (contentType !== undefined) {
        doc.contentType = contentType;
      }
      if (originalName !== undefined) {
        doc.originalName = originalName;
      } 

      db[collectionName].insert(doc);
    }
    catch (err) {
      // must remove from the filesystem too
      fs.remove(filename);
      throw err;
    }

    res.set("Content-Type", "text/html; charset=utf-8");
	res.body = buildList();
  }).error(400, "No file uploaded or description missing")
    .body(["multipart/form-data"]);

  router.get('/fetch/:filename', function (req, res) {
    var name = req.param("filename");
    var doc = db[collectionName].firstExample({ name: name });

    if (!doc) {
      res.throw(404, "The requested file could not be found");
    }
 
    var filename = fs.safeJoin(directory, name);

    if (!fs.isFile(filename)) {
      res.throw(404, "The requested file could not be found");
    }

    res.sendFile(filename);
    if (doc.originalName) {
      res.set("Content-Disposition", "attachment; filename=\"" + doc.originalName + "\"");
    }
    if (doc.contentType) {
      res.set("Content-Type", doc.contentType);
    }
  })
  .summary("returns the contents of the specified file")
  .pathParam("filename", joi.string())
  .error(404, "The requested file could not be found");

}());

