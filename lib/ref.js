
var debug = require('debug')('ref')

exports = module.exports = require('../build/Release/binding.node')

exports.cloneType = function cloneType (type) {
  return {
      size: type.size
    , indirection: type.indirection
    , get: type.get
    , set: type.set
  }
}

/**
 * Returns the "type" property of the given Buffer.
 * Creates a default type for the buffer when none exists.
 */

exports.getType = function getType (buffer) {
  if (!buffer.type) {
    debug('WARN: no "type" found on buffer, setting default "type"', buffer)
    buffer.type = {}
    buffer.type.size = buffer.length
    buffer.type.indirection = 1
    buffer.type.get = function get () {
      throw new Error('unknown "type"')
    }
  }
  return buffer.type
}

/**
 * `ref()` acceps a Buffer instance and returns a new Buffer
 * instance that is "pointer" sized and has it's data pointing to the given
 * Buffer instance. Essentially the created Buffer is a "reference" to the
 * original pointer, equivalent to the following C code:
 *
 * ``` c
 * char *buf = buffer;
 * char **ref = &buf;
 * ```
 */

exports.ref = function ref (buffer) {
  debug('creating a reference to buffer', buffer)
  var reference = new Buffer(exports.sizeof.pointer)
  exports.writePointer(reference, 0, buffer)
  var type = exports.getType(buffer)
  reference.type = exports.cloneType(type)
  reference.type.indirection++
  return reference
}

/**
 * `deref()` acceps a Buffer instance and attempts to "dereference" it.
 * That is, first it checks the "_indirection" count, and if it's greater than
 * 0 then it merely returns another Buffer, but with one level less indirection.
 * When the buffer is at indirection 0, or undefined, then it checks for "type"
 * which should be an Object with it's own "get()" function.
 */

exports.deref = function deref (buffer) {
  var type = exports.getType(buffer)
  var indirection = type.indirection
  debug('dereferencing buffer', buffer, type, indirection)
  if (indirection > 1) {
    // need to create a deref'd Buffer
    var size = indirection === 2 ? type.size : exports.sizeof.pointer
    var reference = exports.readPointer(buffer, 0, size)
    reference.type = exports.cloneType(type)
    reference.type.indirection--
    return reference
  } else {
    // need to check "type"
    return type.get(buffer)
  }
}

/**
 * "attach()" is meant for retaining references to Objects/Buffers in JS-land
 * from calls to "writeObject()" and "writePointer()". C-land doesn't retain the
 * source Buffer in "writePointer()", and "writeObject()" uses a weak reference
 * when writing the Object, so attaching afterwards in necessary. See below...
 */

exports._attach = function _attach (buf, obj) {
  if (!buf._refs) {
    buf._refs = []
  }
  buf._refs.push(obj)
}

/**
 * Overwrite the native "writeObject" function so that it keeps a ref to the
 * passed in Object in JS-land by adding it to the Bufer's _refs array.
 */

exports._writeObject = exports.writeObject
exports.writeObject = function writeObject (buf, offset, obj) {
  debug('writing Object to buffer', buf, offset, obj)
  exports._writeObject(buf, offset, obj)
  exports._attach(buf, obj)
}

/**
 * Overwrite the native "writePointer" function so that it keeps a ref to the
 * passed in Buffer in JS-land by adding it to the Bufer's _refs array.
 */

exports._writePointer = exports.writePointer
exports.writePointer = function writePointer (buf, offset, ptr) {
  debug('writing pointer to buffer', buf, offset, ptr)
  exports._writePointer(buf, offset, ptr)
  exports._attach(buf, ptr)
}

/**
 * NULL_POINTER is essentially:
 *
 * ``` c
 * char **null_pointer;
 * *null_pointer = NULL;
 * ```
 */

exports.NULL_POINTER = exports.ref(exports.NULL)

exports.types = {}
exports.types.char = {
    size: exports.sizeof.char
  , indirection: 1
  , get: function get (buf, offset) {
      return buf.readUInt8(offset || 0)
    }
  , set: function set (buf, offset, val) {
      return buf.writeUInt8(val, offset || 0)
    }
}
exports.types.int32 = {
    size: exports.sizeof.int32
  , indirection: 1
  , get: function get (buf, offset) {
      return buf['readInt32' + exports.endianness](offset || 0)
    }
  , set: function set (buf, offset, val) {
      return buf['writeInt32' + exports.endianness](val, offset || 0)
    }
}