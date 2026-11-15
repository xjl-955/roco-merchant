/**
 * WIKI 详情数据层 v3：按需加载单精灵文件（~2.4KB，秒下+可缓存）
 * 索引：details-index.json（名字→文件映射）
 * v3：索引缓存加 TTL（24h）+ 条目数校验，保证新增精灵及时可见
 */
var INDEX_URL = 'https://xjl-955.github.io/roco-data/details-index.json';
var DETAIL_BASE = 'https://xjl-955.github.io/roco-data/details/';
var INDEX_KEY = 'roco_details_index_v3';
var DETAIL_KEY_PREFIX = 'roco_detail_v3_'; // + id
var INDEX_TTL = 24 * 60 * 60 * 1000; // 24 小时

function norm(name) {
  return String(name).replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '').trim();
}

/** 缓存索引可用性：TTL 内 且 条目数达标（>=600，防止旧版残缺索引） */
function getIndexCached() {
  try {
    var c = wx.getStorageSync(INDEX_KEY);
    if (c && c.data && c.data.index) {
      var n = Object.keys(c.data.index).length;
      var fresh = c.at && (Date.now() - c.at) < INDEX_TTL;
      if (fresh && n >= 600) return c.data;
    }
  } catch (e) { }
  return null;
}

/** 拉取名字→文件映射索引（小文件，缓存 7 天） */
function loadIndex(callback) {
  var cached = getIndexCached();
  if (cached) { callback(cached, true); return; }
  // 过期缓存兜底（网络失败时仍可用）
  var stale = null;
  try {
    var sc = wx.getStorageSync(INDEX_KEY);
    if (sc && sc.data && sc.data.index && Object.keys(sc.data.index).length >= 600) stale = sc.data;
  } catch (e) { }
  wx.request({
    url: INDEX_URL,
    timeout: 15000,
    success: function (res) {
      // 【校验】条目数 >= 600 才采纳，防止残缺索引覆盖
      if (res.statusCode === 200 && res.data && res.data.index &&
          Object.keys(res.data.index).length >= 600) {
        try { wx.setStorageSync(INDEX_KEY, { data: res.data, at: Date.now() }); } catch (e) { }
        callback(res.data, false);
      } else callback(stale, false);
    },
    fail: function () { callback(stale, false); }
  });
}

/**
 * 按名字加载单精灵详情（~2.4KB），带 storage 缓存
 * callback(detail|null)
 */
function loadDetail(name, callback) {
  var key = norm(name);
  loadIndex(function (idx) {
    if (!idx || !idx.index || !idx.index[key]) { callback(null); return; }
    var fileId = idx.index[key].id;
    var cacheKey = DETAIL_KEY_PREFIX + fileId;
    try {
      var c = wx.getStorageSync(cacheKey);
      if (c && c.data) { callback(c.data); return; }
    } catch (e) { }
    wx.request({
      url: DETAIL_BASE + idx.index[key].file,
      timeout: 15000,
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          try { wx.setStorageSync(cacheKey, { data: res.data, at: Date.now() }); } catch (e) { }
          callback(res.data);
        } else callback(null);
      },
      fail: function () { callback(null); }
    });
  });
}

module.exports = {
  loadDetail: loadDetail,
  loadIndex: loadIndex,
  norm: norm
};
