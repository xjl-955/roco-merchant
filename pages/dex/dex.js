var tools = require('../../utils/tools.js');

Page({
  data: {
    loading: true,
    error: false,
    keyword: '',
    typeIcons: [],        // 前5个属性图标
    moreTypes: [],        // 其余属性
    showMoreTypes: false,
    typeIndex: -1,        // 选中的属性（-1 全部）
    stageIndex: 0,
    stages: ['形态', '一阶', '二阶', '三阶', '首领化'],
    eggGroups: ['蛋组'],
    eggIndex: 0,
    sortIndex: 0,
    sorts: ['数值排序', '种族值降序', '编号升序'],
    shinyOnly: false,
    list: [],
    total: 0,
    count: 0,
    pageSize: 30
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

      var typeNames = Object.keys(that.typesMeta);
      var typeIcons = typeNames.slice(0, 5).map(function (t) {
        return { name: t, color: that._typeColor(t) };
      });
      var moreTypes = typeNames.slice(5).map(function (t) {
        return { name: t, color: that._typeColor(t) };
      });

      var eggSet = {};
      that.all.forEach(function (s) {
        var g = s.egg || '';
        if (g && g !== '未发现') eggSet[g] = 1;
      });
      var eggGroups = ['蛋组'].concat(Object.keys(eggSet).sort());

      that.setData({
        loading: false,
        count: payload.count,
        typeIcons: typeIcons,
        moreTypes: moreTypes,
        eggGroups: eggGroups
      });
      that.applyFilter();
    });
  },

  _typeColor: function (t) {
    var m = {
      '普通': '#9FA7B3', '草': '#5CB85C', '火': '#E8634C', '水': '#4A90D9',
      '光': '#F0C94A', '地': '#C98A3D', '冰': '#6FC7E8', '龙': '#7A5AE0',
      '电': '#F0A24A', '毒': '#A05AC8', '虫': '#9BB534', '武': '#D9534F',
      '翼': '#8FA8D8', '萌': '#F08CB8', '幽': '#6A5A9A', '恶': '#5A5A6A',
      '机械': '#8A9AAA', '幻': '#C87AD9'
    };
    return m[t] || '#9AA7B8';
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },

  onTypeIconTap: function (e) {
    var t = e.currentTarget.dataset.type;
    this.setData({ typeIndex: this.data.typeIndex === t ? -1 : t });
    this.applyFilter();
  },

  onToggleMore: function () {
    this.setData({ showMoreTypes: !this.data.showMoreTypes });
  },

  onStageChange: function (e) {
    this.setData({ stageIndex: +e.detail.value });
    this.applyFilter();
  },

  onEggChange: function (e) {
    this.setData({ eggIndex: +e.detail.value });
    this.applyFilter();
  },

  onSortChange: function (e) {
    this.setData({ sortIndex: +e.detail.value });
    this.applyFilter();
  },

  onShinyToggle: function () {
    this.setData({ shinyOnly: !this.data.shinyOnly });
    this.applyFilter();
  },

  applyFilter: function () {
    var that = this;
    var kw = (this.data.keyword || '').trim().toLowerCase();
    var stage = this.data.stages[this.data.stageIndex];
    var egg = this.data.eggGroups[this.data.eggIndex];
    var selType = this.data.typeIndex;

    var filtered = this.all.filter(function (s) {
      if (kw && s.name.toLowerCase().indexOf(kw) < 0 && (s.no || '').toLowerCase().indexOf(kw) < 0) return false;
      if (that.data.stageIndex > 0 && s.stageLabel !== stage) return false;
      if (that.data.eggIndex > 0 && (s.egg || '') !== egg) return false;
      if (selType >= 0 && (s.types || []).indexOf(selType) < 0) return false;
      if (that.data.shinyOnly && !s.shiny) return false;
      return true;
    });

    var sort = this.data.sortIndex;
    filtered.sort(function (a, b) {
      if (sort === 1) return (b.total || 0) - (a.total || 0);
      if (sort === 2) return (a.no || '') < (b.no || '') ? -1 : 1;
      return 0;
    });

    this._filtered = filtered;
    this.setData({
      total: filtered.length,
      list: filtered.slice(0, this.data.pageSize)
    });
  },

  onReachBottom: function () {
    if (this.data.list.length >= this.data.total) return;
    var that = this;
    setTimeout(function () {
      that.setData({
        list: that._filtered.slice(0, that.data.list.length + that.data.pageSize)
      });
    }, 100);
  },

  onSpiritTap: function (e) {
    var name = e.currentTarget.dataset.name;
    var slug = e.currentTarget.dataset.slug;
    wx.navigateTo({
      url: '/pages/detail/detail?name=' + encodeURIComponent(name) + '&slug=' + (slug || '')
    });
  }
});
