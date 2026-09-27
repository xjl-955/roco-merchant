var MAP_URL = 'https://www.onebiji.com/hykb/hykb_tools/luoke/map/1.html?immgj=1';

Page({
  data: {
    url: MAP_URL,
    loadError: false
  },

  onLoad: function () {},

  /** 复制链接，引导到浏览器打开（webview 不渲染时兜底） */
  onCopyLink: function () {
    wx.setClipboardData({
      data: this.data.url,
      success: function () {
        wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' });
      }
    });
  },

  onError: function () {
    this.setData({ loadError: true });
  }
});
