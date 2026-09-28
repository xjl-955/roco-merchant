/** 图鉴/孵蛋数据层：远程拉取 + 缓存 + 内置兜底（v3: SWR 模式，缓存先展示后台刷新） */

var DEX_URL = 'https://xjl-955.github.io/roco-data/spirits.json';
var BREED_URL = 'https://xjl-955.github.io/roco-data/breeding.json';

var DEX_KEY = 'roco_dex_cache_v3';  // v3: 含 slug/family/total 的完整版
var BREED_KEY = 'roco_breed_cache_v3';
var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小时

function readCache(key) {
  try {
    var c = wx.getStorageSync(key);
    if (c && c.payload && Date.now() - c.cachedAt < CACHE_TTL) return c.payload;
  } catch (e) { }
  return null;
}

function writeCache(key, payload) {
  try {
    wx.setStorageSync(key, { payload: payload, cachedAt: Date.now() });
  } catch (e) { }
}

function bust(url) {
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now();
}

/**
 * 精灵图鉴数据（SWR：缓存命中立即回调，同时后台拉最新，有更新再回调一次）。
 * callback(payload, fromCache) —— 可能被调用两次；页面需支持重复渲染。
 */
function loadDex(callback) {
  var served = false;
  var cached = readCache(DEX_KEY);
  if (cached) {
    served = true;
    callback(cached, true);
  }
  wx.request({
    url: bust(DEX_URL),
    timeout: 15000,
    success: function (res) {
      if (res.statusCode === 200 && res.data && res.data.formatVersion >= 3 &&
          res.data.spirits && res.data.spirits.length > 0) {
        var fresh = res.data;
        var changed = !cached ||
          fresh.generatedAt !== cached.generatedAt ||
          fresh.count !== cached.count;
        writeCache(DEX_KEY, fresh);
        if (!served || changed) callback(fresh, false);
      } else if (!served) {
        callback(null, false);
      }
    },
    fail: function () { if (!served) callback(null, false); }
  });
}

/** 孵蛋数据。callback(payload, fromCache) */
function loadBreed(callback) {
  var cached = readCache(BREED_KEY);
  if (cached) { callback(cached, true); return; }
  wx.request({
    url: bust(BREED_URL),
    timeout: 10000,
    success: function (res) {
      if (res.statusCode === 200 && res.data && res.data.eggs) {
        writeCache(BREED_KEY, res.data);
        callback(res.data, false);
      } else {
        callback(null, false);
      }
    },
    fail: function () { callback(null, false); }
  });
}

module.exports = {
  loadDex: loadDex,
  loadBreed: loadBreed
};
