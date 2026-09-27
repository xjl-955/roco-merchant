var tools = require('../../utils/tools.js');

Page({
  data: {
    loading: true,
    error: false,
    keyword: '',
    stageIndex: 0,
    stages: ['全部', '一阶', '二阶', '三阶', '首领化'],
    types: [],
    typeIndex: 0,
    list: [],       // 渲染列表（分页）
    total: 0,
    count: 0,
    pageSize: 30,
    types_meta: {}
  },

  all: [],

  onLoad: function () {
    var that = this;
    tools.loadDex(function (payload, fromCache) {
      if (!payload) {
        that.setData({ loading: false, error: true });
        return;
      }
      that.all = payload.spirits;
      that.typesMeta = payload.types || {};
      var typeNames = ['全部属性'];
      for (var k in that.typesMeta) typeNames.push(k);
      that.setData({
        loading: false,
        count: payload.count,
        types: typeNames,
        types_meta: that.typesMeta
      });
      that.applyFilter();
    });
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },

  onStageChange: function (e) {
    this.setData({ stageIndex: +e.detail.value });
    this.applyFilter();
  },

  onTypeChange: function (e) {
    this.setData({ typeIndex: +e.detail.value });
    this.applyFilter();
  },

  applyFilter: function () {
    var kw = (this.data.keyword || '').trim().toLowerCase();
    var stage = this.data.stages[this.data.stageIndex];
    var type = this.data.types[this.data.typeIndex] || '全部属性';

    var filtered = this.all.filter(function (s) {
      if (kw && s.name.toLowerCase().indexOf(kw) < 0 && s.no.toLowerCase().indexOf(kw) < 0) return false;
      if (stage !== '全部' && s.stageLabel !== stage) return false;
      if (type !== '全部属性' && (s.types || []).indexOf(type) < 0) return false;
      return true;
    });

    this._filtered = filtered;
    this.setData({
      total: filtered.length,
      list: filtered.slice(0, this.data.pageSize)
    });
  },

  /** 触底加载更多 */
  onReachBottom: function () {
    if (this.data.list.length >= this.data.total) return;
    var that = this;
    setTimeout(function () {
      that.setData({
        list: that._filtered.slice(0, that.data.list.length + that.data.pageSize)
      });
    }, 100);
  },

  /** 点击精灵 → 详情页 */
  onSpiritTap: function (e) {
    var name = e.currentTarget.dataset.name;
    var slug = e.currentTarget.dataset.slug;
    wx.navigateTo({
      url: '/pages/detail/detail?name=' + encodeURIComponent(name) + '&slug=' + (slug || '')
    });
  }
});
