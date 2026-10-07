var tools = require('../../utils/tools.js');

Page({
  data: {
    mode: 'groups', // 'groups' 蛋组查询 | 'identify' 孵蛋鉴定
    loading: true,
    error: false,
    keyword: '',
    groupNames: [],
    groupIndex: 0,
    nests: [],
    result: null,   // 搜索命中的精灵
    resultGroupText: '',
    list: [],       // 按蛋组展示的精灵
    total: 0
  },

  breed: null,   // breeding.json payload（孵蛋鉴定用）
  dex: null,     // spirits.json（625全量，蛋组查询数据源）
  dexByName: {}, // 名字索引

  /** 顶部模式切换 */
  setMode: function (e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onLoad: function () {
    var that = this;
    // 蛋组查询数据源：spirits.json（625全量，WIKI 官方分类）
    tools.loadDex(function (dex) {
      if (!dex) {
        // 兜底：仍用 breeding（只有460只）
        that.loadBreedData(true);
        return;
      }
      that.dex = dex;
      that.dexByName = {};
      dex.spirits.forEach(function (s) {
        s.no = String(s.no || '').replace(/^NO\.?/, '');
        that.dexByName[s.name] = s;
      });
      that.buildGroups();
      that.loadBreedData(false);
    });
  },

  loadBreedData: function (fallback) {
    var that = this;
    tools.loadBreed(function (payload) {
      if (!payload && fallback) {
        that.setData({ loading: false, error: true });
        return;
      }
      that.breed = payload; // 孵蛋鉴定数据（可能为 null）
      if (!that.dex) {
        that.setData({ loading: false, error: true });
        return;
      }
      that.buildGroups();
      that.setData({ loading: false, nests: payload ? (payload.nests || []) : [] });
      that.applyFilter();
    });
  },

  /** 构建 WIKI 官方顺序的蛋组列表（含数量） */
  buildGroups: function () {
    // 蛋组名映射：data.php 旧名 → WIKI 官方名
    var NAME_MAP = { '岩石组': '大地组', '巨龙组': '飞龙组', '无法孵蛋': '未发现' };
    var WIKI_ORDER = ['未发现', '动物组', '拟人组', '巨灵组', '魔力组', '天空组', '两栖组', '植物组', '大地组', '妖精组', '昆虫组', '软体组', '机械组', '海洋组', '飞龙组'];

    // 归一化每只精灵的蛋组（映射旧名 + 空值归类未发现）
    this.all = (this.dex.spirits || []).map(function (s) {
      var groups = String(s.egg || '').split(',').map(function (g) {
        g = g.trim();
        return NAME_MAP[g] || g;
      }).filter(function (g) { return g && g !== '未发现'; });
      if (!groups.length) groups = ['未发现'];
      return {
        name: s.name,
        no: String(s.no || '').replace(/^NO\.?/, ''),
        image: s.wikiImage || s.image,
        groups: groups,
        attrs: (s.types || []).join('、'),
        stageText: s.stageText || ''
      };
    });

    // 统计数量
    var counts = {};
    this.all.forEach(function (s) {
      s.groups.forEach(function (g) { counts[g] = (counts[g] || 0) + 1; });
    });

    // 生成筛选器（WIKI 顺序 + 数量）
    var names = ['全部蛋组'];
    WIKI_ORDER.forEach(function (n) {
      names.push(n + '  ' + (counts[n] || 0));
    });
    this.groupNames = WIKI_ORDER;
    this.setData({ groupNames: names });
  },

  /** 顶部模式切换 */
  setMode: function (e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
    // 即时搜索：命中则显示个体详情
    var kw = (e.detail.value || '').trim();
    if (!kw) { this.setData({ result: null, resultGroupText: '' }); return; }
    var hit = this.dexByName[kw] || (this.dexByName[kw + '(本来的样子)'] || null);
    if (hit) {
      this.setData({
        result: { groups: hit.groups, attrs: hit.attrs, size: '', weight: '' },
        resultGroupText: (hit.groups || []).join(' / ') || '未发现'
      });
    } else if (this.breed && this.breed.eggs && this.breed.eggs[kw]) {
      var b = this.breed.eggs[kw];
      this.setData({ result: b, resultGroupText: (b.groups || []).join(' / ') });
    } else {
      this.setData({ result: null, resultGroupText: '' });
    }
  },

  onGroupChange: function (e) {
    this.setData({ groupIndex: +e.detail.value });
    this.applyFilter();
  },

  applyFilter: function () {
    var gi = this.data.groupIndex;
    var groupName = this.data.groupNames[gi];
    groupName = groupName.replace(/\s+\d+$/, ''); // 剥离数量后缀
    var list = [];
    var all = this.all || [];
    if (gi === 0) {
      // 全部蛋组 = 625 只全量
      list = all.slice();
    } else {
      all.forEach(function (s) {
        if (s.groups.indexOf(groupName) >= 0) list.push(s);
      });
    }
    // 按 WIKI 卡序（编号+形态）
    list.sort(function (a, b) {
      return String(a.no).localeCompare(String(b.no)) || a.name.localeCompare(b.name);
    });
    this.setData({ list: list, total: list.length });
  },

  copyNestImage: function (e) {
    var url = e.currentTarget.dataset.img;
    if (!url) return;
    wx.setClipboardData({ data: url });
  }
});
