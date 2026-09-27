var natures = require('../../utils/natures.js');

Page({
  data: {
    grids: [
      { icon: '⚖️', name: '属性克制', url: '/pages/typechart/typechart', badge: '' },
      { icon: '🎭', name: '性格修正', url: '/pages/nature/nature', badge: '' },
      { icon: '📖', name: '精灵图鉴', url: '/pages/dex/dex', badge: '' },
      { icon: '🥚', name: '孵蛋工具', url: '/pages/breed/breed', badge: '' },
      { icon: '🗺️', name: '地图资源', url: '/pages/map/map', badge: '外链' },
      { icon: '商人', name: '远行商人', url: '/pages/index/index', badge: '', tab: true }
    ]
  },

  onLoad: function () {
    // 图标已在 app.json 配置，这里仅保留数据便于后续扩展
    this.setData({ natureCount: natures.NATURES.length });
  },

  onGridTap: function (e) {
    var item = e.currentTarget.dataset.item;
    if (!item || !item.url) return;
    if (item.tab) {
      wx.switchTab({ url: item.url });
    } else {
      wx.navigateTo({ url: item.url });
    }
  }
});
