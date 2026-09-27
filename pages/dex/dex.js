var tools = require('../../utils/tools.js');
var wikidex = require('../../utils/wikidex.js');

Page({
  data: {
    loading: true,
    error: false,
    keyword: '',
    // WIKI 分类体系
    typeIcons: [],        // 属性图标（前5）
    moreTypes: [],
    showMoreTypes: false,
    selType: '',          // 选中属性（'' 全部）
    stages: ['阶段', '一阶', '二阶', '三阶', '首领'],
    stageIndex: 0,
    seasons: ['赛季', 'S1', 'S2', 'S3', 'S4'],
    seasonIndex: 0,
    sorts: ['数值排序', '种族值降序', '编号升序'],
    sortIndex: 0,
    shinyOnly: false,
    // 列表
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

      that.setData({
        loading: false,
        count: payload.count,
        typeIcons: typeIcons,
        moreTypes: moreTypes
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
    this.setData({ selType: this.data.selType === t ? '' : t });
    this.applyFilter();
  },

  onToggleMore: function () {
    this.setData({ showMoreTypes: !this.data.showMoreTypes });
  },

  onStageChange: function (e) {
    this.setData({ stageIndex: +e.detail.value });
    this.applyFilter();
  },

  onSeasonChange: function (e) {
    this.setData({ seasonIndex: +e.detail.value });
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
    var season = this.data.seasons[this.data.seasonIndex];
    var selType = this.data.selType;

    var filtered = this.all.filter(function (s) {
      if (kw && s.name.toLowerCase().indexOf(kw) < 0 && (s.no || '').toLowerCase().indexOf(kw) < 0) return false;
      if (that.data.stageIndex > 0) {
        // 阶段筛选：首领单独一类；一/二/三阶按 stage 数字
        if (stage === '首领' && s.stageText !== '首领') return false;
        if (stage === '一阶' && s.stageText !== '一阶') return false;
        if (stage === '二阶' && s.stageText !== '二阶') return false;
        if (stage === '三阶' && s.stageText !== '三阶') return false;
      }
      if (that.data.seasonIndex > 0 && (s.season || 'none') !== season) return false;
      if (selType && (s.types || []).indexOf(selType) < 0) return false;
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
    wx.navigateTo({
      url: '/pages/detail/detail?name=' + encodeURIComponent(name)
    });
  }
});
