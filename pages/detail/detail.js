var tools = require('../../utils/tools.js');

var TYPE_COLOR = {
  '普通': '#9FA7B3', '草': '#5CB85C', '火': '#E8634C', '水': '#4A90D9',
  '光': '#F0C94A', '地': '#C98A3D', '冰': '#6FC7E8', '龙': '#7A5AE0',
  '电': '#F0A24A', '毒': '#A05AC8', '虫': '#9BB534', '武': '#D9534F',
  '翼': '#8FA8D8', '萌': '#F08CB8', '幽': '#6A5A9A', '恶': '#5A5A6A',
  '机械': '#8A9AAA', '幻': '#C87AD9'
};

Page({
  data: {
    loading: true,
    spirit: null,
    family: [],       // 进化链（同 family 按阶段排序）
    typeColor: TYPE_COLOR,
    notFound: false
  },

  onLoad: function (options) {
    var name = decodeURIComponent(options.name || '');
    var slug = options.slug || '';
    if (!name && !slug) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    var that = this;
    tools.loadDex(function (payload) {
      if (!payload) {
        that.setData({ loading: false, notFound: true });
        return;
      }
      // 定位精灵：slug 优先，名字兜底
      var spirit = null;
      for (var i = 0; i < payload.spirits.length; i++) {
        var s = payload.spirits[i];
        if ((slug && s.slug === slug) || (!slug && s.name === name)) { spirit = s; break; }
      }
      if (!spirit) {
        that.setData({ loading: false, notFound: true });
        return;
      }
      // 进化家族：同 family 的全部形态，按 no+stage 排序
      var family = [];
      if (spirit.family) {
        payload.spirits.forEach(function (s) {
          if (s.family === spirit.family) family.push(s);
        });
        var stageOrder = { '1': 1, '2': 2, '3': 3, '4': 4 };
        family.sort(function (a, b) {
          return (stageOrder[a.stage] || 9) - (stageOrder[b.stage] || 9) ||
                 (a.name < b.name ? -1 : 1);
        });
      }
      wx.setNavigationBarTitle({ title: spirit.name });
      that.setData({
        loading: false,
        spirit: spirit,
        family: family
      });
    });
  },

  /** 点击家族成员跳转 */
  onFamilyTap: function (e) {
    var name = e.currentTarget.dataset.name;
    var slug = e.currentTarget.dataset.slug;
    wx.redirectTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) + '&slug=' + slug });
  },

  /** 复制属性文本 */
  onCopyType: function (e) {
    var t = e.currentTarget.dataset.type;
    if (t) wx.setClipboardData({ data: t });
  }
});
