var tools = require('../../utils/tools.js');

Page({
  data: {
    loading: true,
    error: false,
    keyword: '',
    // 属性图标行（普通/草/火/水/光 + 更多）
    typeIcons: [],
    moreTypes: [],
    showMoreTypes: false,
    selType: '',
    // 形态筛选：一阶/二阶/三阶/首领
    stages: ['形态', '一阶', '二阶', '三阶', '首领'],
    stageIndex: 0,
    // 异色筛选：有异色 / 无异色
    shinyOptions: ['异色', '有异色', '无异色'],
    shinyPickIndex: 0,
    // 赛季筛选（不含"全部"）
    seasons: ['赛季', '暗夜拾光', '狂欢怪谈', '铅字幻梦', '月涌狂想'],
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
      // 预计算属性色点 + 编号去 NO. 前缀
      that.all = payload.spirits.map(function (s) {
        var colors = {};
        (s.types || []).forEach(function (t) { colors[t] = that._typeColor(t); });
        s._colors = colors;
        s.no = String(s.no || '').replace(/^NO\.?/, '');
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

  onShinyPick: function (e) {
    this.setData({ shinyPickIndex: +e.detail.value });
    this.applyFilter();
  },

  onSeasonChange: function (e) {
    this.setData({ seasonIndex: +e.detail.value });
    this.applyFilter();
  },

  applyFilter: function () {
    var that = this;
    if (!this.all || !this.all.length) return;
    var kw = (this.data.keyword || '').trim().toLowerCase();
    var stage = this.data.stages[this.data.stageIndex];
    var season = this.data.seasons[this.data.seasonIndex];
    var shinyOpt = this.data.shinyOptions[this.data.shinyPickIndex];
    var selType = this.data.selType;

    var filtered = this.all.filter(function (s) {
      if (kw && s.name.toLowerCase().indexOf(kw) < 0 && String(s.no || '').toLowerCase().indexOf(kw) < 0) return false;
      // 形态
      if (that.data.stageIndex > 0) {
        var st = s.stageText || '';
        if (stage === '一阶' && st !== '一阶') return false;
        if (stage === '二阶' && st !== '二阶') return false;
        if (stage === '三阶' && st !== '三阶') return false;
        if (stage === '首领' && st.indexOf('首领') < 0) return false;
      }
      // 赛季（名称映射 S1-S4）
      if (that.data.seasonIndex > 0) {
        var seasonMap = { '暗夜拾光': 'S1', '狂欢怪谈': 'S2', '铅字幻梦': 'S3', '月涌狂想': 'S4' };
        if ((s.season || 'none') !== seasonMap[season]) return false;
      }
      // 属性
      if (selType && (s.types || []).indexOf(selType) < 0) return false;
      // 异色：有异色 / 无异色
      if (shinyOpt === '有异色' && !s.shiny) return false;
      if (shinyOpt === '无异色' && s.shiny) return false;
      return true;
    });

    // 默认排序：按编号升序
    filtered.sort(function (a, b) {
      return String(a.no).localeCompare(String(b.no)) || (a.id - b.id);
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
