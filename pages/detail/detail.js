var tools = require('../../utils/tools.js');
var typechart = require('../../utils/typechart.js');

var TYPE_COLOR = {
  '普通': '#A8A878', '草': '#78C850', '火': '#EE8130', '水': '#6390F0',
  '光': '#F7D02C', '地': '#E2BF65', '冰': '#96D9D6', '龙': '#6F35FC',
  '电': '#F7D02C', '毒': '#A33EA1', '虫': '#A6B91A', '武': '#C22E28',
  '翼': '#A98FF3', '萌': '#F85888', '幽': '#735797', '恶': '#705746',
  '机械': '#B7B7CE', '幻': '#D685AD'
};

var STAT_LABEL = {
  HP: '生命', ATK: '物攻', MATK: '魔攻',
  DEF: '物防', MDEF: '魔防', SPD: '速度'
};

var STAT_COLOR = {
  HP: '#86EFAC', ATK: '#FDBA74', MATK: '#C4B5FD',
  DEF: '#FCD34D', MDEF: '#7DD3FC', SPD: '#F9A8D4'
};

var SKILL_SRC = [
  { key: 'level', label: '精灵技能' },
  { key: 'blood', label: '血脉技能' },
  { key: 'machine', label: '可学技能石' }
];

var EXTRA_URL = 'https://xjl-955.github.io/roco-data/spirits-extra.json';

Page({
  data: {
    loading: true,
    notFound: false,
    name: '',
    spirit: null,
    typeColor: TYPE_COLOR,
    // 种族值
    statBars: [],
    total: 0,
    // 补充信息（参照站抓取）
    extra: null,
    // WIKI 详情（原版搬运）
    wikiDesc: '',
    wikiKind: '',
    natures: [],
    talents: [],
    quests: [],
    eggGroup: '',
    detailBody: {},
    detailTotal: 0,
    // 克制
    atkGroups: null,
    defGroups: null,
    tab: 0,   // 克制 tab: 0 进攻 1 防守
    // 技能
    skillSrc: 0,
    skillSrcList: SKILL_SRC,
    skillTypes: [],
    skillFilter: '全部',
    skills: [],
    skillTotal: 0,
    // 家族
    family: []
  },

  onLoad: function (options) {
    var name = decodeURIComponent(options.name || '');
    if (!name) { this.setData({ loading: false, notFound: true }); return; }
    var that = this;
    this.setData({ name: name });

    tools.loadDex(function (payload) {
      if (!payload) { that.setData({ loading: false, notFound: true }); return; }
      var spirit = null;
      for (var i = 0; i < payload.spirits.length; i++) {
        if (payload.spirits[i].name === name) { spirit = payload.spirits[i]; break; }
      }
      if (!spirit) { that.setData({ loading: false, notFound: true }); return; }
      that.spirit = spirit;
      wx.setNavigationBarTitle({ title: spirit.name });

      // 进化家族（同编号家族：NO.001 的所有形态）
      var family = [];
      var noKey = String(spirit.no || '').replace(/^NO\.?/, '');
      if (noKey) {
        payload.spirits.forEach(function (s) {
          if (String(s.no || '').replace(/^NO\.?/, '') === noKey) {
            family.push({ name: s.name, image: s.wikiImage || s.image });
          }
        });
      }
      that.setData({
        loading: false,
        spirit: spirit,
        family: family,
        statBars: that._statBars(spirit),
        total: spirit.total || 0
      });

      // 克制
      var mainType = (spirit.types || [])[0];
      if (mainType && typechart.TYPE_CHART[mainType]) {
        that.setData({
          atkGroups: that._groupAtk(mainType),
          defGroups: typechart.defenseProfile(spirit.types || [mainType])
        });
      }

      // WIKI 详情（按需加载单精灵文件 ~2.4KB，秒下）
      wikidex.loadDetail(name, function (d) {
        if (!d) return;
        that.detail = d;
        that._applySkills();
        that.setData({
          wikiDesc: d.wikiDesc || '',
          wikiKind: d.kind || '',
          natures: d.natures || [],
          eggGroup: d.eggGroup || '',
          talents: d.talents || [],
          quests: d.quests || [],
          detailBody: d.body || {},
          detailTotal: d.total || 0,
          statBars: that._statBars(spirit)
        });
      });

      // 参照站补充（特性名兜底）
      that._loadExtra(name);
    });
  },

  _statBars: function (spirit) {
    var bars = [];
    var stats = (this.detail && this.detail.stats) || null;
    var maxVal = 160;
    var keys = ['HP', 'ATK', 'MATK', 'DEF', 'MDEF', 'SPD'];
    for (var i = 0; i < keys.length; i++) {
      var v = stats ? (stats[keys[i]] || 0) : 0;
      bars.push({
        key: keys[i],
        label: STAT_LABEL[keys[i]],
        color: STAT_COLOR[keys[i]],
        value: v,
        pct: Math.min(100, Math.round(v / maxVal * 100))
      });
    }
    return bars;
  },

  _loadExtra: function (name) {
    var that = this;
    var KEY = 'roco_extra_cache_v1';
    var apply = function (data) {
      if (data && data[name]) {
        var ex = data[name];
        that.setData({
          extra: ex,
          statBars: that._statBars(that.spirit)  // 补充数据不影响种族值，只刷新
        });
      }
    };
    try {
      var c = wx.getStorageSync(KEY);
      if (c && c.data) { apply(c.data); }
    } catch (e) { }
    wx.request({
      url: EXTRA_URL + '?_=' + Date.now(),
      timeout: 20000,
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          try { wx.setStorageSync(KEY, { data: res.data }); } catch (e) { }
          apply(res.data);
        }
      }
    });
  },

  _applySkills: function () {
    var d = this.detail;
    if (!d || !d.skills) { this.setData({ skills: [], skillTotal: 0 }); return; }
    this._skillTypes = ['全部'];
    (d.skills || []).forEach(function (s) {
      if (this._skillTypes.indexOf(s.type) < 0) this._skillTypes.push(s.type);
    }, this);
    this.setData({ skillTypes: this._skillTypes });
    this._renderSkills();
  },

  _renderSkills: function () {
    var d = this.detail;
    if (!d || !d.skills) { this.setData({ skills: [] }); return; }
    var key = SKILL_SRC[this.data.skillSrc].key;
    var filter = this.data.skillFilter;
    var list = (d.skills || []).filter(function (s) {
      if (s.source !== key) return false;
      if (filter !== '全部' && s.type !== filter) return false;
      return true;
    }).map(function (s) {
      return {
        name: s.name, type: s.type, cat: s.cat, power: s.power,
        cost: s.cost, lv: s.lv, desc: s.desc,
        color: TYPE_COLOR[s.type] || '#9AA7B3'
      };
    });
    list.sort(function (a, b) {
      var na = parseInt(String(a.lv).replace(/\D/g, ''), 10);
      var nb = parseInt(String(b.lv).replace(/\D/g, ''), 10);
      return (isNaN(na) ? 999 : na) - (isNaN(nb) ? 999 : nb);
    });
    this.setData({
      skills: list,
      skillTotal: (d.skills || []).filter(function (s) { return s.source === key; }).length
    });
  },

  onTab: function (e) {
    this.setData({ tab: +e.currentTarget.dataset.idx });
  },

  onSkillSrcTap: function (e) {
    this.setData({ skillSrc: +e.currentTarget.dataset.idx, skillFilter: '全部' });
    this._renderSkills();
  },

  onSkillFilter: function (e) {
    this.setData({ skillFilter: e.currentTarget.dataset.f });
    this._renderSkills();
  },

  onFamilyTap: function (e) {
    var name = e.currentTarget.dataset.name;
    if (name === this.data.name) return;
    wx.redirectTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) });
  },

  _groupAtk: function (attackType) {
    var groups = { x2: [], x05: [], x0: [] };
    typechart.TYPES.forEach(function (def) {
      var m = typechart.attackMultiplier(attackType, [def]);
      if (m === 0) groups.x0.push(def);
      else if (m === 0.5) groups.x05.push(def);
      else if (m === 2) groups.x2.push(def);
    });
    return groups;
  }
});
