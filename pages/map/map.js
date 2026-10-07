var MAPS_INDEX = 'https://xjl-955.github.io/roco-data/maps/index.json';
var MAPS_BASE = 'https://xjl-955.github.io/roco-data/maps/';
var TILE_BASE = 'https://wiki-dev-patch-oss.oss-cn-hangzhou.aliyuncs.com/res/lkwg/S3/tiles-';
var CAT_ICONS = { '地点': '📍', '宝箱': '🎁', '互动': '🤝', '采矿': '⛏️', '采集': '🌿', '果树': '🌳', '收集': '🏅' };
// 瓦片网格 8x8，编号 -4~3（z=6 基准）
var TILE_RANGE = [-4, -3, -2, -1, 0, 1, 2, 3];
// 楼层定义
var FLOORS = ['G', 'B1', 'B2'];
var FLOOR_NAMES = { 'G': '大地图', 'B1': '地底一层', 'B2': '地底二层' };

Page({
  data: {
    loading: true,
    error: false,
    cats: [],           // 分类
    activeCats: {},     // 多选叠加 {catName: true}
    mapMode: false,
    activeCatLabel: '',
    activeFloor: 'G',
    tiles: [],
    mapMarkers: [],     // 地图上显示的标记
    list: [],           // 列表视图
    subs: [],
    activeSub: '全部',
    selected: null,
    total: 0,
    zoom: 1,
    canvasStyle: 'width: 2048rpx; height: 2048rpx;'
  },

  _dataByCat: {},   // catName -> markers
  _cats: [],

  onLoad: function () {
    var that = this;
    var KEY = 'roco_maps_index_v5';
    try {
      var c = wx.getStorageSync(KEY);
      if (c && c.data) { that._apply(c.data); }
    } catch (e) { }
    wx.request({
      url: MAPS_INDEX,
      timeout: 20000,
      success: function (res) {
        if (res.statusCode === 200 && res.data && res.data.categories && res.data.categories.length) {
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
    this.setData({
      mapMode: true, activeCat: name, activeCatLabel: name,
      activeCatIcon: cat.icon, loading: true,
      activeFloor: 'G', zoom: 1, activeCats: {}
    });
    this._buildTiles('G');
    // 默认勾选当前分类
    var active = {};
    active[name] = true;
    this.setData({ activeCats: active });

    var KEY = 'roco_maps_cat_' + name;
    var load = function (markers) {
      that._dataByCat[name] = markers;
      that._rebuildMarkers();
      that.setData({ loading: false });
    };

    try {
      var c = wx.getStorageSync(KEY);
      if (c && c.data) { load(c.data); return; }
    } catch (e) { }

    wx.request({
      url: MAPS_BASE + cat.file,
      timeout: 20000,
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          try { wx.setStorageSync(KEY, { data: res.data, at: Date.now() }); } catch (e) { }
          load(res.data);
        } else that.setData({ loading: false });
      },
      fail: function () { that.setData({ loading: false }); }
    });
  },

  /** 分类多选切换（叠加显示） */
  onCatToggle: function (e) {
    var name = e.currentTarget.dataset.name;
    var active = this.data.activeCats;
    if (active[name]) delete active[name];
    else active[name] = true;
    this.setData({ activeCats: active });
    this._rebuildMarkers();
  },

  /** 汇总所有勾选分类的标记 */
  _rebuildMarkers: function () {
    var all = [];
    var active = this.data.activeCats;
    for (var catName in active) {
      if (!active[catName]) continue;
      var arr = this._dataByCat[catName] || [];
      arr.forEach(function (mk) { all.push(mk); });
    }
    this._allMerged = all;
    // 子分类统计
    var subs = {};
    all.forEach(function (m) { subs[m.sub] = (subs[m.sub] || 0) + 1; });
    var subList = Object.keys(subs).map(function (n) { return { name: n, count: subs[n] }; });
    subList.sort(function (a, b) { return b.count - a.count; });
    this.setData({ subs: subList });
    this._filterMarkers();
  },

  _filterMarkers: function () {
    var floor = this.data.activeFloor;
    var sub = this.data.activeSub;
    var all = this._allMerged || [];
    var list = all.filter(function (m) {
      if (floor !== 'G' && m.layer !== floor) return false;
      if (floor === 'G' && m.layer && m.layer !== 'G') return false;
      if (sub !== '全部' && m.sub !== sub) return false;
      return true;
    });
    // 渲染上限（真机性能）：300
    var shown = list.slice(0, 300).map(function (mk, i) {
      return {
        i: i, name: mk.name, sub: mk.sub, desc: mk.desc, layer: mk.layer,
        icon: mk.icon, xPct: mk.xPct, yPct: mk.yPct
      };
    });
    this.setData({ mapMarkers: shown, total: list.length });
  },

  _buildTiles: function (floor) {
    var base = TILE_BASE + floor + '/6/';
    var tiles = [];
    TILE_RANGE.forEach(function (y) {
      TILE_RANGE.forEach(function (x) {
        tiles.push({ key: floor + x + '_' + y, url: base + 'tile-' + x + '_' + y + '.png' });
      });
    });
    this.setData({ tiles: tiles, activeFloor: floor, canvasStyle: 'width: 2048rpx; height: 2048rpx;' });
  },

  onFloorTap: function (e) {
    var floor = e.currentTarget.dataset.floor;
    this.setData({ zoom: 1 });
    this._buildTiles(floor);
    this._filterMarkers();
  },

  onSubTap: function (e) {
    this.setData({ activeSub: e.currentTarget.dataset.sub || '全部' });
    this._filterMarkers();
  },

  onMarkerTap: function (e) {
    var i = +e.currentTarget.dataset.i;
    var mk = this.data.mapMarkers[i];
    if (mk) this.setData({ selected: mk });
  },

  onClose: function () { this.setData({ selected: null }); },

  onBackCats: function () {
    this.setData({ mapMode: false, activeCat: '', selected: null, zoom: 1, activeCats: {} });
  },

  onZoomIn: function () {
    this.setData({ zoom: Math.min(4, +(this.data.zoom + 0.5).toFixed(1)) });
    this.applyZoom();
  },

  onZoomOut: function () {
    this.setData({ zoom: Math.max(0.4, +(this.data.zoom - 0.5).toFixed(1)) });
    this.applyZoom();
  },

  applyZoom: function () {
    var size = Math.round(2048 * this.data.zoom);
    this.setData({ canvasStyle: 'width: ' + size + 'rpx; height: ' + size + 'rpx;' });
  }
});