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
    delete: key =>
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
      })
  }
}

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
    maxAge: 100
  })

  cache
    .set('thing', 'value')
    .then(() => cache.get('thing'))
    .then(val => {
      t.equal(val, 'value')
      // now try with passing in version manually
      // to show the options were actually used
      // when using pre-configured cache
      return clip.get('thing', { lib, version: 5 })
    })
    .then(val => {
      t.equal(val, 'value')
      return cache.getAll()
    })
    .then(res => {
      t.deepEqual(res, { thing: 'value' }, 'first should return')
      return getWaitPromise(() => cache.getAll())
    })
    .then(res => {
      t.deepEqual(res, {}, 'now it should have expired')
      t.end()
    })
})
