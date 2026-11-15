var EGG_URL = 'https://xjl-955.github.io/roco-data/eggsizes.json';
var EGG_KEY = 'roco_eggsizes_cache_v1';
var TTL = 24 * 60 * 60 * 1000;
var eggPredict = require('../../utils/eggpredict.js');

Component({
  data: {
    height: '',
    weight: '',
    error: '',
    identifying: false,
    result: null,
    steps: [
      { n: 1, text: '在游戏中查看精灵蛋的身高和体重。' },
      { n: 2, text: '输入其中一个数值，或同时输入两个数值获得更准结果。' },
      { n: 3, text: '打开匹配到的精灵页面，或提交缺失/错误的蛋体型数据。' }
    ]
  },

  lifetimes: {
    attached: function () {
      this.loadEggData();
    }
  },

  methods: {
    loadEggData: function () {
      var that = this;
      try {
        var c = wx.getStorageSync(EGG_KEY);
        if (c && c.sizes && Date.now() - c.at < TTL) {
          this.sizes = c.sizes;
          return;
        }
      } catch (e) { /* 忽略 */ }
      wx.request({
        url: EGG_URL,
        timeout: 10000,
        success: function (res) {
          if (res.statusCode === 200 && res.data && res.data.sizes) {
            that.sizes = res.data.sizes;
            try { wx.setStorageSync(EGG_KEY, { sizes: res.data.sizes, at: Date.now() }); } catch (e) { }
          }
        },
        fail: function () { /* 静默，鉴定时再提示 */ }
      });
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
      // 三级链路：① 直连离愁轩 API（最快、同源数值）→ ② 云函数代理 → ③ 本地算法
      var that2 = this;
      eggPredict.predict(h, w, function (result, err) {
        if (result && result.matched && result.matched.length) {
          that2.setData({
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
        that2._cloudPredict(h, w, function (ok, errInfo) {
          if (ok) return;
          that2._localPredict(h, w, errInfo || err);
        });
      });
    },

    /** 云端鉴定：云函数代理请求，返回官方概率 + 随机蛋不出分组 */
    _cloudPredict: function (h, w, done) {
      var that = this;
      if (!wx.cloud || !wx.cloud.callFunction) { done(false, 'no_cloud'); return; }
      this._cloudErr = '';
      var timer = setTimeout(function () { that._cloudErr = 'timeout'; done(false, 'timeout'); }, 20000);
      wx.cloud.callFunction({
        name: 'pushReminder',
        data: { action: 'eggPredict', size: h, weight: w },
        success: function (res) {
          clearTimeout(timer);
          var r = res && res.result;
          if (!r) { that._cloudErr = 'empty_result'; done(false, 'empty_result'); return; }
          if (!r.ok) {
            that._cloudErr = (r.reason || 'unknown') + (r.stage ? '@' + r.stage : '') + (r.message ? ':' + r.message : '') + (r.detail ? '|' + r.detail : '');
            done(false, that._cloudErr);
            return;
          }
          var d = r.data;
          if (!d || !d.success || !d.pokemons) { that._cloudErr = 'no_data'; done(false, 'no_data'); return; }
          var toNum = function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; };
          var matched = d.pokemons.map(function (p) {
            var prob = toNum(p.prob) * 100;
            return {
              name: p.name + (p.form_name || ''),
              pic: 'https://wiki.lcx.cab/lk/imgs/' + encodeURIComponent(p.imageName || p.name) + '.webp',
              key: (p.t_id || '') + '_' + (p.name || ''),
              range: '蛋高 ' + p.egg_diameter + 'm · 蛋重 ' + p.egg_weight + 'kg',
              prob: prob,
              probText: prob >= 0.01 ? prob.toFixed(2) + '%' : (prob > 0 ? '<0.01%' : '0%'),
              label: prob >= 70 ? '极有可能' : prob >= 40 ? '很可能' : prob >= 15 ? '可能' : '较低',
              attrs: p.attributes || ''
            };
          });
          var others = (d.random_egg_not_appear || []).map(function (p) {
            return {
              name: p.name + (p.form_name || ''),
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
        fail: function (e) {
          clearTimeout(timer);
          that._cloudErr = 'callfail:' + (e && e.errMsg ? e.errMsg : 'unknown');
          done(false, that._cloudErr);
        }
      });
    },

    /** 本地兜底：归一化中心距离模型 */
    _localPredict: function (h, w, errInfo) {
      if (!this.sizes) {
        this.setData({ identifying: false, error: '数据加载中，请稍后再试（首次使用需联网）', result: null });
        this.loadEggData();
        return;
      }
      var normDist = function (v, min, max) {
        var center = (min + max) / 2;
        var half = Math.max((max - min) / 2, 1e-6);
        return Math.abs(v - center) / half;
      };
      var raw = this.sizes.filter(function (s) {
        return (s.eggHeightMin <= h && h <= s.eggHeightMax) && (s.eggWeightMin <= w && w <= s.eggWeightMax);
      }).map(function (s) {
        var ds = normDist(h, s.eggHeightMin, s.eggHeightMax);
        var dw = normDist(w, s.eggWeightMin, s.eggWeightMax);
        var distance = Math.sqrt((ds * ds + dw * dw) / 2);
        return {
          name: s.name, pic: s.pic, key: s.name, distance: distance,
          weight: Math.max(1 - distance, 0.001),
          range: '蛋高 ' + s.eggHeightMin + '~' + s.eggHeightMax + 'm · 蛋重 ' + s.eggWeightMin + '~' + s.eggWeightMax + 'kg'
        };
      });
      var sum = 0;
      for (var i = 0; i < raw.length; i++) sum += raw[i].weight;
      if (!sum) sum = 1;
      var matched = raw.map(function (it) {
        var p = it.weight / sum * 100;
        return {
          name: it.name, pic: it.pic, key: it.key, range: it.range, distance: it.distance, prob: p,
          probText: p >= 0.01 ? p.toFixed(2) + '%' : (p > 0 ? '<0.01%' : '0%'),
          label: it.distance <= 0.05 ? '极有可能' : it.distance <= 0.3 ? '很可能' : it.distance <= 0.6 ? '可能' : '边缘命中'
        };
      });
      matched.sort(function (a, b) { return a.distance - b.distance; });
      this.setData({
        identifying: false,
        error: errInfo ? ('云端鉴定不可用（' + errInfo + '），已用本地算法') : '',
        result: {
          matched: matched, others: [], count: matched.length, source: 'local',
          inputText: '身高 ' + h + 'm + 体重 ' + w + 'kg'
        }
      });
    }
  }
});
