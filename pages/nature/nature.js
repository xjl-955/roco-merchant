var tools = require('../../utils/tools.js');

Page({
  data: {
    loading: true,
    matrix: [],
    natures: [],
    detail: null
  },

  onLoad: function () {
    var that = this;
    var KEY = 'roco_natures_wiki_v1';
    try {
      var c = wx.getStorageSync(KEY);
      if (c && c.data) { that._applyWiki(c.data); return; }
    } catch (e) { }
    wx.request({
      url: 'https://xjl-955.github.io/roco-data/natures-wiki.json',
      timeout: 15000,
      success: function (res) {
        if (res.statusCode === 200 && res.data && res.data.natures) {
          try { wx.setStorageSync(KEY, { data: res.data, at: Date.now() }); } catch (e) { }
          that._applyWiki(res.data);
        } else that.setData({ loading: false });
      },
      fail: function () { that.setData({ loading: false }); }
    });
  },

  _applyWiki: function (data) {
    var natures = data.natures || [];
    var downCols = ['物攻', '物防', '魔攻', '魔防', '速度', '生命'];
    var upRows = ['物攻', '物防', '魔攻', '魔防', '速度', '生命'];
    var lookup = {};
    natures.forEach(function (n) {
      var up = (n.ups[0] || '').replace('↑ ', '');
      var down = (n.downs[0] || '').replace('↓ ', '');
      lookup[up + '|' + down] = n;
    });

    var matrix = [];
    // 表头行（能力变化 + 下降属性列）
    var headerCells = [{ text: '能力变化', isAxis: true }];
    downCols.forEach(function (d) { headerCells.push({ text: d, isAxis: true }); });
    matrix.push({ isHeader: true, cells: headerCells });
    upRows.forEach(function (u) {
      // 行首格 = "XX↑"（能力变化列）
      var row = { isHeader: false, cells: [{ text: u, isAxis: true, isUp: true }] };
      downCols.forEach(function (d) {
        var n = lookup[u + '|' + d];
        if (n) row.cells.push({ text: n.name, id: n.id, isNA: false });
        else row.cells.push({ text: '—', isNA: true });
      });
      matrix.push(row);
    });

    this.setData({ matrix: matrix, natures: natures, loading: false });
  },

  onCellTap: function (e) {
    var name = e.currentTarget.dataset.name;
    if (!name || name === '—') return;
    var all = this.data.natures;
    for (var i = 0; i < all.length; i++) {
      if (all[i].name === name) {
        this.setData({
          detail: {
            name: all[i].name,
            upText: (all[i].ups[0] || '').replace('↑ ', '') || '—',
            downText: (all[i].downs[0] || '').replace('↓ ', '') || '—',
            tags: all[i].tags || []
          }
        });
        return;
      }
    }
  }
});
