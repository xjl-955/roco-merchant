var natures = require('../../utils/natures.js');

Page({
  data: {
    stats: ['生命', '物攻', '物防', '魔攻', '魔防', '速度'],
    selected: { hp: false, atk: false, def: false, satk: false, sdef: false, spd: false },
    wantUp: '',
    wantDown: '',
    results: [],   // 推荐性格
    detail: null   // 点选查看的性格详情
  },

  onLoad: function () {
    this.setData({ results: this.buildResults('', '') });
  },

  /** 点选能力项：第一次点 = 想+，第二次点同一项 = 想-，重置其它 */
  onStatTap: function (e) {
    var stat = e.currentTarget.dataset.stat;
    var sel = this.data.selected;
    var wantUp = this.data.wantUp;
    var wantDown = this.data.wantDown;

    if (wantUp === stat) {
      // 再点一次 → 改为想减
      sel[stat] = false;
      wantUp = '';
      wantDown = stat;
    } else if (wantDown === stat) {
      // 第三次点 → 取消
      sel[stat] = false;
      wantDown = '';
    } else if (!wantUp && !wantDown) {
      sel[stat] = true;
      wantUp = stat;
    } else if (wantUp && !wantDown) {
      sel[stat] = true;
      wantDown = stat;
    } else {
      // 已有一对 → 重新开始
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
    var all = natures.NATURES;
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      var match = true;
      var score = 0;
      if (up) {
        if (n.up === up) score += 1;
        else if (n.down === up) match = false;
      }
      if (down) {
        if (n.down === down) score += 1;
        else if (n.up === down) match = false;
      }
      if (match && (up || down)) {
        list.push({
          name: n.name,
          upText: n.up ? natures.STAT_NAMES[n.up] : '—',
          downText: n.down ? natures.STAT_NAMES[n.down] : '—',
          perfect: (up && down) ? (n.up === up && n.down === down) : false
        });
      }
    }
    // 完美匹配排前
    list.sort(function (a, b) { return (b.perfect ? 1 : 0) - (a.perfect ? 1 : 0); });
    return list;
  },

  onNatureTap: function (e) {
    var name = e.currentTarget.dataset.name;
    var d = natures.getNature(name);
    if (d) this.setData({ detail: d });
  }
});
