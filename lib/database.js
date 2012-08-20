(function() {
  var Database, portchecker, request, spawn;

  request = require('request');

  spawn = require('child_process').spawn;

  portchecker = require('portchecker');

  Database = (function() {
    Database.name = 'Database';
    Database.DOCUMENTS_BY_ENTITY_NAME_INDEX = 'Raven/DocumentsByEntityName';

    Database.DYNAMIC_INDEX = 'dynamic';

    function Database(datastore, name) {
      this.datastore = datastore;
      this.name = name;
      this.authorization = null;
    }

    Database.prototype.getUrl = function() {
      var url;
      url = this.datastore.url;
      if (this.name !== 'Default') url += "/databases/" + this.name;
      return url;
    };

    Database.prototype.getDocsUrl = function() {
      return "" + (this.getUrl()) + "/docs";
    };

    Database.prototype.getDocUrl = function(id) {
      return "" + (this.getDocsUrl()) + "/" + id;
    };

    Database.prototype.getIndexesUrl = function() {
      return "" + (this.getUrl()) + "/indexes";
    };

    Database.prototype.getIndexUrl = function(index) {
      return "" + (this.getIndexesUrl()) + "/" + index;
    };

    Database.prototype.getTermsUrl = function(index, field) {
      return "" + (this.getUrl()) + "/terms/" + index + "?field=" + field;
    };

    Database.prototype.getStaticUrl = function() {
      return "" + (this.getUrl()) + "/static";
    };

    Database.prototype.getAttachmentUrl = function(id) {
      return "" + (this.getStaticUrl()) + "/" + id;
    };

    Database.prototype.getQueriesUrl = function() {
      return "" + (this.getUrl()) + "/queries";
    };

    Database.prototype.getBulkDocsUrl = function() {
      return "" + (this.getUrl()) + "/bulk_docs";
    };

    Database.prototype.getBulkDocsIndexUrl = function(index, query) {
      return "" + (this.getBulkDocsUrl()) + "/" + index + "?query=" + (this.luceneQueryArgs(query));
    };

    Database.prototype.getStatsUrl = function() {
      return "" + (this.getUrl()) + "/stats";
    };

    Database.prototype.setAuthorization = function(authValue) {
      return this.authorization = authValue;
    };

    Database.prototype.getCollections = function(cb) {
      this.apiGetCall(this.getTermsUrl(Database.DOCUMENTS_BY_ENTITY_NAME_INDEX, 'Tag'), function(error, response) {
        if (!error && response.statusCode === 200) {
          if (cb != null) return cb(null, JSON.parse(response.body));
        } else if (cb != null) {
          return cb(error);
        }
      });
      return null;
    };

    Database.prototype.saveDocument = function(collection, doc, cb) {
      var op, url;
      op = this.apiPostCall;
      url = this.getDocsUrl();
      if (doc.id != null) {
        op = this.apiPutCall;
        url = this.getDocUrl(doc.id);
        delete doc.id;
      }
      op.call(this, url, doc, {
        'Raven-Entity-Name': collection
      }, function(error, response) {
        if (!error && response.statusCode === 201) {
          if (cb != null) return cb(null, response.body);
        } else {
          if (cb != null) {
            if (error != null) {
              return cb(error);
            } else {
              return cb(new Error('Unable to create document: ' + response.statusCode + ' - ' + response.body));
            }
          }
        }
      });
      return null;
    };

    Database.prototype.getDocument = function(id, cb) {
      var url;
      url = this.getDocUrl(id);
      this.apiGetCall(url, function(error, response) {
        if (!error && response.statusCode === 200) {
          return cb(null, JSON.parse(response.body));
        } else {
          return cb(error);
        }
      });
      return null;
    };

    Database.prototype.getDocuments = function(ids, cb) {
      var url;
      url = this.getQueriesUrl();
      this.apiPostCall(url, ids, function(error, response) {
        if (!error && response.statusCode === 200) {
          if (cb != null) return cb(null, response.body);
        } else {
          if (cb != null) {
            if (error != null) {
              return cb(error);
            } else {
              return cb(new Error('Unable to find documents: ' + response.statusCode + ' - ' + response.body));
            }
          }
        }
      });
      return null;
    };

    Database.prototype.deleteDocument = function(id, cb) {
      var url;
      url = this.getDocUrl(id);
      this.apiDeleteCall(url, function(error, response) {
        if (!error && response.statusCode === 204) {
          if (cb != null) return cb(null, response.body);
        } else {
          if (cb != null) {
            if (error != null) {
              return cb(error);
            } else {
              return cb(new Error('Unable to delete document: ' + response.statusCode + ' - ' + response.body));
            }
          }
        }
      });
      return null;
    };

    Database.prototype.deleteDocuments = function(index, query, cb) {
      var url;
      url = this.getBulkDocsIndexUrl(index, query);
      this.apiDeleteCall(url, function(error, response) {
        var _ref;
        if (!error && response.statusCode === 200) {
          if (cb != null) {
            return cb(null, ((response != null ? (_ref = response.body) != null ? _ref.length : void 0 : void 0) != null) > 0 ? JSON.parse(response.body) : null);
          }
        } else {
          if (cb != null) {
            if (typeof error === "function" ? error(cb(error)) : void 0) {} else {
              return cb(new Error('Unable to delete documents: ' + response.statusCode + ' - ' + response.body));
            }
          }
        }
      });
      return null;
    };

    Database.prototype.find = function(doc, start, count, cb) {
      if (typeof start === 'function') {
        cb = start;
        start = null;
        count = null;
      } else if (typeof count === 'function') {
        cb = count;
        count = null;
      }
      this.dynamicQuery(doc, start, count, function(error, results) {
        var matches;
        if (!error) {
          results = JSON.parse(results.body);
          matches = (results != null ? results.Results : void 0) != null ? results.Results : null;
        }
        return cb(error, matches);
      });
      return null;
    };

    Database.prototype.getDocsInCollection = function(collection, start, count, cb) {
      if (typeof start === 'function') {
        cb = start;
        start = null;
        count = null;
      } else if (typeof count === 'function') {
        cb = count;
        count = null;
      }
      this.queryRavenDocumentsByEntityName(collection, start, count, function(error, results) {
        if (error == null) results = JSON.parse(results.body);
        return cb(error, (results != null ? results.Results : void 0) != null ? results.Results : null);
      });
      return null;
    };

    Database.prototype.getDocumentCount = function(collection, cb) {
      this.queryRavenDocumentsByEntityName(collection, 0, 0, function(error, results) {
        if (error == null) results = JSON.parse(results.body);
        return cb(error, (results != null ? results.TotalResults : void 0) != null ? results.TotalResults : null);
      });
      return null;
    };

    Database.prototype.getStats = function(cb) {
      this.apiGetCall(this.getStatsUrl(), function(error, results) {
        var stats;
        if (error == null) stats = JSON.parse(results.body);
        return cb(error, stats);
      });
      return null;
    };

    Database.prototype.dynamicQuery = function(doc, start, count, cb) {
      return this.queryByIndex(Database.DYNAMIC_INDEX, doc, start, count, cb);
    };

    Database.prototype.queryRavenDocumentsByEntityName = function(name, start, count, cb) {
      var search;
      search = name != null ? {
        Tag: name
      } : null;
      return this.queryByIndex(Database.DOCUMENTS_BY_ENTITY_NAME_INDEX, search, start, count, cb);
    };

    Database.prototype.queryByIndex = function(index, query, start, count, cb) {
      var url;
      if (start == null) start = 0;
      if (count == null) count = 25;
      if (typeof start === 'function') {
        cb = start;
        start = null;
        count = null;
      } else if (typeof count === 'function') {
        cb = count;
        count = null;
      }
      url = "" + (this.getIndexUrl(index)) + "?start=" + start + "&pageSize=" + count + "&aggregation=None";
      if (query != null) url += "&query=" + (this.luceneQueryArgs(query));
      return this.apiGetCall(url, cb);
    };

    Database.prototype.createIndex = function(name, map, reduce, cb) {
      var index, url;
      if (typeof reduce === 'function') {
        cb = reduce;
        reduce = null;
      }
      url = this.getIndexUrl(name);
      index = {
        Map: map
      };
      if (reduce != null) index['Reduce'] = reduce;
      return this.apiPutCall(url, index, function(error, response) {
        var _ref;
        if (!error && response.statusCode === 201) {
          if (cb != null) {
            return cb(null, ((response != null ? (_ref = response.body) != null ? _ref.length : void 0 : void 0) != null) > 0 ? JSON.parse(response.body) : null);
          }
        } else {
          if (cb != null) {
            if (error != null) {
              return cb(error);
            } else {
              return cb(new Error('Unable to create index: ' + response.statusCode + ' - ' + response.body));
            }
          }
        }
      });
    };

    Database.prototype.deleteIndex = function(index, cb) {
      var url;
      url = this.getIndexUrl(index);
      return this.apiDeleteCall(url, function(error, response) {
        var _ref;
        if (!error && response.statusCode === 204) {
          if (cb != null) {
            return cb(null, ((response != null ? (_ref = response.body) != null ? _ref.length : void 0 : void 0) != null) > 0 ? JSON.parse(response.body) : null);
          }
        } else {
          if (cb != null) {
            if (error != null) {
              return cb(error);
            } else {
              return cb(new Error('Unable to delete index: ' + response.statusCode + ' - ' + response.body));
            }
          }
        }
      });
    };

    Database.prototype.saveAttachment = function(docId, content, headers, cb) {
      var url;
      url = this.getAttachmentUrl(docId);
      return this.apiPutCall(url, content, headers, function(error, response) {
        var _ref;
        if (!error && response.statusCode === 201) {
          if (cb != null) {
            return cb(null, ((response != null ? (_ref = response.body) != null ? _ref.length : void 0 : void 0) != null) > 0 ? JSON.parse(response.body) : null);
          }
        } else {
          if (cb != null) {
            if (error != null) {
              return cb(error);
            } else {
              return cb(new Error('Unable to save attachment: ' + response.statusCode + ' - ' + response.body));
            }
          }
        }
      });
    };

    Database.prototype.getAttachment = function(id, cb) {
      var url;
      url = this.getAttachmentUrl(id);
      return this.apiGetCall(url, function(error, response) {
        if (!error && response.statusCode === 200) {
          return cb(null, response);
        } else {
          return cb(error);
        }
      });
    };

    Database.prototype.deleteAttachment = function(id, cb) {
      var url;
      url = this.getAttachmentUrl(id);
      return this.apiDeleteCall(url, function(error, response) {
        if (!error && response.statusCode === 204) {
          if (cb != null) return cb(null, response.body);
        } else {
          if (cb != null) {
            if (error != null) {
              return cb(error);
            } else {
              return cb(new Error('Unable to delete attachment: ' + response.statusCode + ' - ' + response.body));
            }
          }
        }
      });
    };

    Database.prototype.luceneQueryArgs = function(query) {
      var key, pairs, value;
      if (query == null) return null;
      pairs = [];
      for (key in query) {
        value = query[key];
        pairs.push("" + key + ":" + value);
      }
      return pairs.join('+');
    };

    Database.prototype.useRavenHq = function(apiKey, cb) {
      var database;
      database = this;
      return request.get({
        uri: database.getDocsUrl()
      }, function(err, denied) {
        return request.get({
          uri: denied.headers['oauth-source'],
          headers: {
            "Api-Key": apiKey
          }
        }, function(err, oauth) {
          database.setAuthorization("Bearer " + oauth.body);
          if (cb != null) return cb(err, oauth);
        });
      });
    };

    Database.prototype.useNTLM = function(domain, username, password, cb) {
      var getPort, user_pwd,
        _this = this;
      getPort = function(cb) {
        return portchecker.getFirstAvailable(5000, 6000, 'localhost', function(port, host) {
          return cb(port);
        });
      };
      user_pwd = new Buffer("" + username + ":" + password).toString('base64');
      this.setAuthorization("Basic " + user_pwd);
      if (this.ntlm != null) return false;
      return getPort(function(port) {
        var ntlmaps;
        try {
          ntlmaps = spawn('python', ["" + __dirname + "/../deps/ntlmaps/main.py", "--domain=" + domain, "--port=" + port]);
          _this.ntlm = ntlmaps;
          _this.ntlm.port = port;
          process.on('exit', function() {
            return ntlmaps.kill('SIGINT');
          });
          ntlmaps.stdout.on('data', function(data) {
            return console.log("ntlmaps stdout: " + data);
          });
          ntlmaps.stderr.on('data', function(data) {
            return console.error("ntlmaps stderr: " + data);
          });
          ntlmaps.on('exit', function(code) {
            _this.ntlm = null;
            if (code !== 0) {
              return console.error("ntlmaps exited with code " + code);
            }
          });
          if (cb != null) return cb(true);
        } catch (error) {
          if (cb != null) return cb(false);
        }
      });
    };

    Database.prototype.apiGetCall = function(url, headers, cb) {
      if (typeof headers === 'function') {
        cb = headers;
        headers = {};
      }
      return this.apiCall('get', url, null, headers, function(error, response) {
        return cb(error, response);
      });
    };

    Database.prototype.apiPutCall = function(url, body, headers, cb) {
      if (typeof headers === 'function') {
        cb = headers;
        headers = {};
      }
      return this.apiCall('put', url, body, headers, function(error, response) {
        return cb(error, response);
      });
    };

    Database.prototype.apiPostCall = function(url, body, headers, cb) {
      if (typeof headers === 'function') {
        cb = headers;
        headers = {};
      }
      return this.apiCall('post', url, body, headers, cb);
    };

    Database.prototype.apiPatchCall = function(url, body, headers, cb) {
      if (typeof headers === 'function') {
        cb = headers;
        headers = {};
      }
      return this.apiCall('patch', url, body, headers, cb);
    };

    Database.prototype.apiDeleteCall = function(url, body, headers, cb) {
      if (typeof body === 'function') {
        cb = body;
        body = null;
        headers = {};
      } else if (typeof headers === 'function') {
        cb = headers;
        headers = {};
      }
      return this.apiCall('delete', url, body, headers, cb);
    };

    Database.prototype.apiCall = function(verb, url, bodyOrReadableStream, headers, cb) {
      var op, req;
      verb = verb.toLowerCase();
      switch (verb) {
        case 'get':
          op = request.get;
          break;
        case 'put':
          op = request.put;
          break;
        case 'post':
          op = request.post;
          break;
        case 'delete':
          op = request.del;
          break;
        case 'patch':
          throw new Error('request module does not yet support patch verb');
          break;
        default:
          throw new Error('No operation matched the verb "' + verb(+'"'));
      }
      if (this.authorization != null) headers.Authorization = this.authorization;
      req = {
        uri: url,
        headers: headers
      };
      if (this.ntlm != null) req['proxy'] = "http://localhost:" + this.ntlm.port;
      if ((bodyOrReadableStream != null ? bodyOrReadableStream.readable : void 0) != null) {
        bodyOrReadableStream.pipe(op.call(request, req, cb));
        return;
      }
      req[typeof bodyOrReadableStream === 'object' ? 'json' : 'body'] = bodyOrReadableStream;
      op.call(request, req, cb);
      return null;
    };

    return Database;

  })();

  module.exports = Database;

}).call(this);