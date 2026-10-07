/**
 * WIKI 详情数据层 v2：按需加载单精灵文件（~2.4KB，秒下+可缓存）
 * 索引：details-index.json（名字→文件映射，仅几十KB）
 */
var INDEX_URL = 'https://xjl-955.github.io/roco-data/details-index.json';
var DETAIL_BASE = 'https://xjl-955.github.io/roco-data/details/';
var INDEX_KEY = 'roco_details_index_v2';
var DETAIL_KEY_PREFIX = 'roco_detail_v2_'; // + id

function norm(name) {
  return String(name).replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '').trim();
}

function getIndexCached() {
  try {
    var c = wx.getStorageSync(INDEX_KEY);
    if (c && c.data) return c.data;
  } catch (e) { }
  return null;
}

/** 拉取名字→文件映射索引（小文件，缓存 7 天） */
function loadIndex(callback) {
  var cached = getIndexCached();
  if (cached) { callback(cached, true); return; }
  wx.request({
    url: INDEX_URL,
    timeout: 15000,
    success: function (res) {
      if (res.statusCode === 200 && res.data && res.data.index) {
        try { wx.setStorageSync(INDEX_KEY, { data: res.data, at: Date.now() }); } catch (e) { }
        callback(res.data, false);
      } else callback(null, false);
    },
    fail: function () { callback(null, false); }
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
