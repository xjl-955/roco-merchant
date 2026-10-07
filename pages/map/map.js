var MAPS_INDEX = 'https://xjl-955.github.io/roco-data/maps/index.json';
var MAPS_BASE = 'https://xjl-955.github.io/roco-data/maps/';

var CAT_ICONS = {
  '地点': '📍', '宝箱': '🎁', '互动': '🤝',
  '采矿': '⛏️', '采集': '🌿', '果树': '🌳', '收集': '🏅'
};

Page({
  data: {
    loading: true,
    error: false,
    cats: [],        // 分类列表 {name, icon, count}
    activeCat: '',   // 当前分类
    subs: [],        // 子分类筛选 {name, count}
    activeSub: '',   // 当前子分类（''=全部）
    keyword: '',
    list: [],        // 过滤后展示
    total: 0,
    expanded: null   // 展开描述的点位 key
  },

  _markers: [],

  onLoad: function () {
    var that = this;
    var KEY = 'roco_maps_index_v1';
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
      fail: function () {
        if (!that.data.cats.length) that.setData({ loading: false, error: true });
      }
    });
  },

  _apply: function (indexData) {
    var cats = (indexData.categories || []).map(function (c) {
      return {
        name: c.name,
        icon: CAT_ICONS[c.name] || '📍',
        count: c.count,
        file: c.file
      };
    });
    this._indexData = indexData;
    this.setData({ loading: false, cats: cats });
  },

  onCatTap: function (e) {
    var that = this;
    var name = e.currentTarget.dataset.name;
    var cat = null;
    for (var i = 0; i < this.data.cats.length; i++) {
      if (this.data.cats[i].name === name) { cat = this.data.cats[i]; break; }
    }
    if (!cat) return;
    this.setData({ activeCat: name, loading: true, activeSub: '', keyword: '' });

    var KEY = 'roco_maps_cat_' + name;
    try {
      var c = wx.getStorageSync(KEY);
      if (c && c.data) { that._applyMarkers(cat, c.data); return; }
    } catch (e) { }

    wx.request({
      url: MAPS_BASE + cat.file,
      timeout: 20000,
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          try { wx.setStorageSync(KEY, { data: res.data, at: Date.now() }); } catch (e) { }
          that._applyMarkers(cat, res.data);
        } else that.setData({ loading: false });
      },
      fail: function () { that.setData({ loading: false }); }
    });
  },

  _applyMarkers: function (cat, markers) {
    this._markers = markers;
    var subs = {};
    markers.forEach(function (m) { subs[m.sub] = (subs[m.sub] || 0) + 1; });
    var subList = Object.keys(subs).map(function (n) { return { name: n, count: subs[n] }; });
    subList.sort(function (a, b) { return b.count - a.count; });
    this.setData({
      loading: false,
      subs: subList,
      total: markers.length,
      list: markers
    });
  },

  onSubTap: function (e) {
    var s = e.currentTarget.dataset.sub || '';
    this.setData({ activeSub: s });
    this._filter();
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
    this._filter();
  },

  _filter: function () {
    var kw = (this.data.keyword || '').trim().toLowerCase();
    var sub = this.data.activeSub;
    var list = (this._markers || []).filter(function (m) {
      if (sub && m.sub !== sub) return false;
      if (kw && (m.name || '').toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
    this.setData({ list: list, total: list.length });
  },

  onPointTap: function (e) {
    var key = e.currentTarget.dataset.key;
    this.setData({ expanded: this.data.expanded === key ? null : key });
  }
});
