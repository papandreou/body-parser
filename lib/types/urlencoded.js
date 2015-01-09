/*!
 * body-parser
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014 Douglas Christopher Wilson
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var bytes = require('bytes')
var deprecate = require('depd')('body-parser')
var read = require('../read')
var typer = require('media-typer')
var typeis = require('type-is')

/**
 * Module exports.
 */

module.exports = urlencoded

/**
 * Cache of parser modules.
 */

var parsers = Object.create(null)

/**
 * Create a middleware to parse urlencoded bodies.
 *
 * @param {object} [options]
 * @return {function}
 * @api public
 */

function urlencoded(options){
  options = options || {};

  // notice because option default will flip in next major
  if (options.extended === undefined) {
    deprecate('undefined extended: provide extended option')
  }

  var extended = options.extended !== false
  var inflate = options.inflate !== false
  var limit = typeof options.limit !== 'number'
    ? bytes(options.limit || '100kb')
    : options.limit
  var type = options.type || 'urlencoded'
  var verify = options.verify || false

  if (verify !== false && typeof verify !== 'function') {
    throw new TypeError('option verify must be function')
  }

  var defaultCharset = options.defaultCharset || 'utf-8'
  if (defaultCharset !== 'utf-8' && (!extended && defaultCharset !== 'iso-8859-1')) {
    throw new TypeError('option defaultCharset must be either utf-8 or iso-8859-1 (only supported with extended is true)')
  }

  var queryparse = extended
    ? extendedparser(options)
    : simpleparser(options)

  return function urlencodedParser(req, res, next) {
    if (req._body) return next();
    req.body = req.body || {}

    if (!typeis(req, type)) return next();

    var charset = (typer.parse(req).parameters.charset || defaultCharset).toLowerCase()
    if (charset !== 'utf-8' && charset !== 'iso-8859-1') {
      var err = new Error('unsupported charset "' + charset.toUpperCase() + '"')
      err.charset = charset
      err.status = 415
      next(err)
      return
    }

    // read
    read(req, res, next, function parse(body) {
      return body.length
        ? queryparse(body, charset)
        : {}
    }, {
      encoding: charset,
      inflate: inflate,
      limit: limit,
      verify: verify
    })
  }
}

/**
 * Get the extended query parser.
 *
 * @param {object} options
 */

function extendedparser(options) {
  var parameterLimit = options.parameterLimit !== undefined
    ? options.parameterLimit
    : 1000
  var parse = parser('qs-papandreou')
  var utf8Sentinel = options.utf8Sentinel
  var interpretNumericEntities = options.interpretNumericEntities

  if (isNaN(parameterLimit) || parameterLimit < 1) {
    throw new TypeError('option parameterLimit must be a positive number')
  }

  if (isFinite(parameterLimit)) {
    parameterLimit = parameterLimit | 0
  }

  return function queryparse(body, charset) {
    var paramCount = parameterCount(body, parameterLimit)

    if (paramCount === undefined) {
      var err = new Error('too many parameters')
      err.status = 413
      throw err
    }

    var arrayLimit = Math.max(100, paramCount)

    return parse(body, {
      arrayLimit: arrayLimit,
      parameterLimit: parameterLimit,
      charset: charset,
      utf8Sentinel: utf8Sentinel,
      interpretNumericEntities: interpretNumericEntities
    })
  }
}

/**
 * Count the number of parameters, stopping once limit reached
 *
 * @param {string} body
 * @param {number} limit
 * @api private
 */

function parameterCount(body, limit) {
  var count = 0
  var index = 0

  while ((index = body.indexOf('&', index)) !== -1) {
    count++
    index++

    if (count === limit) {
      return undefined
    }
  }

  return count
}

/**
 * Get parser for module name dynamically.
 *
 * @param {string} name
 * @return {function}
 * @api private
 */

function parser(name) {
  var mod = parsers[name]

  if (mod) {
    return mod.parse
  }

  // load module
  mod = parsers[name] = require(name)

  return mod.parse
}

/**
 * Get the simple query parser.
 *
 * @param {object} options
 */

function simpleparser(options) {
  var parameterLimit = options.parameterLimit !== undefined
    ? options.parameterLimit
    : 1000
  var parse = parser('querystring')

  if (isNaN(parameterLimit) || parameterLimit < 1) {
    throw new TypeError('option parameterLimit must be a positive number')
  }

  if (isFinite(parameterLimit)) {
    parameterLimit = parameterLimit | 0
  }

  return function queryparse(body) {
    var paramCount = parameterCount(body, parameterLimit)

    if (paramCount === undefined) {
      var err = new Error('too many parameters')
      err.status = 413
      throw err
    }

    return parse(body, undefined, undefined, {maxKeys: parameterLimit})
  }
}
