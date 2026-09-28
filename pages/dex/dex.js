var tools = require('../../utils/tools.js');

Page({
  data: {
    loading: true,
    error: false,
    keyword: '',
    // 属性图标行（参照站 16 项：普通/草/火/水/光/地/冰/龙/电/毒/虫/武/翼/萌/幽/机械/幻/首领）
    typeIcons: [],
    moreTypes: [],
    showMoreTypes: false,
    selType: '',
    // 第一行筛选：形态 / 蛋组 / 数值排序（选项与顺序同参照站）
    stages: ['形态', '全部', '不可进化', '一阶', '二阶', '三阶', '可转首领', '首领', '可抓异色', '地区'],
    stageIndex: 0,
    eggGroups: ['蛋组', '巨灵组', '两栖组', '昆虫组', '天空组', '动物组', '妖精组', '植物组', '拟人组', '软体组', '大地组', '魔力组', '海洋组', '龙组', '机械组', '未发现'],
    eggIndex: 0,
    sorts: ['数值排序', '种族值', '魔攻', '魔防', '物攻', '物防', '生命', '速度'],
    sortIndex: 0,
    // 第二行筛选：异色 / 性别 / 赛季（选项与顺序同参照站）
    shinyOnly: false,
    shinyPickIndex: 0,
    shinyOptions: ['异色', '全部', 'S1赛季异色', 'S2赛季异色', 'S3赛季异色', 'S4赛季异色'],
    genders: ['性别', '雌雄皆有', '仅有雄性', '仅有雌性'],
    genderIndex: 0,
    seasons: ['赛季', '全部', '暗夜拾光', '狂欢怪谈', '铅字幻梦', '月涌狂想'],
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
      // 预计算每只精灵的属性色点（WXML 内不能用函数）+ 编号去 NO. 前缀
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

  onShinyPick: function (e) {
    var idx = +e.detail.value;
    this.setData({ shinyPickIndex: idx, shinyOnly: idx >= 2 });
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
    var shinyOpt = this.data.shinyOptions[this.data.shinyPickIndex];
    var selType = this.data.selType;

    var filtered = this.all.filter(function (s) {
      if (kw && s.name.toLowerCase().indexOf(kw) < 0 && String(s.no || '').replace(/^NO\.?/, '').toLowerCase().indexOf(kw) < 0) return false;
      // 形态
      if (that.data.stageIndex > 0) {
        var st = s.stageText || '';
        if (stage === '全部') { /* 全部形态 */ }
        else if (stage === '不可进化') { if (s.canEvolve === true || (s.family && s.familyCount > 1)) return false; }
        else if (stage === '一阶' && st !== '一阶') return false;
        else if (stage === '二阶' && st !== '二阶') return false;
        else if (stage === '三阶' && st !== '三阶') return false;
        else if (stage === '可转首领' && !(s.form || '').match(/lord/)) return false;
        else if (stage === '首领' && st.indexOf('首领') < 0) return false;
        else if (stage === '可抓异色' && !s.shiny) return false;
        else if (stage === '地区' && !(s.form || '').match(/regional/)) return false;
      }
      // 蛋组（双蛋组拆分匹配）
      if (that.data.eggIndex > 0) {
        var eggs = String(s.egg || '').split(',').map(function (g) { return g.trim(); });
        if (eggs.indexOf(egg) < 0) return false;
      }
      // 赛季（seasonName 映射）
      if (that.data.seasonIndex > 0) {
        var seasonMap = { '暗夜拾光': 'S1', '狂欢怪谈': 'S2', '铅字幻梦': 'S3', '月涌狂想': 'S4' };
        var targetSeason = seasonMap[season];
        if ((s.season || 'none') !== targetSeason) return false;
      }
      // 属性
      if (selType && (s.types || []).indexOf(selType) < 0) return false;
      // 异色（含赛季异色）
      if (shinyOpt === '只看异色' || shinyOpt === '全部' && false) {
        if (!s.shiny) return false;
      } else if (shinyOpt.indexOf('赛季异色') >= 0) {
        var sm2 = { 'S1赛季异色': ['S1', true], 'S2赛季异色': ['S2', true], 'S3赛季异色': ['S3', true], 'S4赛季异色': ['S4', true] };
        var rule = sm2[shinyOpt];
        if (!s.shiny || (s.season || 'none') !== rule[0]) return false;
      }
      // 性别（WIKI 无数据 → 筛选时跳过，选项保留占位）
      return true;
    });

    // 数值排序（种族值/魔攻/魔防/物攻/物防/生命/速度）
    var sort = this.data.sortIndex;
    var statKeys = [null, 'total', 'MATK', 'MDEF', 'ATK', 'DEF', 'HP', 'SPD'];
    if (sort > 0) {
      var key = statKeys[sort];
      filtered.sort(function (a, b) {
        var va = key === 'total' ? (a.total || 0) : ((a.stats || {})[key] || 0);
        var vb = key === 'total' ? (b.total || 0) : ((b.stats || {})[key] || 0);
        return vb - va || (a.id - b.id);
      });
    }

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
