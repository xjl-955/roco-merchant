/** 图鉴/孵蛋数据层：远程拉取 + 缓存 + 内置兜底（内置兜底为空时提示更新） */

/** 图鉴/孵蛋数据地址：你自己的 GitHub Pages（xjl-955/roco-data，已验证） */
var DEX_URL = 'https://xjl-955.github.io/roco-data/spirits.json';
var BREED_URL = 'https://xjl-955.github.io/roco-data/breeding.json';

var DEX_KEY = 'roco_dex_cache_v2'; // v2: WIKI分类数据
var BREED_KEY = 'roco_breed_cache_v2';
var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小时

/** 通用缓存读取 */
function readCache(key) {
  try {
    var c = wx.getStorageSync(key);
    if (c && c.payload && Date.now() - c.cachedAt < CACHE_TTL) return c.payload;
  } catch (e) { /* 忽略 */ }
  return null;
}

function writeCache(key, payload) {
  try {
    wx.setStorageSync(key, { payload: payload, cachedAt: Date.now() });
  } catch (e) { /* 忽略 */ }
}

/** 精灵图鉴数据。callback(payload, fromCache) */
function loadDex(callback) {
  var cached = readCache(DEX_KEY);
  if (cached) { callback(cached, true); return; }
  wx.request({
    url: DEX_URL + (DEX_URL.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now(),
    timeout: 10000,
    success: function (res) {
      if (res.statusCode === 200 && res.data && res.data.formatVersion >= 3 && res.data.spirits && res.data.spirits.length > 0) {
        writeCache(DEX_KEY, res.data);
        callback(res.data, false);
      } else {
        callback(null, false);
      }
    },
    fail: function () { callback(null, false); }
  });
}

/** 孵蛋数据。callback(payload, fromCache) */
function loadBreed(callback) {
  var cached = readCache(BREED_KEY);
  if (cached) { callback(cached, true); return; }
  wx.request({
    url: BREED_URL + (BREED_URL.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now(),
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
