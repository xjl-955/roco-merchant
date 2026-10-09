// 修复 app.js：env 缺省（小程序端用默认环境，不需要指定别名）
App({
  onLaunch: function () {
    // 初始化云开发（物品上架推送服务通知用）
    // 不指定 env 时使用【默认环境】——你的账号只有一个环境 cloud1，会自动选中
    if (wx.cloud) {
      wx.cloud.init({
        traceUser: true
      });
    }
  }
});
