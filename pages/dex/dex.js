var tools = require('../../utils/tools.js');

Page({
  data: {
    loading: true,
    error: false,
    keyword: '',
    // 属性图标行（参照站：普通/草/火/水/光 + 更多）
    typeIcons: [],
    moreTypes: [],
    showMoreTypes: false,
    selType: '',
    // 第一行筛选：形态 / 蛋组 / 数值排序
    stages: ['形态', '一阶', '二阶', '三阶', '首领'],
    stageIndex: 0,
    eggGroups: ['蛋组', '百变怪', '水1', '水2', '水3', '虫', '陆上', '飞行', '植物', '矿物', '妖精', '未知', '未发现'],
    eggIndex: 0,
    sorts: ['数值排序', '种族值降序', '种族值升序', '编号升序', '编号倒序'],
    sortIndex: 0,
    // 第二行筛选：异色 / 性别 / 赛季
    shinyOnly: false,
    genders: ['性别', '有性别', '无性别'],
    genderIndex: 0,
    seasons: ['赛季', 'S1', 'S2', 'S3', 'S4'],
    seasonIndex: 0,
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
        if (!fromCache) that.setData({ loading: false, error: true });
        return;
      }
      that.all = payload.spirits;
      that.typesMeta = payload.types || {};

      var typeNames = Object.keys(that.typesMeta);
      var icons = typeNames.slice(0, 5).map(function (t) {
        return { name: t, color: that._typeColor(t) };
      });
      var more = typeNames.slice(5).map(function (t) {
        return { name: t, color: that._typeColor(t) };
      });

      that.setData({
        loading: false,
        error: false,
        count: payload.count,
        typeIcons: icons,
        moreTypes: more
      });
      // 预计算每只精灵的属性色点（WXML 内不能用函数）
      that.all = payload.spirits.map(function (s) {
        var colors = {};
        (s.types || []).forEach(function (t) { colors[t] = that._typeColor(t); });
        s._colors = colors;
        return s;
      });
      that.applyFilter();
    });
  },

  _typeColor: function (t) {
    var m = {
      '普通': '#A8A878', '草': '#78C850', '火': '#EE8130', '水': '#6390F0',
      '光': '#F7D02C', '地': '#E2BF65', '冰': '#96D9D6', '龙': '#6F35FC',
      '电': '#F7D02C', '毒': '#A33EA1', '虫': '#A6B91A', '武': '#C22E28',
      '翼': '#A98FF3', '萌': '#F85888', '幽': '#735797', '恶': '#705746',
      '机械': '#B7B7CE', '幻': '#D685AD'
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

  onEggChange: function (e) {
    this.setData({ eggIndex: +e.detail.value });
    this.applyFilter();
  },

  onGenderChange: function (e) {
    this.setData({ genderIndex: +e.detail.value });
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
    if (!this.all || !this.all.length) return;
    var kw = (this.data.keyword || '').trim().toLowerCase();
    var stage = this.data.stages[this.data.stageIndex];
    var egg = this.data.eggGroups[this.data.eggIndex];
    var season = this.data.seasons[this.data.seasonIndex];
    var gender = this.data.genders[this.data.genderIndex];
    var selType = this.data.selType;

    var filtered = this.all.filter(function (s) {
      if (kw && s.name.toLowerCase().indexOf(kw) < 0 && String(s.no || '').toLowerCase().indexOf(kw) < 0) return false;
      if (that.data.stageIndex > 0) {
        var st = s.stageText || '';
        if (stage === '首领' && st.indexOf('首领') < 0) return false;
        if (stage !== '首领' && st !== stage) return false;
      }
      if (that.data.eggIndex > 0 && (s.egg || '') !== egg) return false;
      if (that.data.seasonIndex > 0 && (s.season || 'none') !== season) return false;
      if (selType && (s.types || []).indexOf(selType) < 0) return false;
      if (that.data.shinyOnly && !s.shiny) return false;
      return true;
    });

    var sort = this.data.sortIndex;
    filtered.sort(function (a, b) {
      if (sort === 1) return (b.total || 0) - (a.total || 0);
      if (sort === 2) return (a.total || 0) - (b.total || 0);
      if (sort === 3) return String(a.no).localeCompare(String(b.no)) || (a.id - b.id);
      if (sort === 4) return String(b.no).localeCompare(String(a.no)) || (b.id - a.id);
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
