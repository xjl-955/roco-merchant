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
    if (!this._cats) this._cats = [];
    if (!this._layerPoints) this._layerPoints = [];
    if (!this._allPoints) this._allPoints = [];
    if (!this._assets) this._assets = {};
    if (!this._details) this._details = {};
    var KEY = 'roco_maps_index_v11';
    try {
      var c = wx.getStorageSync(KEY);
      // 【校验】必须是聚合后的 8 大类版本（带 subs 字段），否则弃用缓存
      if (c && c.data && c.data.categories && c.data.categories.length === 8 &&
          c.data.categories[0].subs) {
        that._applyIndex(c.data);
      }
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
      return { name: c.name, genre: c.genre, icon: c.icon, count: c.count, file: c.file, classId: c.classId, subs: c.subs || [] };
    });
    this._cats = cats; // 【必须】同步私有字段，供 onCatTap 使用
    this.setData({ loading: false, cats: cats, total: index.total });
    // 预取 assets 与 details（静默）
    var that = this;
    wx.request({ url: MAPS_BASE + 'assets.json', timeout: 20000, success: function (res) { that._assets = res.data || {}; }, fail: function () { } });
    wx.request({ url: MAPS_BASE + 'details.json', timeout: 20000, success: function (res) { that._details = res.data || {}; }, fail: function () { } });
  },

  onCatTap: function (e) {
    var that = this;
    if (!this._cats || !this._cats.length) this._cats = this.data.cats || [];
    var name = e.currentTarget.dataset.name;
    var cat = (this._cats || []).filter(function (c) { return c.name === name; })[0];
    if (!cat) {
      // 兜底：从 data.cats 直接找（热重载/实例重建后 _cats 可能丢失）
      cat = (this.data.cats || []).filter(function (c) { return c.name === name; })[0];
    }
    if (!cat) return;
    this._currentCat = cat;
    this._currentGenre = '';
    this.setData({ mapMode: true, activeCat: cat.name, loading: true, zoom: 1, zoomText: '1x', x: 0, y: 0, selected: null, selectedDetail: null, activeSub: '全部' });
    if (!this._index) {
      // 热重载后 _index 丢失：从缓存恢复或直接请求
      var KEY = 'roco_maps_index_v11';
      var cached = null;
      try { cached = wx.getStorageSync(KEY); } catch (e) { }
      if (cached && cached.data) { this._index = cached.data; }
    }
    if (!this._assets) this._assets = {};
    if (!this._details) this._details = {};
    if (!this._layerPoints) this._layerPoints = [];
    // 从分类列表进入时固定回到地表层（index 0），并清空上一类的点位缓存
    this._allPoints = [];
    this.setData({ layerIndex: 0, mapMarkers: [], subs: [], total: 0 });
    this._loadLayer(0, function () {
      that._loadCat(cat);
    });
  },

  /** 加载空间层（地表用按大类拆分的小文件，不再下载 2MB 全量；地下层单文件）*/
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
    // 地表：点位由 _loadCat 按大类加载（无需预取）
    if (layer.kind === 'surface') {
      that._layerPoints = [];
      if (done) done();
      return;
    }
    // 地下层：小文件（各处 <15KB）
    var file = 'points-' + layer.id + '.json';
    var CACHE_KEY = 'roco_maps_pts_v11_' + layer.id;
    var TTL = 3 * 24 * 60 * 60 * 1000;
    try {
      var c = wx.getStorageSync(CACHE_KEY);
      if (c && Array.isArray(c.data) && c.data.length && c.at && (Date.now() - c.at) < TTL) {
        that._layerPoints = c.data;
        if (done) done();
        return;
      }
    } catch (e) { }
    wx.request({
      url: MAPS_BASE + file,
      timeout: 20000,
      success: function (res) {
        that._layerPoints = (res.statusCode === 200 && res.data) ? res.data : [];
        try { wx.setStorageSync(CACHE_KEY, { data: that._layerPoints, at: Date.now() }); } catch (e) { }
        if (done) done();
      },
      fail: function () { that._layerPoints = []; if (done) done(); }
    });
  },

  /** 按大类加载点位：地表走 points-surface-<classId>.json（几十KB~1MB），地下层内存过滤 */
  _loadCat: function (cat) {
    var that = this;
    var norm = function (s) { return String(s || '').replace(/\s+/g, ''); };
    var catName = (cat && cat.name) || '';
    var layer = ((this._index && this._index.layers) || [])[this.data.layerIndex] || {};
    var apply = function (points) {
      that._allPoints = points;
      that._buildMarkers(cat || { name: catName, subs: [] });
      that.setData({ loading: false });
    };
    // 地下层：内存过滤（该层无当前大类点位时，兜底显示该层全部点位）
    if (layer.kind !== 'surface') {
      var pts = Array.isArray(this._layerPoints) ? this._layerPoints : [];
      var filtered = pts.filter(function (p) { return norm(p.className) === norm(catName); });
      apply(filtered.length ? filtered : pts);
      return;
    }
    // 地表：按 classId 请求小文件
    var cid = cat && cat.classId;
    if (!cid) {
      var pts2 = Array.isArray(this._layerPoints) ? this._layerPoints : [];
      apply(pts2.filter(function (p) { return norm(p.className) === norm(catName); }));
      return;
    }
    var file = 'points-surface-' + cid + '.json';
    var CACHE_KEY = 'roco_maps_cls_v11_' + cid;
    var TTL = 3 * 24 * 60 * 60 * 1000;
    try {
      var c = wx.getStorageSync(CACHE_KEY);
      if (c && Array.isArray(c.data) && c.at && (Date.now() - c.at) < TTL) {
        apply(c.data);
        return;
      }
    } catch (e) { }
    this.setData({ loading: true });
    wx.request({
      url: MAPS_BASE + file,
      timeout: 25000,
      success: function (res) {
        var arr = (res.statusCode === 200 && Array.isArray(res.data)) ? res.data : [];
        try { wx.setStorageSync(CACHE_KEY, { data: arr, at: Date.now() }); } catch (e) { }
        apply(arr);
      },
      fail: function () { apply([]); }
    });
  },

  /** 构建子类 chips（从原始 _allPoints 统计，不受当前筛选影响） */
  _buildMarkers: function (cat) {
    var list = Array.isArray(this._allPoints) ? this._allPoints : [];
    var subs = {};
    list.forEach(function (p) { subs[p.genre] = (subs[p.genre] || 0) + 1; });
    // 子类 chips：优先大类自带的子类清单（保证 WIKI 全量与顺序），数量取实况
    var subList = ((cat && cat.subs) || []).map(function (s) {
      return { name: s.name, count: subs[s.name] || 0 };
    }).filter(function (s) { return s.count > 0; });
    // 兜底：点位里有但清单没有的子类
    Object.keys(subs).forEach(function (n) {
      if (!subList.some(function (s) { return s.name === n; })) subList.push({ name: n, count: subs[n] });
    });
    subList.sort(function (a, b) { return b.count - a.count; });
    this.setData({ subs: subList });
    this._filterMarkers();
  },

  /** 过滤 + 定位：始终从 _allPoints（原始全量）重新计算，避免多次切换累积缩小 */
  _filterMarkers: function () {
    var layers = (this._index && this._index.layers) || [];
    var layer = layers[this.data.layerIndex] || layers[0];
    if (!layer || !layer.bounds) { this.setData({ mapMarkers: [], total: 0 }); return; }
    var minX = layer.bounds[0], minY = layer.bounds[1], side = layer.sideLength || 1;
    var size = Math.round(AREA_W * this.data.zoom);
    var assets = this._assets || {};
    var sub = this.data.activeSub;
    var src = Array.isArray(this._allPoints) ? this._allPoints : [];
    var list = (sub === '全部') ? src : src.filter(function (p) { return p.genre === sub; });
    var markers = list.map(function (p, i) {
      var xp = ((p.x - minX) / side) * 100;
      var yp = ((p.y - minY) / side) * 100;
      return {
        i: i, id: p.id, name: p.name, genre: p.genre, region: p.region,
        icon: assets[p.icon] || '',
        xPct: xp, yPct: yp,
        left: Math.round(xp / 100 * size),
        top: Math.round(yp / 100 * size)
      };
    });
    this.setData({ mapMarkers: markers, total: markers.length });
  },

  onLayerTap: function (e) {
    var idx = +e.currentTarget.dataset.index;
    var that = this;
    var cat = this._currentCat || this._cats[0];
    this.setData({ activeSub: '全部', zoom: 1, zoomText: '1x', x: 0, y: 0 });
    this._loadLayer(idx, function () { that._loadCat(cat); });
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
