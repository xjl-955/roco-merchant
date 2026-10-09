App({
  onLaunch: function () {
    // 初始化云开发（物品上架推送服务通知用）
    // env 请替换为你自己的环境 ID：云开发控制台 → 设置 → 环境设置
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1',
        traceUser: true
      });
    }
  }
});
