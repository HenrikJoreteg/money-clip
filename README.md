# money-clip

![](https://img.shields.io/npm/dm/money-clip.svg)![](https://img.shields.io/npm/v/money-clip.svg)![](https://img.shields.io/npm/l/money-clip.svg)

For managing your client side cache. Tiny wrapper over IndexedDB supporting versioning and max age. Uses Jake Archibald's brilliant `idb-keyval` but adds support for version numbers and max age.

Designed for use in PWAs that need to cache data fetched from APIs and such.

It exports four functions:

1.  `getCachedItem`
1.  `getAllCached`
1.  `clearAllCached`
1.  `cacheItem`

These are all designed to never throw errors because it's designed to work as an enhancement to a PWA. If something fails, you simply don't start with a primed cache of data for your app. Nothing lost.

Clientside caching of user data is great, but can also be treacherous. We need some way to version our data and make sure we don't populate our app with really stale data.

This library provides a way to deal with both of these issues. On every write or read, you can provide a version number (usually a version number stored in a config in your app). In addition to storing the data itself, this library will also store a timestamp and the version number (if provided).

When trying to read the cache when your application starts, if there's a version number mismatch, the previous entry is just deleted, and `null` is returned. In this way, you can throw away potentially problematic cached data by bumping a version number in your config.

If you want to ensure you don't inflate cached data from another user, you can combine a version number in your config with some identifier of the user's session to build a version string. This means that if a different session is used when opening the app, it will lead to a version mismatch and the existing cached will be deleted.

In addition, when reading from the cache, you can specify a maxAge. If the age of the data is greater than the `maxAge` it will just be deleted instead of returned.

## install

```
npm install money-clip
```

## example

```javascript
const { cacheItem } = require('money-clip')
```

## credits

If you like this follow [@HenrikJoreteg](http://twitter.com/henrikjoreteg) on twitter.

## license

[MIT](http://mit.joreteg.com/)
