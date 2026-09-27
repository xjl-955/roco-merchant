var tools = require('../../utils/tools.js');

Page({
  data: {
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

  onLoad: function () {
    var that = this;
    tools.loadBreed(function (payload) {
      if (!payload) {
        that.setData({ loading: false, error: true });
        return;
      }
      that.breed = payload;
      var names = ['全部蛋组'];
      for (var k in payload.groupNames) names.push(payload.groupNames[k]);
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
    var list = [];
    if (gi === 0) {
      // 全部：按名字排序取前 N
      var names = Object.keys(this.breed.eggs).sort();
      for (var i = 0; i < names.length && i < 60; i++) {
        list.push({ name: names[i], egg: this.breed.eggs[names[i]] });
      }
    } else {
      var target = groupName;
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
