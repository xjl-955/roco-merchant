var typechart = require('../../utils/typechart.js');

var TYPES = ["普通","草","火","水","光","地","冰","龙","电","毒","虫","武","翼","萌","幽","恶","机械","幻"];
var COLORS = {"普通":"#A8A878","草":"#78C850","火":"#EE8130","水":"#6390F0","光":"#F7D02C","地":"#E2BF65","冰":"#96D9D6","龙":"#6F35FC","电":"#F7D02C","毒":"#A33EA1","虫":"#A6B91A","武":"#C22E28","翼":"#A98FF3","萌":"#F85888","幽":"#735797","恶":"#705746","机械":"#B7B7CE","幻":"#D685AD"};

Page({
  data: {
    types: TYPES.map(function (t) { return { name: t, color: COLORS[t], sel: false }; }),
    subTypes: TYPES.map(function (t) { return { name: t, color: COLORS[t], sel: false }; }),
    mainType: '',      // 主系
    subType: '',       // 副系（''=单系）
    result: null,      // 计算结果
    hasResult: false
  },

  onMainTap: function (e) {
    var t = e.currentTarget.dataset.name;
    // 主系不能与副系重复
    if (t === this.data.subType) return;
    this.setData({
      mainType: this.data.mainType === t ? '' : t,
      subType: this.data.subType === t ? '' : this.data.subType
    });
    this._calc();
  },

  onSubTap: function (e) {
    var t = e.currentTarget.dataset.name;
    if (t === this.data.mainType) return; // 不能与主系重复
    this.setData({ subType: this.data.subType === t ? '' : t });
    this._calc();
  },

  _calc: function () {
    var main = this.data.mainType;
    if (!main) { this.setData({ hasResult: false, result: null }); return; }
    var sub = this.data.subType;
    var defTypes = sub ? [main, sub] : [main];

    // ═══ 防守面：每种攻击系对当前精灵的倍率 ═══
    var defense = { x3: [], x2: [], x05: [], x025: [], x0: [], x1: [] };
    TYPES.forEach(function (atk) {
      var mult = 1;
      defTypes.forEach(function (dt) {
        var c = typechart.TYPE_CHART[atk];
        var v = (c && c[dt] !== undefined) ? c[dt] : 1;
        mult *= v;
      });
      if (mult === 3) defense.x3.push(atk);
      else if (mult === 2) defense.x2.push(atk);
      else if (mult === 0.5) defense.x05.push(atk);
      else if (mult === 0.25) defense.x025.push(atk);
      else if (mult === 0) defense.x0.push(atk);
      else if (mult !== 1) defense.x1.push(atk);
    });

    // ═══ 进攻面：主系（和副系）攻击各系的倍率 ═══
    var atkTypes = sub ? [main, sub] : [main];
    var offense = [];
    TYPES.forEach(function (def) {
      var row = { def: def, color: COLORS[def], values: [] };
      atkTypes.forEach(function (at) {
        var c = typechart.TYPE_CHART[at];
        var v = (c && c[def] !== undefined) ? c[def] : 1;
        row.values.push({ atk: at, mult: v, cls: v === 2 ? 'v-x2' : (v === 0.5 ? 'v-x05' : (v === 0 ? 'v-x0' : 'v-x1')) });
      });
      offense.push(row);
    });

    this.setData({
      hasResult: true,
      result: {
        defTypes: defTypes,
        defense: defense,
        offense: offense
      }
    });
  },

  onReset: function () {
    this.setData({
      mainType: '', subType: '',
      types: this.data.types.map(function (t) { return { name: t.name, color: t.color, sel: false }; }),
      subTypes: this.data.subTypes.map(function (t) { return { name: t.name, color: t.color, sel: false }; }),
      hasResult: false, result: null
    });
  }
});