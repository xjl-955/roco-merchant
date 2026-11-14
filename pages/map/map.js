var MAPS_INDEX = 'https://xjl-955.github.io/roco-data/maps/index.json';
var MAPS_BASE = 'https://xjl-955.github.io/roco-data/maps/';
// 逻辑画布：WIKI 世界 4096×4096（4×4×1024），映射为 2048rpx 视觉尺寸
var CANVAS_RPX = 2048;
var AREA_W = 710;

Page({
  data: {
    loading: true,
    error: false,
    cats: [],
    mapMode: false,
    activeCat: '',
    // 层
    layers: [],
    layerIndex: 0,
    layerGroups: [],
    activeLayerId: '',
    // 瓦片/单图
    tiles: [],
    layerImage: '',
    // 标记
    mapMarkers: [],
    subs: [],
    activeSub: '全部',
    selected: null,
    selectedDetail: null,
    total: 0,
    zoom: 1,
    zoomText: '1x',
    canvasStyle: 'width: ' + AREA_W + 'rpx; height: ' + AREA_W + 'rpx;',
    x: 0,
    y: 0
  },

  _index: null,
  _layerPoints: [],
  _allPoints: [],
  _details: null,
  _assets: null,

  onLoad: function () {
    var that = this;
    var KEY = 'roco_maps_index_v11';
    try {
      var c = wx.getStorageSync(KEY);
      if (c && c.data) { that._applyIndex(c.data); }
    } catch (e) { }
    wx.request({
      url: MAPS_INDEX,
      timeout: 20000,
      success: function (res) {
        if (res.statusCode === 200 && res.data && res.data.categories && res.data.categories.length) {
          try { wx.setStorageSync(KEY, { data: res.data, at: Date.now() }); } catch (e) { }
          that._applyIndex(res.data);
        } else if (!that.data.cats.length) {
          that.setData({ loading: false, error: true });
        }
      },
      fail: function () { if (!that.data.cats.length) that.setData({ loading: false, error: true }); }
    });
  },

  _applyIndex: function (index) {
    this._index = index;
    var cats = (index.categories || []).map(function (c) {
      return { name: c.name, genre: c.genre, icon: c.icon, count: c.count, file: c.file };
    });
    this.setData({ loading: false, cats: cats, total: index.total });
    // 预取 assets 与 details（静默）
    var that = this;
    wx.request({ url: MAPS_BASE + 'assets.json', timeout: 20000, success: function (res) { that._assets = res.data || {}; }, fail: function () { } });
    wx.request({ url: MAPS_BASE + 'details.json', timeout: 20000, success: function (res) { that._details = res.data || {}; }, fail: function () { } });
  },

  onCatTap: function (e) {
    var that = this;
    var genre = e.currentTarget.dataset.genre;
    var cat = this._cats.filter(function (c) { return c.genre === genre; })[0];
    if (!cat) return;
    this._currentGenre = genre;
    this.setData({ mapMode: true, activeCat: cat.name, loading: true, zoom: 1, zoomText: '1x', x: 0, y: 0, selected: null, selectedDetail: null, activeSub: '全部' });
    this._loadLayer(this.data.layerIndex || 0, function () {
      that._loadCat(genre);
    });
  },

  /** 加载空间层（地表默认；地下层列表在 index.layers） */
  _loadLayer: function (layerIndex, done) {
    var that = this;
    var layers = (this._index && this._index.layers) || [];
    var layer = layers[layerIndex] || layers[0];
    if (!layer) { if (done) done(); return; }
    this.setData({ layerIndex: layerIndex, activeLayerId: layer.id, loading: true });
    // 瓦片或单图
    if (layer.render === 'tiles') {
      this.setData({ tiles: layer.tiles, layerImage: '' });
    } else {
      this.setData({ tiles: [], layerImage: layer.image });
    }
    // 点位
    var file = layer.id === 'surface' ? 'points-mainland.json' : 'points-' + layer.id + '.json';
    wx.request({
      url: MAPS_BASE + file,
      timeout: 20000,
      success: function (res) {
        that._layerPoints = (res.statusCode === 200 && res.data) ? res.data : [];
        if (done) done();
      },
      fail: function () { that._layerPoints = []; if (done) done(); }
    });
  },

  _loadCat: function (genre) {
    // 分类筛选：大类匹配 className（WIKI "对战 NPC" 与分类名 "对战NPC" 归一）
    var norm = function (s) { return String(s || '').replace(/\s+/g, ''); };
    var points = this._layerPoints || [];
    var list = points.filter(function (p) { return norm(p.className) === norm(genre); });
    this._allPoints = list;
    this._buildMarkers(genre);
    this.setData({ loading: false });
  },

  _buildMarkers: function (genre) {
    var layer = (this._index.layers || [])[this.data.layerIndex];
    if (!layer) return;
    var minX = layer.bounds[0], minY = layer.bounds[1], side = layer.sideLength;
    var size = Math.round(AREA_W * this.data.zoom);
    var assets = this._assets || {};
    var list = this._allPoints;
    var subs = {};
    var markers = list.map(function (p, i) {
      // projectWorld: (x-minX)/sideLength → 百分比（瓦片世界 4096px）
      var xp = ((p.x - minX) / side) * 100;
      var yp = ((p.y - minY) / side) * 100;
      subs[p.genre] = (subs[p.genre] || 0) + 1;
      return {
        i: i, id: p.id, name: p.name, genre: p.genre, region: p.region,
        icon: assets[p.icon] || '',
        xPct: xp, yPct: yp,
        left: Math.round(xp / 100 * size),
        top: Math.round(yp / 100 * size)
      };
    });
    // sub 排序按数量
    var subList = Object.keys(subs).map(function (n) { return { name: n, count: subs[n] }; });
    subList.sort(function (a, b) { return b.count - a.count; });
    this.setData({ mapMarkers: markers, subs: subList, total: markers.length });
    this._filterMarkers();
  },

  _filterMarkers: function () {
    var sub = this.data.activeSub;
    var size = Math.round(AREA_W * this.data.zoom);
    var all = this.data.mapMarkers;
    var list = sub === '全部' ? all : all.filter(function (m) { return m.genre === sub; });
    var positioned = list.map(function (mk, i) {
      var xp = mk.xPct, yp = mk.yPct;
      return Object.assign({}, mk, {
        i: i,
        left: Math.round(xp / 100 * size),
        top: Math.round(yp / 100 * size)
      });
    });
    this.setData({ mapMarkers: positioned, total: list.length });
  },

  onLayerTap: function (e) {
    var idx = +e.currentTarget.dataset.index;
    var that = this;
    var genre = this._currentGenre || (this._cats[0] && this._cats[0].genre);
    this.setData({ activeSub: '全部', zoom: 1, zoomText: '1x', x: 0, y: 0 });
    this._loadLayer(idx, function () { that._loadCat(genre); });
  },

  onSubTap: function (e) {
    this.setData({ activeSub: e.currentTarget.dataset.sub || '全部' });
    this._filterMarkers();
  },

  onMarkerTap: function (e) {
    var i = +e.currentTarget.dataset.i;
    var mk = this.data.mapMarkers[i];
    if (!mk) return;
    this.setData({ selected: mk });
    var d = this._details && this._details[mk.id];
    this.setData({ selectedDetail: d || null });
  },

  onClose: function () { this.setData({ selected: null, selectedDetail: null }); },

  onBackCats: function () {
    this.setData({ mapMode: false, activeCat: '', selected: null, selectedDetail: null, zoom: 1, zoomText: '1x' });
  },

  onScale: function (e) {
    if (e.detail && e.detail.scale) this.setData({ zoomText: e.detail.scale.toFixed(1) + 'x' });
  },

  onZoomIn: function () {
    this.setData({ zoom: Math.min(4, +(this.data.zoom + 0.5).toFixed(1)) });
    this._applyZoom(); this._filterMarkers();
  },
  onZoomOut: function () {
    this.setData({ zoom: Math.max(1, +(this.data.zoom - 0.5).toFixed(1)) });
    this._applyZoom(); this._filterMarkers();
  },

  _applyZoom: function () {
    var z = this.data.zoom;
    var size = Math.round(AREA_W * z);
    this.setData({
      canvasStyle: 'width: ' + size + 'rpx; height: ' + size + 'rpx;',
      moverStyle: 'width: ' + size + 'rpx; height: ' + size + 'rpx;'
    });
    var off = Math.round((AREA_W * z - AREA_W) / 2);
    this.setData({ x: -off, y: -off, zoomText: z + 'x' });
  }
});
