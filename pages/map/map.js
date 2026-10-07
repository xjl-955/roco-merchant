// v3 数据完成！实现互动地图页：
// - movable-area + movable-view（拖动+双指缩放）
// - 4x4 瓦片网格背景（z=6 的 16 张瓦片，WIKI OSS 直连）
// - 标记按 xPct/yPct 覆盖定位（分类筛选+图标显示）
// 
// 重写 map.js/wxml/wxss 为互动地图版
var fs = require('fs');
var MAPS_INDEX = 'https://xjl-955.github.io/roco-data/maps/index.json';
var MAPS_BASE = 'https://xjl-955.github.io/roco-data/maps/';
var TILE_BASE = 'https://wiki-dev-patch-oss.oss-cn-hangzhou.aliyuncs.com/res/lkwg/S3/tiles-G/6/';
var CAT_ICONS = { '地点': '📍', '宝箱': '🎁', '互动': '🤝', '采矿': '⛏️', '采集': '🌿', '果树': '🌳', '收集': '🏅' };

var indexData = null;

Page({
  data: {
    // 分类视图
    loading: true,
    error: false,
    cats: [],
    // 地图视图
    mapMode: false,
    activeCat: '',
    activeCatIcon: '📍',
    markers: [],     // 当前分类全部标记（含xPct/yPct）
    filtered: [],    // 子分类筛选后
    subs: [],
    activeSub: '全部',
    scale: 1,
    // 选中标记
    selected: null
  },

  onLoad: function () {
    var that = this;
    var KEY = 'roco_maps_index_v3';
    try {
      var c = wx.getStorageSync(KEY);
      if (c && c.data) { that._apply(c.data); }
    } catch (e) { }
    wx.request({
      url: MAPS_INDEX,
      timeout: 20000,
      success: function (res) {
        if (res.statusCode === 200 && res.data && res.data.categories) {
          try { wx.setStorageSync(KEY, { data: res.data, at: Date.now() }); } catch (e) { }
          that._apply(res.data);
        } else if (!that.data.cats.length) {
          that.setData({ loading: false, error: true });
        }
      },
      fail: function () { if (!that.data.cats.length) that.setData({ loading: false, error: true }); }
    });
  },

  _apply: function (indexData) {
    indexData = indexData;
    var cats = (indexData.categories || []).map(function (c) {
      return { name: c.name, icon: CAT_ICONS[c.name] || '📍', count: c.count, file: c.file };
    });
    this._cats = cats;
    this.setData({ loading: false, cats: cats });
  },

  onCatTap: function (e) {
    var that = this;
    var name = e.currentTarget.dataset.name;
    var cat = this._cats.filter(function (c) { return c.name === name; })[0];
    if (!cat) return;
    this.setData({ mapMode: true, activeCat: name, activeCatIcon: cat.icon, loading: true });

    var KEY = 'roco_maps_cat_' + name;
    try {
      var c = wx.getStorageSync(KEY);
      if (c && c.data) { that._use(cat, c.data); return; }
    } catch (e) { }

    wx.request({
      url: MAPS_BASE + cat.file,
      timeout: 20000,
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          try { wx.setStorageSync(KEY, { data: res.data, at: Date.now() }); } catch (e) { }
          that._use(cat, res.data);
        } else that.setData({ loading: false });
      },
      fail: function () { that.setData({ loading: false }); }
    });
  },

  _use: function (cat, markers) {
    // 生成瓦片 URL（z=6 的 4x4）
    var tiles = [];
    for (var y = 0; y < 4; y++) {
      for (var x = 0; x < 4; x++) {
        tiles.push(TILE_BASE + 'tile-' + x + '_' + y + '.png');
      }
    }
    // 标记（限制单分类最大渲染 600 个防卡顿）
    var shown = markers.slice(0, 600).map(function (mk, i) {
      return {
        i: i,
        name: mk.name, sub: mk.sub, desc: mk.desc, layer: mk.layer,
        icon: mk.icon, xPct: mk.xPct, yPct: mk.yPct
      };
    });
    var subs = {};
    markers.forEach(function (m) { subs[m.sub] = (subs[m.sub] || 0) + 1; });
    var subList = Object.keys(subs).map(function (n) { return { name: n, count: subs[n] }; });
    subList.sort(function (a, b) { return b.count - a.count; });
    this._all = shown;
    this.setData({
      loading: false,
      markers: shown,
      filtered: shown,
      tiles: tiles,
      subs: subList,
      total: markers.length
    });
  },

  onSubTap: function (e) {
    var s = e.currentTarget.dataset.sub || '全部';
    this.setData({ activeSub: s });
    var list = s === '全部' ? this._all : this._all.filter(function (m) { return m.sub === s; });
    this.setData({ filtered: list, total: list.length });
  },

  onMarkerTap: function (e) {
    var i = +e.currentTarget.dataset.i;
    var mk = this.data.filtered[i];
    if (mk) this.setData({ selected: mk });
  },

  onClose: function () { this.setData({ selected: null }); },

  onBackCats: function () {
    this.setData({ mapMode: false, activeCat: '', markers: [], filtered: [], selected: null });
  }
});
