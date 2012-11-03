# database.coffee
Api = require('./api')
Document = require('./document')

class Database
  @DOCUMENTS_BY_ENTITY_NAME_INDEX: 'Raven/DocumentsByEntityName'
  @DYNAMIC_INDEX: 'dynamic'

  constructor: (@datastore, @name) ->
    @api = new Api(@datastore.url, @name)

  getUrl: ->
    @api.getUrl()

  getDocsUrl: ->
    @api.getDocsUrl()

  getDocUrl: (id) ->
    @api.getDocUrl(id)

  getIndexesUrl: ->
    @api.getIndexesUrl()

  getIndexUrl: (index) ->
    @api.getIndexUrl(index)

  getTermsUrl: (index, field) ->
    @api.getTermsUrl(index, field)

  getStaticUrl: ->
    @api.getStaticUrl()

  getAttachmentUrl: (id) ->
    @api.getAttachmentUrl(id)

  getQueriesUrl: ->
    @api.getQueryiesUrl()

  getBulkDocsUrl: ->
    @api.getBulkDocsUrl()

  getBulkDocsIndexUrl:  (index, query) ->
    @api.getBulkDocsIndexUrl(index, query)

  getStatsUrl: ->
    @api.getStatsUrl()

  setAuthorization: (authValue) ->
    @api.setAuthorization(authValue)

  setBasicAuthorization: (username, password) ->
    @api.setBasicAuthorization(username, password)

  setProxy: (proxyUrl) ->
    @api.setProxy(proxyUrl)


  getCollections: (cb) ->
    @apiGetCall @getTermsUrl(Database.DOCUMENTS_BY_ENTITY_NAME_INDEX, 'Tag'),  (error, response) ->
      if !error and response.statusCode is 200
        cb(null, JSON.parse(response.body)) if cb?
      else if cb?
        cb(error)

    return null


  saveDocument: (collection, doc, cb) ->
    # If not id provided, use POST to allow server-generated id
    # else, use PUT and use id in url
    op = @apiPostCall
    url = @getDocsUrl()

    if typeof collection is 'object' and collection isnt null
      cb = doc
      doc = collection
      collection = null

    if doc.id?
      op = @apiPutCall
      url = @getDocUrl(doc.id)
      doc = Document.fromObject(doc)
      delete doc.id # Don't add this as it's own property to the document...

    unless doc.getMetadataValue('Raven-Entity-Name')?
      doc.setMetadataValue('Raven-Entity-Name', collection) if collection?

    op.call @, url, doc, doc.getMetadata(), (error, response) ->
      if !error and response.statusCode is 201 # 201 - Created
        doc.setMetadataValues(JSON.parse(response.body))
        doc.id = doc.getMetadataValue('key')
        cb(null, doc) if cb?
      else
        if cb?
          if error? then cb(error)
          else cb(new Error('Unable to create document: ' + response.statusCode + ' - ' + response.body))

    return


  getDocument: (id, cb) ->
    url = @getDocUrl(id)
    @apiGetCall url, (error, response) ->
      if !error and response.statusCode is 200
        doc = Document.fromObject(JSON.parse(response.body))
        doc.setMetadataValues(response.headers)
        doc.id = doc.getMetadataValue('key')
        cb(null, doc)
      else
        cb(error)

    return


  getDocuments: (ids, cb) ->
    url = @getQueriesUrl()

    @apiPostCall url, ids, (error, response) ->
      if !error and response.statusCode is 200
        cb(null, response.body) if cb?
      else
        if cb?
          if error? then cb(error)
          else cb(new Error('Unable to find documents: ' + response.statusCode + ' - ' + response.body))

    return

  # PATCH - Update

  deleteDocument: (id, cb) ->
    url = @getDocUrl(id)
    # TODO: Still need to determine the cutOff and allowStale options - http://ravendb.net/docs/http-api/http-api-multi
    @apiDeleteCall url, (error, response) ->
      if !error and response.statusCode is 204  # 204 - No content
        cb(null, response.body) if cb?
      else
        if cb?
          if error? then cb(error)
          else cb(new Error('Unable to delete document: ' + response.statusCode + ' - ' + response.body))

    return


  # Set-based updates

  deleteDocuments: (index, query, cb) ->
    url = @getBulkDocsIndexUrl(index, query)

    @apiDeleteCall url, (error, response) ->
      if !error and response.statusCode is 200
        cb(null, if response?.body?.length? > 0 then JSON.parse(response.body) else null) if cb?
      else
        if cb?
          if error? cb(error)
          else cb(new Error('Unable to delete documents: ' + response.statusCode + ' - ' + response.body))

    return


  # Search

  find: (doc, start, count, cb) ->
    if typeof start is 'function'
      cb = start
      start = null
      count = null
    else if typeof count is 'function'
      cb = count
      count = null

    @dynamicQuery doc, start, count, (error, results) ->
      unless error
        results = JSON.parse(results.body)
        matches = if results?.Results? then results.Results else null

      cb(error, matches)

    return


  getDocsInCollection: (collection, start, count, cb) ->
    if typeof start is 'function'
      cb = start
      start = null
      count = null
    else if typeof count is 'function'
      cb = count
      count = null

    @queryRavenDocumentsByEntityName collection, start, count, (error, results) ->
      results = JSON.parse(results.body) unless error?

      cb(error, if results?.Results? then results.Results else null)

    return


  getDocumentCount: (collection, cb) ->
    # Passing in 0 and 0 for start and count simply returns the TotalResults and not the actual docs
    @queryRavenDocumentsByEntityName collection, 0, 0, (error, response) ->
      if error?
        cb(error, null)
        return

      manufacturedError = new Error("Unable to get document count: #{response.statusCode} - #{response.body}")

      if response.statusCode >= 400
        cb(manufacturedError, null)
        return

      results = JSON.parse(response.body)

      if results?.TotalResults?
        cb(null, results.TotalResults)
      else
        cb(manufacturedError, null)


    return


  getStats: (cb) ->
    @apiGetCall @getStatsUrl(), (error, results) ->
      stats = JSON.parse(results.body) unless error?
      cb(error, stats)

    return


  # Indexes


  dynamicQuery: (doc, start, count, cb) ->
    @queryByIndex(Database.DYNAMIC_INDEX, doc, start, count, cb)


  queryRavenDocumentsByEntityName: (name, start, count, cb) ->
    search = if name? then { Tag:name } else null
    @queryByIndex(Database.DOCUMENTS_BY_ENTITY_NAME_INDEX, search, start, count, cb)


  queryByIndex: (index, query, start=0, count=25, cb) ->
    if typeof start is 'function'
      cb = start
      start = null
      count = null
    else if typeof count is 'function'
      cb = count
      count = null

    # if start and count are set to 0, you'll just get the TotalResults property
    # and no results

    url = "#{@getIndexUrl(index)}?start=#{start}&pageSize=#{count}&aggregation=None"
    url += "&query=#{@luceneQueryArgs(query)}" if query?

    @apiGetCall(url, cb)


  createIndex: (name, map, reduce, cb) ->
    # reduce is optional, so see if it is a callback
    if typeof reduce is 'function'
      cb = reduce
      reduce = null

    url = @getIndexUrl(name)
    index = { Map : map }

    if reduce? then index['Reduce'] = reduce

    @apiPutCall url, index, (error, response) ->
      if !error and response.statusCode is 201
        cb(null, if response?.body?.length? > 0 then JSON.parse(response.body) else null) if cb?
      else
        if cb?
          if error? then cb(error)
          else cb(new Error('Unable to create index: ' + response.statusCode + ' - ' + response.body))


  deleteIndex: (index, cb) ->
    url = @getIndexUrl(index)

    @apiDeleteCall url, (error, response) ->
      if !error and response.statusCode is 204  # 204 - No content
        cb(null, if response?.body?.length? > 0 then JSON.parse(response.body) else null) if cb?
      else
        if cb?
          if error? then cb(error)
          else cb(new Error('Unable to delete index: ' + response.statusCode + ' - ' + response.body))



  # Attachment methods
  saveAttachment: (docId, content, headers, cb) ->
    url = @getAttachmentUrl(docId)

    @apiPutCall url, content, headers, (error, response) ->
      if !error and response.statusCode is 201
        cb(null, if response?.body?.length? > 0 then JSON.parse(response.body) else null) if cb?
      else
        if cb?
          if error? then cb(error)
          else cb(new Error('Unable to save attachment: ' + response.statusCode + ' - ' + response.body))


  getAttachment: (id, cb) ->
    url = @getAttachmentUrl(id)
    @apiGetCall url, (error, response) ->
      if !error and response.statusCode is 200
        cb(null, response)
      else
        cb(error)


  deleteAttachment: (id, cb) ->
    url = @getAttachmentUrl(id)
    # TODO: Still need to determine the cutOff and allowStale options - http://ravendb.net/docs/http-api/http-api-multi
    @apiDeleteCall url, (error, response) ->
      if !error and response.statusCode is 204  # 204 - No content
        cb(null, response.body) if cb?
       else
        if cb?
          if error? then cb(error)
          else cb(new Error('Unable to delete attachment: ' + response.statusCode + ' - ' + response.body))



  # helper methods
  luceneQueryArgs: (query) ->
    return null unless query?

    pairs = []
    pairs.push "#{key}:#{value}" for key, value of query
    pairs.join '+'



  # Authorization providers
  useRavenHq: (apiKey, cb) ->
    database = @  # Look at using => in the request.get callbacks
    request.get { uri: database.getDocsUrl() }, (err, denied) -> # should be https://1.ravenhq.com/docs
      # denied.headers['oauth-source'] = https://oauth.ravenhq.com/ApiKeys/OAuth/AccessToken
      request.get { uri: denied.headers['oauth-source'], headers: { "Api-Key": apiKey } }, (err, oauth) ->
        database.setAuthorization("Bearer " + oauth.body)
        cb(err, oauth) if cb?



  # base API get calls
  apiGetCall: (url, headers, cb) ->
    @api.get(url, headers, cb)

  apiPutCall: (url, body, headers, cb) ->
    @api.put(url, body, headers, cb)

  apiPostCall: (url, body, headers, cb) ->
    @api.post(url, body, headers, cb)

  apiPatchCall: (url, body, headers, cb) ->
    @api.patch(url, body, headers, cb)

  apiDeleteCall: (url, body, headers, cb) ->
    @api.delete(url, body, headers, cb)


module.exports = Database
