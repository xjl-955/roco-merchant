/**
 * 远程数据层：拉取 + 缓存 + 兜底
 *
 * 数据 URL 托管在 GitHub Pages（由 server/fetch-schedule.mjs 定时生成并提交）。
 * 拉取策略：
 *   - 内存/本地缓存 30 分钟内有效，过期才真正发起网络请求
 *   - 请求成功 → 校验 → 应用到 merchant 运行时 → 写入本地缓存
 *   - 请求失败 → 静默回退（缓存或内置数据），不阻塞 UI
 *
 * 注意：wiki.biligame.com 不在小程序 request 合法域名内，
 * 开发调试需在开发者工具勾选「不校验合法域名」，详见 README。
 */

var merchant = require('./merchant.js');

// 档期数据地址：你自己的 GitHub Pages（xjl-955/roco-data 仓库，已验证）
var DATA_URL = 'https://xjl-955.github.io/roco-data/schedule.json';

var STORAGE_KEY = 'roco_merchant_cache_v1';
var CACHE_TTL = 30 * 60 * 1000; // 30 分钟

/** 尝试从本地缓存恢复（onLoad 时调用，保证秒开） */
function loadCached() {
  try {
    var cache = wx.getStorageSync(STORAGE_KEY);
    if (cache && cache.payload && merchant.applyRemoteData(cache.payload)) {
      merchant.setSource('cache');
      return true;
    }
  } catch (e) { /* 存储异常则忽略 */ }
  return false;
}

/** 缓存是否已过期（无缓存视为过期） */
function shouldRefresh() {
  try {
    var cache = wx.getStorageSync(STORAGE_KEY);
    if (!cache || !cache.cachedAt) return true;
    return Date.now() - cache.cachedAt > CACHE_TTL;
  } catch (e) {
    return true;
  }
}

/**
 * 拉取远程数据。
 * callback(err, result)：成功时 result = { updated: bool, updatedAt: 'YYYY-MM-DD' }
 * updated 表示数据比拉取前更新了。
 */
function fetchRemote(callback) {
  var before = merchant.getMeta() && merchant.getMeta().updatedAt;
  wx.request({
    url: DATA_URL,
    timeout: 10000,
    success: function (res) {
      if (res.statusCode !== 200 || !res.data) {
        callback('HTTP ' + res.statusCode);
        return;
      }
      var payload = res.data;
      if (!merchant.applyRemoteData(payload)) {
        callback('数据格式校验未通过');
        return;
      }
      merchant.setSource('remote');
      try {
        wx.setStorageSync(STORAGE_KEY, { payload: payload, cachedAt: Date.now() });
      } catch (e) { /* 缓存失败不影响使用 */ }
      var after = merchant.getMeta() && merchant.getMeta().updatedAt;
      callback(null, {
        updated: before !== after,
        updatedAt: after
      });
    },
    fail: function (err) {
      callback((err && err.errMsg) || '网络请求失败');
    }
  });
}

module.exports = {
  loadCached: loadCached,
  shouldRefresh: shouldRefresh,
  fetchRemote: fetchRemote
};
