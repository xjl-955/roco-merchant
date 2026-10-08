var tools = require('../../utils/tools.js');

Page({
  data: {
    loading: true,
    error: false,
    stats: ['生命', '物攻', '物防', '魔攻', '魔防', '速度'],
    selected: { hp: false, atk: false, def: false, satk: false, sdef: false, spd: false },
    wantUp: '',
    wantDown: '',
    results: [],
    detail: null,
    // WIKI 数据
    matrix: [],      // 宫格矩阵
    natures: [],     // 30性格卡片
    viewMode: 'matrix'  // matrix 宫格 | list 推荐列表
  },

  onLoad: function () {
    this.setData({ results: this.buildResults('', '') });
    this._loadWikiNatures();
  },

  _loadWikiNatures: function () {
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
        }
      }
    });
  },

  _applyWiki: function (data) {
    var natures = data.natures || [];
    // 构建宫格：行=上升属性，列=下降属性
    var downCols = ['物攻↓', '物防↓', '魔攻↓', '魔防↓', '速度↓', '生命↓'];
    var upRows = ['物攻↑', '物防↑', '魔攻↑', '魔防↑', '速度↑', '生命↑'];
    // 性格查找表：up+down -> 名字
    var lookup = {};
    natures.forEach(function (n) {
      var up = (n.ups[0] || '').replace('↑ ', '');
      var down = (n.downs[0] || '').replace('↓ ', '');
      lookup[up + '|' + down] = n;
    });
    var upKeys = ['物攻', '物防', '魔攻', '魔防', '速度', '生命'];
    var downKeys = ['物攻', '物防', '魔攻', '魔防', '速度', '生命'];

    var matrix = [];
    // 表头行
    matrix.push({ isHeader: true, cells: downCols.map(function (d) { return { text: d.replace('↓', ''), isAxis: true }; }) });
    // 数据行
    upRows.forEach(function (u) {
      var row = { isHeader: false, label: u.replace('↑', ''), cells: [] };
      row.cells.push({ text: u.replace('↑', ''), isAxis: true });
      downCols.forEach(function (d) {
        var dn = d.replace('↓', '');
        var key = upKeys[upRows.indexOf(u)] + '|' + dn;
        var n = lookup[key];
        if (n) {
          row.cells.push({ text: n.name, id: n.id, isNA: false, tags: n.tags.length, effects: n.ups.concat(n.downs) });
        } else {
          row.cells.push({ text: '—', isNA: true });
        }
      });
      matrix.push(row);
    });

    this.setData({
      matrix: matrix,
      natures: natures,
      loading: false
    });
  },

  /** 点选能力项：第一次点 = 想+，第二次点同一项 = 想-，重置其它 */
  onStatTap: function (e) {
    var stat = e.currentTarget.dataset.stat;
    var sel = this.data.selected;
    var wantUp = this.data.wantUp;
    var wantDown = this.data.wantDown;

    if (wantUp === stat) {
      sel[stat] = false;
      wantUp = '';
      wantDown = stat;
    } else if (wantDown === stat) {
      sel[stat] = false;
      wantDown = '';
    } else if (!wantUp && !wantDown) {
      sel[stat] = true;
      wantUp = stat;
    } else if (wantUp && !wantDown) {
      sel[stat] = true;
      wantDown = stat;
    } else {
      sel = { hp: false, atk: false, def: false, satk: false, sdef: false, spd: false };
      sel[stat] = true;
      wantUp = stat;
      wantDown = '';
    }

    this.setData({ selected: sel, wantUp: wantUp, wantDown: wantDown });
    this.setData({ results: this.buildResults(wantUp, wantDown) });
  },

  onReset: function () {
    this.setData({
      selected: { hp: false, atk: false, def: false, satk: false, sdef: false, spd: false },
      wantUp: '', wantDown: '',
      results: this.buildResults('', ''),
      detail: null
    });
  },

  buildResults: function (up, down) {
    var list = [];
    var all = this.data.natures.length ? this.data.natures : [];
    var statName = { hp: '生命', atk: '物攻', def: '物防', satk: '魔攻', sdef: '魔防', spd: '速度' };
    var upCn = up ? statName[up] : '';
    var downCn = down ? statName[down] : '';
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      var nUp = (n.ups[0] || '').replace('↑ ', '');
      var nDown = (n.downs[0] || '').replace('↓ ', '');
      var match = true;
      var perfect = false;
      if (up && down) {
        if (nUp === upCn && nDown === downCn) { perfect = true; }
        else match = false;
      } else if (up) {
        if (nUp !== upCn) match = false;
      } else if (down) {
        if (nDown !== downCn) match = false;
      }
      if (match && (up || down)) {
        list.push({
          name: n.name,
          upText: nUp || '—',
          downText: nDown || '—',
          perfect: perfect,
          tags: n.tags || []
        });
      }
    }
    list.sort(function (a, b) { return (b.perfect ? 1 : 0) - (a.perfect ? 1 : 0); });
    return list;
  },

  onNatureTap: function (e) {
    var name = e.currentTarget.dataset.name;
    var all = this.data.natures;
    for (var i = 0; i < all.length; i++) {
      if (all[i].name === name) {
        this.setData({
          detail: {
            name: all[i].name,
            upText: (all[i].ups[0] || '').replace('↑ ', '') || '—',
            downText: (all[i].downs[0] || '').replace('↓ ', '') || '—',
            tags: all[i].tags || [],
            neutral: !(all[i].ups || []).length
          }
        });
        return;
      }
    }
  },

  /** 点击宫格性格 → 显示详情 */
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
  },

  onViewMode: function (e) {
    this.setData({ viewMode: e.currentTarget.dataset.mode });
  }
});
