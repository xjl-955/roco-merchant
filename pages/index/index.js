var merchant = require('../../utils/merchant.js');
var api = require('../../utils/api.js');
var live = require('../../utils/live.js');

// 如已在小程序后台申请「一次性订阅消息」模板，把模板 ID 填到这里；
// 用户确认订阅后会顺带请求微信推送授权。留空时仅做小程序内本地提醒。
// 订阅消息模板 ID：mp.weixin.qq.com → 功能 → 订阅消息 → 公共模板库
// 选用"上架提醒"类模板（字段：商品名称/上架时间/备注），把模板 ID 填到下面
// 留空 = 只做小程序内提醒；填了 = 确认订阅时弹授权，到点推送到微信服务通知
var SUBSCRIBE_TMPL_ID = '9_MTzMwOr1LLAOA91VCi-p1oMdeFngRMMkwDW4NEA7k';

var SUB_KEY = 'roco_subscribed_items';

var SOURCE_TEXT = {
  remote: '已同步最新数据',
  cache: '离线缓存数据',
  builtin: '内置数据'
};

Page({
  data: {
    status: {
      phase: 'idle',
      countdownLabel: '',
      countdownText: '',
      subText: '',
      progressText: '',
      nowText: ''
    },
    dayView: {
      dateText: '',
      hasSession: false,
      items: [],
      rounds: [],
      currentCount: 0,
      currentRound: 0,
      totalRounds: 0
    },
    displayItems: [],
    subscribed: {},
    showSubscribe: false,
    subscribeOptions: [],
    itemPool: [],
    meta: merchant.getMeta(),
    sourceText: '内置数据',
    refreshing: false
  },

  onLoad: function () {
    var that = this;
    this._notified = {}; // 今日已提醒过的物品 key
    // 加载全量物品池（远行商人物品档案）
    try {
      var poolCache = wx.getStorageSync('roco_merchant_pool_v2');
      if (poolCache && poolCache.items && poolCache.items.length > 10) {
        that.setData({ itemPool: poolCache.items });
      }
    } catch (e) { }
    wx.request({
      url: 'https://xjl-955.github.io/roco-data/merchant-pool.json',
      timeout: 15000,
      success: function (res) {
        if (res.statusCode === 200 && res.data && res.data.items && res.data.items.length > 10) {
          that.setData({ itemPool: res.data.items });
          try { wx.setStorageSync('roco_merchant_pool_v2', res.data); } catch (e) { }
        }
      },
      fail: function () { }
    });
    this._subArr = [];
    this.loadSubscribed();
    // 先用缓存秒开，再视情况后台拉取
    api.loadCached();
    live.loadCached();
    this.refresh();
    if (api.shouldRefresh()) {
      this.syncRemote(false);
    }
    if (live.isStale()) {
      this.syncLive(false);
    }
  },

  onShow: function () {
    this.loadSubscribed();
    this.refresh();
    // 从后台切回时，若实时数据过期则静默刷新
    if (live.isStale()) {
      this.syncLive(false);
    }
  },

  onHide: function () {
    this.stopTimer();
  },

  /** 空处理：阻止弹窗内点击冒泡 */
  noop: function () {},

  goTab: function (e) {
    var url = e.currentTarget.dataset.url;
    if (url) wx.switchTab({ url: url });
  },

  goNature: function () {
    wx.navigateTo({ url: '/pages/nature/nature' });
  },

  goTypechart: function () {
    wx.navigateTo({ url: '/pages/typechart/typechart' });
  },

  onUnload: function () {
    this.stopTimer();
  },

  /** 下拉刷新：强制拉取远程数据 */
  onPullDownRefresh: function () {
    var that = this;
    var pending = 2;
    var done = function () {
      if (--pending === 0) wx.stopPullDownRefresh();
    };
    this.syncRemote(false, done);
    this.syncLive(true, done);
    // 网络慢时兜底停止
    setTimeout(function () {
      wx.stopPullDownRefresh();
    }, 8000);
  },

  /** 点按钮检查更新 */
  onCheckUpdate: function () {
    if (this.data.refreshing) return;
    this.syncRemote(false);
    this.syncLive(true);
  },

  /** 拉取实时轮次数据（四轮商品明细），失败静默回退 */
  syncLive: function (interactive, done) {
    var that = this;
    live.fetchLive(function (err) {
      that.refresh();
      if (interactive) {
        if (err) {
          wx.showToast({ title: '实时数据不可用，已用档期推算', icon: 'none' });
        }
      }
      if (done) done();
    });
  },

  /**
   * 拉取远程数据并刷新界面
   */
  syncRemote: function (interactive, done) {
    var that = this;
    this.setData({ refreshing: true });
    api.fetchRemote(function (err, result) {
      that.setData({
        refreshing: false,
        meta: merchant.getMeta(),
        sourceText: SOURCE_TEXT[merchant.getSource()] || '内置数据'
      });
      that.refresh();
      if (interactive) {
        if (err) {
          wx.showToast({ title: '更新失败，已用本地数据', icon: 'none' });
        } else if (result && result.updated) {
          wx.showToast({ title: '已更新到 ' + result.updatedAt, icon: 'success' });
        } else {
          wx.showToast({ title: '数据已是最新', icon: 'success' });
        }
      }
      if (done) done();
    });
  },

  /** 读取本地订阅列表 */
  loadSubscribed: function () {
    try {
      var arr = wx.getStorageSync(SUB_KEY) || [];
      if (!Array.isArray(arr)) arr = [];
      this._subArr = arr;
      var map = {};
      for (var i = 0; i < arr.length; i++) map[arr[i]] = true;
      this.setData({ subscribed: map });
    } catch (e) {
      this._subArr = [];
    }
  },

  /** 打开订阅弹窗（物品池 = 全量档案 + 当日轮次合并） */
  onOpenSubscribe: function () {
    var pool = this.data.itemPool || [];
    var dayItems = this.data.dayView.items || [];
    var seen = {};
    var merged = [];
    // 当日实况优先（带真实轮次数据）
    dayItems.forEach(function (it) {
      if (!seen[it.name]) { seen[it.name] = true; merged.push(it); }
    });
    // 物品池补充当日没有的
    pool.forEach(function (it) {
      if (!seen[it.name]) { seen[it.name] = true; merged.push(it); }
    });
    var items = merged;
    if (!items.length) {
      wx.showToast({ title: '当前没有可订阅的物品', icon: 'none' });
      return;
    }
    var sub = this.data.subscribed;
    var opts = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      // 轮次文本：仅当日实况（live.json 的 rounds）
      var rounds = Array.isArray(it.rounds) ? it.rounds : [];
      var w = rounds.length ? '第' + rounds.join('、第') + '轮' : '';
      opts.push({
        name: it.name,
        windowText: w,
        category: it.category || '',
        price: it.price || '',
        checked: true
      });
    }
    this.setData({ showSubscribe: true, subscribeOptions: opts, allChecked: true });
  },

  /** 全选 / 取消全选 */
  onToggleAll: function () {
    var opts = this.data.subscribeOptions;
    var target = !this.data.allChecked;
    for (var i = 0; i < opts.length; i++) {
      var patch = {};
      patch['subscribeOptions[' + i + '].checked'] = target;
      this.setData(patch);
    }
    this.setData({ allChecked: target });
  },

  onToggleOption: function (e) {
    var idx = e.currentTarget.dataset.index;
    var patch = {};
    patch['subscribeOptions[' + idx + '].checked'] = !this.data.subscribeOptions[idx].checked;
    this.setData(patch);
  },

  onCancelSubscribe: function () {
    this.setData({ showSubscribe: false });
  },

  onConfirmSubscribe: function () {
    var opts = this.data.subscribeOptions;
    var arr = [];
    var map = {};
    var detailArr = [];  // 云推送用的完整信息（名称/分类/价格）
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].checked) {
        arr.push(opts[i].name);
        map[opts[i].name] = true;
        detailArr.push({
          name: opts[i].name,
          category: opts[i].category || '',
          price: opts[i].price || ''
        });
      }
    }
    this._subDetailArr = detailArr;
    this._subArr = arr;
    try {
      wx.setStorageSync(SUB_KEY, arr);
    } catch (e) { /* 存储失败不影响使用 */ }
    this.setData({ showSubscribe: false, subscribed: map });

    // 请求微信订阅消息授权（推送到服务通知）
    if (SUBSCRIBE_TMPL_ID && wx.requestSubscribeMessage) {
      wx.requestSubscribeMessage({
        tmplIds: [SUBSCRIBE_TMPL_ID],
        success: function (res) {
          if (res[SUBSCRIBE_TMPL_ID] === 'accept') {
            // 授权成功：记录授权时间（云函数推送时校验配额）
            try {
              wx.setStorageSync('roco_push_auth_' + arr.join('|'), Date.now());
            } catch (e) { }
          }
        },
        fail: function () { /* 用户拒绝或环境不支持，静默 */ }
      });
    }
    wx.showToast({
      title: arr.length ? '已订阅 ' + arr.length + ' 件物品' : '已清空订阅',
      icon: 'none'
    });
  },

  /** 订阅的物品进入在售时段时，小程序内提醒一次 */
  checkReminders: function (dayView) {
    var sub = this.data.subscribed;
    var dateKey = dayView.dateText;
    for (var i = 0; i < dayView.rounds.length; i++) {
      var round = dayView.rounds[i];
      if (round.state !== 'active') continue;
      var items = round.items;
      for (var j = 0; j < items.length; j++) {
        var name = items[j].name;
        var key = dateKey + '|' + name;
        if (sub[name] && !this._notified[key]) {
          this._notified[key] = true;
          wx.showToast({
            title: '🔔 你订阅的「' + name + '」已上架',
            icon: 'none',
            duration: 2500
          });
          try {
            wx.vibrateShort({ type: 'medium' });
          } catch (e) { /* 老基础库可能不支持 */ }
        }
      }
    }
  },

  /** 每秒刷新倒计时 */
  startTimer: function () {
    var that = this;
    this.stopTimer();
    this._timer = setInterval(function () {
      that.refresh();
    }, 1000);
  },

  stopTimer: function () {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  refresh: function () {
    var now = new Date();
    var status = merchant.getStatus(now);
    var dayView = merchant.getDayView(now, status);

    // 展示卡片：营业时间(8点后)显示进行中/下一轮；凌晨不显示商品卡
    var displayItems = [];
    var target = null;
    var i;
    var rounds = dayView.rounds;
    var isBusinessHour = now.getHours() >= 8; // 08:00 前为非营业时间
    if (isBusinessHour) {
      for (i = 0; i < rounds.length; i++) {
        if (rounds[i].state === 'active') { target = rounds[i]; break; }
      }
      if (!target) {
        for (i = 0; i < rounds.length; i++) {
          if (rounds[i].state === 'upcoming') { target = rounds[i]; break; }
        }
      }
    }
    if (target) displayItems = target.items;

    this.checkReminders(dayView);

    this.setData({
      status: status,
      dayView: dayView,
      displayItems: displayItems
    });

    if (!this._timer) {
      this.startTimer();
    }
  }
});
