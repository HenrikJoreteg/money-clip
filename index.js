import * as idbKeyVal from 'idb-keyval'

// pass-through exports
export const { del, clear, keys } = idbKeyVal

const defaultOpts = { maxAge: Infinity, version: 0, lib: idbKeyVal }
const getOpts = passedOptions => Object.assign({}, defaultOpts, passedOptions)

export const get = (key, opts) => {
  const { maxAge, version, lib, now } = getOpts(opts)
  return lib
    .get(key)
    .then(JSON.parse)
    .then(parsed => {
      const age = Date.now() - parsed.time
      if (age > maxAge || version !== parsed.version) {
        lib.del(key)
        return null
      }
      return parsed.data
    })
    .catch(() => null)
}

export const set = (key, data, spec) => {
  const { lib, version } = getOpts(spec)
  return lib
    .set(
      key,
      JSON.stringify({
        version,
        time: Date.now(),
        data
      })
    )
    .catch(() => null)
}

export const getAll = spec => {
  const opts = getOpts(spec)
  let keys
  return opts.lib
    .keys()
    .then(retrievedKeys => {
      keys = retrievedKeys
      return Promise.all(keys.map(key => get(key, opts)))
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
  return {
    get: key => get(key, opts),
    set: (key, val) => set(key, val, opts),
    getAll: () => getAll(opts),
    del: opts.lib.del,
    clear: opts.lib.clear,
    keys: opts.lib.keys
  }
}
