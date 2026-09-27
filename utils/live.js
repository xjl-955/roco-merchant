/**
 * 实时轮次数据层
 *
 * 数据源：rocokingdomworld.org 公开静态 JSON（该站由服务端从好游快爆工具页定时抓取）
 * 仅提供"今天"的四轮商品明细（价格/限购/图标/所属轮次），不含未来档期表。
 * 档期表（哪几天有商人）仍走 WIKI 管线（utils/api.js），两者互补。
 *
 * 使用礼仪：5 分钟本地缓存 TTL，打开/手动刷新时才拉取，不高频轮询。
 */

var merchant = require('./merchant.js');

// 实时数据源（多源容灾：依次尝试，全部失败才回退档期推算）
// 1号源：自建数据（GitHub Actions 每天 08:12/12:12/16:12/20:12 从快爆源抓取并提交）
var LIVE_URLS = [
  'https://xjl-955.github.io/roco-data/live.json',         // 自建（每日四轮自动更新）
  'https://rocokingdomworld.org/data/merchant.json',       // 参照站（社区维护，兜底）
  'https://qi-du-shang.github.io/data.json'                // 第三方镜像（最后兜底）
];
var LIVE_URL = LIVE_URLS[0]; // 兼容旧引用
var STORAGE_KEY = 'roco_live_cache_v1';
var CACHE_TTL = 5 * 60 * 1000; // 5 分钟

/** 从本地缓存恢复（TTL 内有效） */
function loadCached() {
  try {
    var cache = wx.getStorageSync(STORAGE_KEY);
    if (cache && cache.payload && Date.now() - cache.cachedAt < CACHE_TTL) {
      if (merchant.applyLiveToday(cache.payload)) return true;
    }
  } catch (e) { /* 忽略 */ }
  return false;
}

/** 缓存是否过期（无缓存视为过期） */
function isStale() {
  try {
    var cache = wx.getStorageSync(STORAGE_KEY);
    if (!cache || !cache.cachedAt) return true;
    return Date.now() - cache.cachedAt > CACHE_TTL;
  } catch (e) {
    return true;
  }
}

/**
 * 拉取实时数据（多源依次尝试）。callback(err, result)
 * 成功：result = { round, source }；失败：err = 原因字符串（静默回退，不影响既有视图）
 */
function fetchLive(callback) {
  var idx = 0;

  function tryNext(lastErr) {
    if (idx >= LIVE_URLS.length) {
      callback(lastErr || '全部数据源不可用');
      return;
    }
    var url = LIVE_URLS[idx++];
    // 加时间戳参数绕过 CDN/浏览器缓存（GitHub Pages 静态文件会被 CDN 缓存数分钟）
    var bustUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now();
    wx.request({
      url: bustUrl,
      timeout: 8000,
      success: function (res) {
        if (res.statusCode !== 200 || !res.data) {
          tryNext('HTTP ' + res.statusCode + ' @ ' + url);
          return;
        }
        if (!merchant.applyLiveToday(res.data)) {
          tryNext('数据校验未通过 @ ' + url);
          return;
        }
        try {
          wx.setStorageSync(STORAGE_KEY, { payload: res.data, cachedAt: Date.now() });
        } catch (e) { /* 缓存失败不影响使用 */ }
        var live = merchant.getLiveToday();
        callback(null, { round: live ? live.round : 0, source: url });
      },
      fail: function (err) {
        tryNext((err && err.errMsg) || '网络请求失败 @ ' + url);
      }
    });
  }

  tryNext(null);
}

module.exports = {
  loadCached: loadCached,
  isStale: isStale,
  fetchLive: fetchLive
};
