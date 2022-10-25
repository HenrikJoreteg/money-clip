import * as idbKeyVal from 'idb-keyval'

type DefaultOpts = {
  maxAge: number
  version: number | string
  lib: typeof idbKeyVal
  name?: string
}

export type MoneyClipOptions = Partial<DefaultOpts>

export type Key = IDBValidKey

const defaultOpts: DefaultOpts = {
  maxAge: Infinity,
  version: 0,
  lib: idbKeyVal,
}
const getOpts = (passedOptions: MoneyClipOptions) =>
  Object.assign({}, defaultOpts, passedOptions)

type Store = idbKeyVal.UseStore

type StringifiedData<T> = {
  version: string
  time: Date
  data: T
}

export const keyValLib = idbKeyVal

export const get = <T = any>(
  key: Key,
  opts: MoneyClipOptions,
  store: Store
) => {
  const { maxAge, version, lib } = getOpts(opts)
  return lib
    .get<string>(key, store)
    .then(
      (stringifiedData: string | undefined) =>
        stringifiedData && (JSON.parse(stringifiedData) as StringifiedData<T>)
    )
    .then(parsed => {
      if (!parsed) {
        return null
      }
      const age = Date.now().valueOf() - new Date(parsed.time).valueOf()
      if (age > maxAge || version !== parsed.version) {
        lib.del(key, store)
        return null
      }
      return parsed.data
    })
    .catch(() => null)
}

export const set = <T>(
  key: Key,
  data: T,
  spec: MoneyClipOptions,
  store: Store
) => {
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

export const getAll = (spec: MoneyClipOptions, store: Store) => {
  const opts = getOpts(spec)
  let keys: Key[]
  return opts.lib
    .keys(store)
    .then(retrievedKeys => {
      keys = retrievedKeys
      return Promise.all(keys.map(key => get(key, opts, store)))
    })
    .then(data =>
      data.reduce((acc, bundleData, index) => {
        if (bundleData) {
          //@ts-ignore
          // TODO: not sure how to properly type this
          acc[keys[index]] = bundleData
        }
        return acc
      }, {})
    )
    .catch(() => {})
}

export const getConfiguredCache = (spec: MoneyClipOptions) => {
  const opts = getOpts(spec)
  let store: Store
  if (opts.name) {
    store = idbKeyVal.createStore(opts.name, opts.name)
  }
  return {
    get: (key: Key) => get(key, opts, store),
    set: <T>(key: Key, val: T) => set(key, val, opts, store),
    getAll: () => getAll(opts, store),
    del: (key: Key) => opts.lib.del(key, store),
    clear: () => opts.lib.clear(store),
    keys: () => opts.lib.keys(store),
  }
}
