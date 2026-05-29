import * as idbKeyVal from 'idb-keyval'

const isRecoverableStoreError = error => {
  if (!error) return false
  const message = error.message || ''
  return (
    error.name === 'InvalidStateError' ||
    /database connection is closing/i.test(message)
  )
}

export const createStore = (dbName, storeName, lib = idbKeyVal) => {
  const createStoreFn = lib.createStore && lib.createStore !== createStore
    ? lib.createStore.bind(lib)
    : idbKeyVal.createStore
  let store = createStoreFn(dbName, storeName)

  const resetStore = () => {
    store = createStoreFn(dbName, storeName)
    return store
  }

  const runStore = (txMode, callback) => {
    try {
      return Promise.resolve(store(txMode, callback))
    } catch (error) {
      return Promise.reject(error)
    }
  }

  return (txMode, callback) =>
    runStore(txMode, callback).catch(error => {
      if (!isRecoverableStoreError(error)) {
        throw error
      }
      return resetStore()(txMode, callback)
    })
}

export const keyValLib = Object.assign({}, idbKeyVal, { createStore })

const defaultOpts = { maxAge: Infinity, version: 0, lib: keyValLib }
const getOpts = passedOptions => Object.assign({}, defaultOpts, passedOptions)

export const get = (key, opts, store) => {
  const { maxAge, version, lib } = getOpts(opts)
  return lib
    .get(key, store)
    .then(JSON.parse)
    .then(parsed => {
      const age = Date.now() - parsed.time
      if (age > maxAge || version !== parsed.version) {
        lib.del(key, store)
        return null
      }
      return parsed.data
    })
    .catch(() => null)
}

export const set = (key, data, spec, store) => {
  const { lib, version } = getOpts(spec)
  return lib
    .set(
      key,
      JSON.stringify({
        version,
        time: Date.now(),
        data,
      }),
      store
    )
    .catch(() => null)
}

export const getAll = (spec, store) => {
  const opts = getOpts(spec)
  let keys
  return opts.lib
    .keys(store)
    .then(retrievedKeys => {
      keys = retrievedKeys
      return Promise.all(keys.map(key => get(key, opts, store)))
    })
    .then(data =>
      data.reduce((acc, bundleData, index) => {
        if (bundleData) {
          acc[keys[index]] = bundleData
        }
        return acc
      }, {})
    )
    .catch(() => {})
}

export const getConfiguredCache = spec => {
  const opts = getOpts(spec)
  let store
  if (opts.name) {
    store = createStore(opts.name, opts.name, opts.lib)
  }
  return {
    get: key => get(key, opts, store),
    set: (key, val) => set(key, val, opts, store),
    getAll: () => getAll(opts, store),
    del: key => opts.lib.del(key, store),
    clear: () => opts.lib.clear(store),
    keys: () => opts.lib.keys(store),
  }
}
