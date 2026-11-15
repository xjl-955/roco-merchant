var eggPredict = require('../../utils/eggpredict.js');

Page({
  data: {
    height: '',
    weight: '',
    error: '',
    identifying: false,
    result: null,
    steps: [
      { n: 1, text: '在游戏中查看精灵蛋的身高和体重。' },
      { n: 2, text: '两个数值都要填（概率计算需要身高 + 体重）。' },
      { n: 3, text: '结果含概率与「随机蛋不出」分组，数据与官方攻略站同步。' }
    ]
  },

  onHeightInput: function (e) { this.setData({ height: e.detail.value }); },
  onWeightInput: function (e) { this.setData({ weight: e.detail.value }); },

  onClear: function () {
    this.setData({ height: '', weight: '', result: null, error: '' });
  },

  onIdentify: function () {
    var that = this;
    var h = parseFloat(this.data.height);
    var w = parseFloat(this.data.weight);
    var hasH = !isNaN(h) && h > 0;
    var hasW = !isNaN(w) && w > 0;

    if (!hasH || !hasW) {
      this.setData({ error: '请同时输入蛋身高和蛋体重（概率计算需要两个数值）', result: null });
      return;
    }
    this.setData({ identifying: true, error: '', result: null });

    // ① 直连攻略站 API → ② 云函数代理 → ③ 报错（不做本地估算）
    eggPredict.predict(h, w, function (result, err) {
      if (result && result.matched && result.matched.length) {
        that.setData({
          identifying: false,
          error: '',
          result: {
            matched: result.matched,
            others: result.others || [],
            count: result.matched.length,
            source: 'direct',
            inputText: '身高 ' + h + 'm + 体重 ' + w + 'kg'
          }
        });
        return;
      }
      that._cloudPredict(h, w, function (ok, errInfo) {
        if (ok) return;
        that.setData({
          identifying: false,
          result: null,
          error: '鉴定服务暂时不可用，请检查网络后重试' + (errInfo || err ? '（' + (errInfo || err) + '）' : '')
        });
      });
    });
  },

  _cloudPredict: function (h, w, done) {
    var that = this;
    if (!wx.cloud || !wx.cloud.callFunction) { done(false, 'no_cloud'); return; }
    var timer = setTimeout(function () { done(false, 'timeout'); }, 20000);
    wx.cloud.callFunction({
      name: 'pushReminder',
      data: { action: 'eggPredict', size: h, weight: w },
      success: function (res) {
        clearTimeout(timer);
        var r = res && res.result;
        if (!r || !r.ok) { done(false, (r && r.reason) || 'bad_response'); return; }
        var d = r.data;
        if (!d || !d.success || !d.pokemons) { done(false, 'no_data'); return; }
        var toNum = function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; };
        var matched = d.pokemons.map(function (p) {
          var prob = toNum(p.prob) * 100;
          return {
            name: (p.name || '') + (p.form_name || ''),
            pic: 'https://wiki.lcx.cab/lk/imgs/' + encodeURIComponent(p.imageName || p.name) + '.webp',
            key: (p.t_id || '') + '_' + (p.name || ''),
            range: '蛋高 ' + p.egg_diameter + 'm · 蛋重 ' + p.egg_weight + 'kg',
            prob: prob,
            probText: prob >= 0.01 ? prob.toFixed(2) + '%' : (prob > 0 ? '<0.01%' : '0%'),
            label: prob >= 70 ? '极有可能' : prob >= 40 ? '很可能' : prob >= 15 ? '可能' : '较低'
          };
        });
        var others = (d.random_egg_not_appear || []).map(function (p) {
          return {
            name: (p.name || '') + (p.form_name || ''),
            pic: 'https://wiki.lcx.cab/lk/imgs/' + encodeURIComponent(p.imageName || p.name) + '.webp',
            range: '蛋高 ' + p.egg_diameter + 'm · 蛋重 ' + p.egg_weight + 'kg'
          };
        });
        that.setData({
          identifying: false,
          error: '',
          result: {
            matched: matched,
            others: others,
            count: matched.length,
            source: 'cloud',
            inputText: '身高 ' + h + 'm + 体重 ' + w + 'kg'
          }
        });
        done(true);
      },
      fail: function () { clearTimeout(timer); done(false, 'callfail'); }
    });
  }
});
