const test = require('tape')
const clip = require('./dist/money-clip')

const getWaitPromise = fn =>
  new Promise(resolve =>
    setTimeout(() => {
      resolve(fn())
    }, 200)
  )

const getLibStub = () => {
  const cache = {}
  return {
    set: (key, value) =>
      new Promise(resolve => {
        cache[key] = value
        resolve(null)
      }),
    get: key => Promise.resolve(cache[key]),
    del: key =>
      new Promise(resolve => {
        delete cache[key]
        resolve(null)
      }),
    keys: () => Promise.resolve(Object.keys(cache)),
    clear: () =>
      new Promise(resolve => {
        for (const key in cache) {
          delete cache[key]
        }
        resolve(null)
      }),
  }
}

const getClosingConnectionError = () => {
  const error = new Error('Failed to execute transaction: database connection is closing')
  error.name = 'InvalidStateError'
  return error
}

test('exports', t => {
  t.ok(clip.keyValLib, 'has Store export')
  t.ok(clip.createStore, 'has createStore export')
  t.equal(clip.keyValLib.createStore, clip.createStore, 'exports patched createStore on keyValLib')
  t.end()
})

test('basic get/set works', t => {
  const opts = { lib: getLibStub() }
  clip
    .set('thing', 'value', opts)
    .then(() => clip.get('thing', opts))
    .then(val => {
      t.equal(val, 'value')
      t.end()
    })
})

test('basic max age works', t => {
  const opts = { lib: getLibStub(), maxAge: 100 }

  clip
    .set('thing', 'value', opts)
    .then(() => clip.get('thing', opts))
    .then(val => {
      t.equal(val, 'value')
      return clip.getAll(opts)
    })
    .then(result => {
      t.deepEqual(result, { thing: 'value' })
      return getWaitPromise(() => clip.get('thing', opts))
    })
    .then(val => {
      t.equal(val, null, 'should now be null')
      return clip.getAll(opts)
    })
    .then(result => {
      t.deepEqual(result, {}, 'should now be empty object')
      t.end()
    })
})

test('version mismatch causes deletion', t => {
  const lib = getLibStub()

  clip
    .set('thing', 'value', { lib, version: 1 })
    .then(() => clip.get('thing', { lib, version: 2 }))
    .then(res => {
      t.equal(res, null, 'should have returned null')
      // even using old version it should now be gone
      return clip.getAll({ lib, version: 1 })
    })
    .then(res => {
      t.deepEqual(res, {})
      t.end()
    })
})

test('getConfiguredCache', t => {
  const lib = getLibStub()
  const cache = clip.getConfiguredCache({
    lib,
    version: 5,
    maxAge: 100,
  })

  cache
    .set('thing', 'value')
    .then(() => cache.set('thing2', 'value2'))
    .then(() => cache.get('thing'))
    .then(val => {
      t.equal(val, 'value')
      // now try with passing in version manually
      // to show the options were actually used
      // when using pre-configured cache
      return clip.get('thing2', { lib, version: 5 })
    })
    .then(val => {
      t.equal(val, 'value2')
      return cache.del('thing2')
    })
    .then(() => cache.getAll())
    .then(res => {
      t.deepEqual(res, { thing: 'value' }, 'first should return')
      return getWaitPromise(() => cache.getAll())
    })
    .then(res => {
      t.deepEqual(res, {}, 'now it should have expired')
      t.end()
    })
})

test('createStore retries once if the cached connection is closing', t => {
  let storesCreated = 0
  let storeCalls = 0
  const lib = {
    createStore: () => {
      storesCreated += 1
      const storeNumber = storesCreated
      return (txMode, callback) => {
        storeCalls += 1
        if (storeNumber === 1) {
          return Promise.reject(getClosingConnectionError())
        }
        return Promise.resolve(callback({ txMode, storeNumber }))
      }
    },
  }
  const store = clip.createStore('test-db', 'test-store', lib)

  store('readonly', objectStore => objectStore).then(result => {
    t.equal(result.txMode, 'readonly')
    t.equal(result.storeNumber, 2, 'uses the reopened store')
    t.equal(storesCreated, 2, 'recreates the store once')
    t.equal(storeCalls, 2, 'retries the original operation once')
    t.end()
  })
})

test('getConfiguredCache uses resilient named stores', t => {
  const cache = {}
  let storesCreated = 0
  const lib = {
    createStore: () => {
      storesCreated += 1
      const storeNumber = storesCreated
      return (txMode, callback) => {
        if (storeNumber === 1) {
          return Promise.reject(getClosingConnectionError())
        }
        return Promise.resolve(callback())
      }
    },
    set: (key, value, store) =>
      store('readwrite', () => {
        cache[key] = value
      }),
    get: (key, store) => store('readonly', () => cache[key]),
    del: (key, store) =>
      store('readwrite', () => {
        delete cache[key]
      }),
    keys: store => store('readonly', () => Object.keys(cache)),
    clear: store =>
      store('readwrite', () => {
        for (const key in cache) {
          delete cache[key]
        }
      }),
  }
  const namedCache = clip.getConfiguredCache({ lib, name: 'named-cache' })

  namedCache
    .set('thing', 'value')
    .then(() => namedCache.get('thing'))
    .then(value => {
      t.equal(value, 'value')
      t.equal(storesCreated, 2, 'recovers by creating a fresh named store')
      t.end()
    })
})
