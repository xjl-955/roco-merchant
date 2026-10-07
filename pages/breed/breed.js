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

  breed: null,   // breeding.json payload

  /** 顶部模式切换 */
  setMode: function (e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onLoad: function () {
    var that = this;
    tools.loadBreed(function (payload) {
      if (!payload) {
        that.setData({ loading: false, error: true });
        return;
      }
      that.breed = payload;
      // 蛋组按 WIKI 官方顺序排列（与孵蛋组别查询页一致），"无法孵蛋"对齐为"未发现"
      var WIKI_ORDER = ['未发现', '动物组', '拟人组', '巨灵组', '魔力组', '天空组', '两栖组', '植物组', '大地组', '妖精组', '昆虫组', '软体组', '机械组', '海洋组', '飞龙组'];
      // 统计各蛋组精灵数（筛选器显示数量，如"妖精组 130"）
      var counts = {};
      Object.keys(payload.eggs).forEach(function (n) {
        (payload.eggs[n].groups || []).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; });
      });
      var names = ['全部蛋组'];
      WIKI_ORDER.forEach(function (n) {
        var orig = n === '未发现' ? '无法孵蛋' : (n === '飞龙组' ? '龙组' : n);
        names.push(n + '  ' + (counts[orig] || 0));
      });
      // 保存 ID 映射（groupNames 的 key 是 breeding 数据里的蛋组 ID）
      var orderIds = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
      var gnMap = payload.groupNames || {};
      that.groupIdByName = {};
      WIKI_ORDER.forEach(function (n, i) {
        var origName = gnMap[orderIds[i]] || n; // 原名（如"无法孵蛋"）
        that.groupIdByName[n] = orderIds[i];
        that.groupIdByName[origName] = orderIds[i];
      });
      that.setData({
        loading: false,
        groupNames: names,
        nests: payload.nests || []
      });
      that.applyFilter();
    });
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
    // 即时搜索：命中则显示个体详情
    var kw = (e.detail.value || '').trim();
    if (!kw) { this.setData({ result: null, resultGroupText: '' }); return; }
    var hit = this.breed.eggs[kw];
    if (hit) {
      this.setData({
        result: hit,
        resultGroupText: (hit.groups || []).join(' / ') || '无法孵蛋'
      });
    } else {
      this.setData({ result: null, resultGroupText: '' });
    }
  },

  onGroupChange: function (e) {
    this.setData({ groupIndex: +e.detail.value });
    this.applyFilter();
  },

  applyFilter: function () {
    if (!this.breed) return;
    var gi = this.data.groupIndex;
    var groupName = this.data.groupNames[gi];
    // 剥离数量后缀（"妖精组  130" → "妖精组"）
    groupName = groupName.replace(/\s+\d+$/, '');
    // 蛋组名→原数据名映射（"未发现"=原"无法孵蛋"，其他同名）
    var nameMap = { '未发现': '无法孵蛋', '飞龙组': '龙组' };
    var origName = nameMap[groupName] || groupName;
    var list = [];
    if (gi === 0) {
      // 全部：按名字排序取前 N
      var names = Object.keys(this.breed.eggs).sort();
      for (var i = 0; i < names.length && i < 60; i++) {
        list.push({ name: names[i], egg: this.breed.eggs[names[i]] });
      }
    } else {
      var target = origName;
      var keys = Object.keys(this.breed.eggs);
      for (var j = 0; j < keys.length; j++) {
        var e = this.breed.eggs[keys[j]];
        if ((e.groups || []).indexOf(target) >= 0) {
          list.push({ name: keys[j], egg: e });
          if (list.length >= 80) break;
        }
      }
    }
    this.setData({ list: list, total: list.length });
  },

  copyNestImage: function (e) {
    var url = e.currentTarget.dataset.img;
    if (!url) return;
    wx.setClipboardData({ data: url });
  }
});
