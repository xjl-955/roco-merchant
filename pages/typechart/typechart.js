var typechart = require('../../utils/typechart.js');

Page({
  data: {
    types: [],
    colors: {},
    mode: 'defense', // defense: 选防守系看弱点；attack: 选攻击系看打击面
    defSel: [],      // 防守已选（最多2）
    atkSel: '',
    result: null
  },

  onLoad: function () {
    this.setData({
      types: typechart.TYPES,
      colors: typechart.COLOR_MAP
    });
  },

  setMode: function (e) {
    var mode = e.currentTarget.dataset.mode;
    this.setData({
      mode: mode,
      defSel: [],
      atkSel: '',
      result: null
    });
  },

  onTypeTap: function (e) {
    var t = e.currentTarget.dataset.type;
    if (this.data.mode === 'defense') {
      var sel = this.data.defSel.slice();
      var idx = sel.indexOf(t);
      if (idx >= 0) {
        sel.splice(idx, 1);
      } else {
        if (sel.length >= 2) sel.shift();
        sel.push(t);
      }
      this.setData({ defSel: sel });
      if (sel.length > 0) {
        this.setData({ result: typechart.defenseProfile(sel) });
      } else {
        this.setData({ result: null });
      }
    } else {
      this.setData({ atkSel: t });
      // 攻击视角：展示对该系的倍率分组
      var groups = { x4: [], x2: [], x1: [], x05: [], x0: [] };
      var types = typechart.TYPES;
      for (var i = 0; i < types.length; i++) {
        var def = types[i];
        var m = typechart.attackMultiplier(t, [def]);
        if (m === 0) groups.x0.push(def);
        else if (m === 0.5) groups.x05.push(def);
        else if (m === 2) groups.x2.push(def);
        else if (m === 1) groups.x1.push(def);
      }
      this.setData({ result: groups });
    }
  }
});
