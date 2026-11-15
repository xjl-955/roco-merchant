var EGG_URL = 'https://xjl-955.github.io/roco-data/eggsizes.json';
var EGG_KEY = 'roco_eggsizes_cache_v1';
var TTL = 24 * 60 * 60 * 1000;

Component({
  data: {
    height: '',
    weight: '',
    error: '',
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
      var h = parseFloat(this.data.height);
      var w = parseFloat(this.data.weight);
      var hasH = !isNaN(h) && h > 0;
      var hasW = !isNaN(w) && w > 0;

      if (!hasH && !hasW) {
        this.setData({ error: '请至少输入蛋身高或蛋体重其中一项', result: null });
        return;
      }
      if (!this.sizes) {
        this.setData({ error: '数据加载中，请稍后再试（首次使用需联网）', result: null });
        this.loadEggData();
        return;
      }

      // ── 打分模型（对齐社区实现 rocom-egg-oracle / Lindaz）：归一化中心距离 ──
      //  ds = |输入 - 区间中心| / 半宽  ∈ [0,1]（区间内）
      //  dw 同理解算体重
      //  distance = sqrt(0.5·ds² + 0.5·dw²)  → 越靠区间中心越可信
      //  weight = 1 - distance ，再归一化成百分比（合计 100%）
      var normDist = function (v, min, max) {
        var center = (min + max) / 2;
        var half = Math.max((max - min) / 2, 1e-6);
        return Math.abs(v - center) / half;
      };
      var raw = this.sizes.filter(function (s) {
        var okH = !hasH || (s.eggHeightMin <= h && h <= s.eggHeightMax);
        var okW = !hasW || (s.eggWeightMin <= w && w <= s.eggWeightMax);
        return okH && okW;
      }).map(function (s) {
        var acc = 0, cnt = 0;
        if (hasH) { var ds = normDist(h, s.eggHeightMin, s.eggHeightMax); acc += ds * ds; cnt++; }
        if (hasW) { var dw = normDist(w, s.eggWeightMin, s.eggWeightMax); acc += dw * dw; cnt++; }
        var distance = Math.sqrt(acc / (cnt || 1));
        return {
          name: s.name,
          pic: s.pic,
          key: s.name,
          distance: distance,
          weight: Math.max(1 - distance, 0.001),
          range: hasH && hasW
            ? '蛋高 ' + s.eggHeightMin + '~' + s.eggHeightMax + 'm · 蛋重 ' + s.eggWeightMin + '~' + s.eggWeightMax + 'kg'
            : (hasH ? '蛋高 ' + s.eggHeightMin + '~' + s.eggHeightMax + 'm'
                    : '蛋重 ' + s.eggWeightMin + '~' + s.eggWeightMax + 'kg')
        };
      });

      // 归一化为百分比（合计 100%）
      var sum = 0;
      for (var i = 0; i < raw.length; i++) sum += raw[i].weight;
      if (!sum) sum = 1;
      var matched = raw.map(function (it) {
        var p = it.weight / sum * 100;
        var txt = p >= 0.01 ? p.toFixed(2) + '%' : (p > 0 ? '<0.01%' : '0%');
        // 匹配等级（按中心距离阈值，来源：rocom-egg-oracle confidence.ts）
        var label = it.distance <= 0.05 ? '极有可能'
          : it.distance <= 0.3 ? '很可能'
          : it.distance <= 0.6 ? '可能'
          : '边缘命中';
        return { name: it.name, pic: it.pic, key: it.key, range: it.range, distance: it.distance, prob: p, probText: txt, label: label };
      });
      // 按中心距离升序（越靠中心越前）
      matched.sort(function (a, b) { return a.distance - b.distance; });

      this.setData({
        error: '',
        result: {
          matched: matched,
          count: matched.length,
          inputText: (hasH ? '身高 ' + h + 'm' : '') + (hasH && hasW ? ' + ' : '') + (hasW ? '体重 ' + w + 'kg' : '')
        }
      });
    }
  }
});
