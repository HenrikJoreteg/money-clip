import test from 'node:test'
import assert from 'node:assert/strict'
import * as clip from './index.js'

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

test('exports', () => {
  assert.ok(clip.keyValLib, 'has Store export')
  assert.ok(clip.createStore, 'has createStore export')
  assert.equal(clip.keyValLib.createStore, clip.createStore, 'exports patched createStore on keyValLib')
})

test('basic get/set works', async () => {
  const opts = { lib: getLibStub() }

  await clip.set('thing', 'value', opts)
  const val = await clip.get('thing', opts)

  assert.equal(val, 'value')
})

test('basic max age works', async () => {
  const opts = { lib: getLibStub(), maxAge: 100 }

  await clip.set('thing', 'value', opts)
  assert.equal(await clip.get('thing', opts), 'value')
  assert.deepEqual(await clip.getAll(opts), { thing: 'value' })
  assert.equal(await getWaitPromise(() => clip.get('thing', opts)), null, 'should now be null')
  assert.deepEqual(await clip.getAll(opts), {}, 'should now be empty object')
})

test('version mismatch causes deletion', async () => {
  const lib = getLibStub()

  await clip.set('thing', 'value', { lib, version: 1 })
  assert.equal(await clip.get('thing', { lib, version: 2 }), null, 'should have returned null')
  // even using old version it should now be gone
  assert.deepEqual(await clip.getAll({ lib, version: 1 }), {})
})

test('getConfiguredCache', async () => {
  const lib = getLibStub()
  const cache = clip.getConfiguredCache({
    lib,
    version: 5,
    maxAge: 100,
  })

  await cache.set('thing', 'value')
  await cache.set('thing2', 'value2')
  assert.equal(await cache.get('thing'), 'value')
  // now try with passing in version manually
  // to show the options were actually used
  // when using pre-configured cache
  assert.equal(await clip.get('thing2', { lib, version: 5 }), 'value2')
  await cache.del('thing2')
  assert.deepEqual(await cache.getAll(), { thing: 'value' }, 'first should return')
  assert.deepEqual(await getWaitPromise(() => cache.getAll()), {}, 'now it should have expired')
})

test('createStore retries once if the cached connection is closing', async () => {
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

  const result = await store('readonly', objectStore => objectStore)

  assert.equal(result.txMode, 'readonly')
  assert.equal(result.storeNumber, 2, 'uses the reopened store')
  assert.equal(storesCreated, 2, 'recreates the store once')
  assert.equal(storeCalls, 2, 'retries the original operation once')
})

test('getConfiguredCache uses resilient named stores', async () => {
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

  await namedCache.set('thing', 'value')

  assert.equal(await namedCache.get('thing'), 'value')
  assert.equal(storesCreated, 2, 'recovers by creating a fresh named store')
})
