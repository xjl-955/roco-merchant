var MAPS_INDEX = 'https://xjl-955.github.io/roco-data/maps/index.json';
var MAPS_BASE = 'https://xjl-955.github.io/roco-data/maps/';
var TILE_FLOORS = {
  'G': 'https://wiki-dev-patch-oss.oss-cn-hangzhou.aliyuncs.com/res/lkwg/S3/tiles-G/6/',
  'B1': 'https://wiki-dev-patch-oss.oss-cn-hangzhou.aliyuncs.com/res/lkwg/S3/tiles-B1/6/',
  'B2': 'https://wiki-dev-patch-oss.oss-cn-hangzhou.aliyuncs.com/res/lkwg/S3/tiles-B2/6/'
};
var FLOOR_NAMES = { 'G': '大地图', 'B1': '地底一层', 'B2': '地底二层' };
var CAT_ICONS = { '地点': '📍', '宝箱': '🎁', '互动': '🤝', '采矿': '⛏️', '采集': '🌿', '果树': '🌳', '收集': '🏅' };
// 瓦片编号 -4~3（8x8 网格）
var TILE_RANGE = [-4, -3, -2, -1, 0, 1, 2, 3];

Page({
  data: {
    loading: true,
    error: false,
    cats: [],
    mapMode: false,
    activeCat: '',
    activeCatIcon: '📍',
    activeFloor: 'G',
    tiles: [],
    markers: [],
    filtered: [],
    subs: [],
    activeSub: '全部',
    selected: null,
    total: 0
  },

  _markers: [],
  _cats: [],

  onLoad: function () {
    var that = this;
    var KEY = 'roco_maps_index_v4';
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
    var cats = (indexData.categories || []).map(function (c) {
      return { name: c.name, icon: CAT_ICONS[c.name] || '📍', count: c.count, file: c.file };
    });
    this._cats = cats;
    this._buildTiles('G');
    this.setData({ loading: false, cats: cats });
  },

  _buildTiles: function (floor) {
    var base = TILE_FLOORS[floor] || TILE_FLOORS['G'];
    var tiles = [];
    TILE_RANGE.forEach(function (y) {
      TILE_RANGE.forEach(function (x) {
        tiles.push({ key: x + '_' + y, url: base + 'tile-' + x + '_' + y + '.png' });
      });
    });
    this.setData({ tiles: tiles, activeFloor: floor });
  },

  onCatTap: function (e) {
    var that = this;
    var name = e.currentTarget.dataset.name;
    var cat = this._cats.filter(function (c) { return c.name === name; })[0];
    if (!cat) return;
    this.setData({ mapMode: true, activeCat: name, activeCatIcon: cat.icon, loading: true, activeFloor: 'G' });
    this._buildTiles('G');

    var KEY = 'roco_maps_cat_' + name;
    try {
      var c = wx.getStorageSync(KEY);
      if (c && c.data) { that._use(c.data); return; }
    } catch (e) { }

    wx.request({
      url: MAPS_BASE + cat.file,
      timeout: 20000,
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          try { wx.setStorageSync(KEY, { data: res.data, at: Date.now() }); } catch (e) { }
          that._use(res.data);
        } else that.setData({ loading: false });
      },
      fail: function () { that.setData({ loading: false }); }
    });
  },

  _use: function (markers) {
    this._markers = markers.map(function (mk, i) {
      return {
        i: i, name: mk.name, sub: mk.sub, desc: mk.desc,
        layer: mk.layer, icon: mk.icon, xPct: mk.xPct, yPct: mk.yPct
      };
    });
    var subs = {};
    this._markers.forEach(function (m) { subs[m.sub] = (subs[m.sub] || 0) + 1; });
    var subList = Object.keys(subs).map(function (n) { return { name: n, count: subs[n] }; });
    subList.sort(function (a, b) { return b.count - a.count; });
    this.setData({ loading: false, subs: subList });
    this._filterMarkers();
  },

  _filterMarkers: function () {
    var floor = this.data.activeFloor;
    var sub = this.data.activeSub;
    var list = this._markers.filter(function (m) {
      if (floor !== 'G' && m.layer !== floor) return false;
      if (floor === 'G' && m.layer && m.layer !== 'G') return false;
      if (sub !== '全部' && m.sub !== sub) return false;
      return true;
    });
    this.setData({ mapMarkers: list, total: list.length });
  },

  onFloorTap: function (e) {
    this.setData({ activeFloor: e.currentTarget.dataset.floor });
    this._buildTiles(this.data.activeFloor);
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
    this.setData({ mapMode: false, activeCat: '', selected: null });
  }
});