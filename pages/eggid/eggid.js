var EGG_URL = 'https://xjl-955.github.io/roco-data/eggsizes.json';
var EGG_KEY = 'roco_eggsizes_cache_v1';
var TTL = 24 * 60 * 60 * 1000;

Page({
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

  onLoad: function () {
    this.loadEggData();
  },

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

    var matched = this.sizes.filter(function (s) {
      var okH = !hasH || (s.eggHeightMin <= h && h <= s.eggHeightMax);
      var okW = !hasW || (s.eggWeightMin <= w && w <= s.eggWeightMax);
      return okH && okW;
    }).map(function (s) {
      return {
        name: s.name,
        pic: s.pic,
        key: s.name,
        range: hasH && hasW
          ? '蛋高 ' + s.eggHeightMin + '~' + s.eggHeightMax + 'm · 蛋重 ' + s.eggWeightMin + '~' + s.eggWeightMax + 'kg'
          : (hasH ? '蛋高 ' + s.eggHeightMin + '~' + s.eggHeightMax + 'm'
                  : '蛋重 ' + s.eggWeightMin + '~' + s.eggWeightMax + 'kg')
      };
    });

    this.setData({
      error: '',
      result: {
        matched: matched,
        count: matched.length,
        inputText: (hasH ? '身高 ' + h + 'm' : '') + (hasH && hasW ? ' + ' : '') + (hasW ? '体重 ' + w + 'kg' : '')
      }
    });
  }
});
