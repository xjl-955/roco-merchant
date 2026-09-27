var tools = require('../../utils/tools.js');
var wikidex = require('../../utils/wikidex.js');
var typechart = require('../../utils/typechart.js');

var TYPE_COLOR = {
  '普通': '#9FA7B3', '草': '#5CB85C', '火': '#E8634C', '水': '#4A90D9',
  '光': '#F0C94A', '地': '#C98A3D', '冰': '#6FC7E8', '龙': '#7A5AE0',
  '电': '#F0A24A', '毒': '#A05AC8', '虫': '#9BB534', '武': '#D9534F',
  '翼': '#8FA8D8', '萌': '#F08CB8', '幽': '#6A5A9A', '恶': '#5A5A6A',
  '机械': '#8A9AAA', '幻': '#C87AD9'
};

var STAT_LABEL = {
  HP: '生命', ATK: '攻击', MATK: '魔攻',
  DEF: '物防', MDEF: '魔防', SPD: '速度'
};

var SKILL_SRC = [
  { key: 'level', label: '升级技能' },
  { key: 'machine', label: '可学技能石' },
  { key: 'blood', label: '血脉技能' }
];

Page({
  data: {
    loading: true,
    notFound: false,
    name: '',
    spirit: null,
    detail: null,
    statBars: [],
    atkGroups: null,
    defGroups: null,
    typeColor: TYPE_COLOR,
    skillSrc: 0,       // 当前技能来源 tab
    skillSrcList: SKILL_SRC,
    skills: []
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
      that.applyBase(spirit);
      that.setData({ loading: false, spirit: spirit });
      wx.setNavigationBarTitle({ title: spirit.name });

      // 属性克制
      var mainType = (spirit.types || [])[0];
      if (mainType && typechart.TYPE_CHART[mainType]) {
        that.setData({
          atkGroups: that._groupAtk(mainType),
          defGroups: typechart.defenseProfile([mainType])
        });
      }

      // WIKI 详情（种族值分项/特长/技能）
      wikidex.loadWikiDetails(function (details) {
        if (!details) return;
        var d = details[name];
        if (!d) return;
        that.detail = d;
        that.applyWikiDetail(d);
      });
    });
  },

  applyBase: function (spirit) {
    // 静态基础信息展示（总种族值兜底）
    this.setData({ spirit: spirit });
  },

  applyWikiDetail: function (d) {
    // 种族值进度条
    var statBars = [];
    var maxVal = 160;
    var keys = ['HP', 'ATK', 'MATK', 'DEF', 'MDEF', 'SPD'];
    var labels = { HP: '生命', ATK: '攻击', MATK: '魔攻', DEF: '物防', MDEF: '魔防', SPD: '速度' };
    for (var i = 0; i < keys.length; i++) {
      var v = (d.stats || {})[keys[i]] || 0;
      statBars.push({
        key: keys[i],
        label: labels[keys[i]],
        value: v,
        pct: Math.min(100, Math.round(v / maxVal * 100))
      });
    }
    this.setData({ detail: d, statBars: statBars });
    this._renderSkills(0);
  },

  _renderSkills: function (srcIdx) {
    var d = this.detail;
    if (!d || !d.skills) { this.setData({ skills: [] }); return; }
    var key = SKILL_SRC[srcIdx].key;
    var list = (d.skills || []).filter(function (s) { return s.source === key; })
      .map(function (s) {
        return {
          name: s.name, type: s.type, cat: s.cat, power: s.power,
          cost: s.cost, lv: s.lv, desc: s.desc,
          color: TYPE_COLOR[s.type] || '#9AA7B3'
        };
      });
    // 按 lv 排序（LV1 在前，空在后）
    list.sort(function (a, b) {
      var na = parseInt(String(a.lv).replace(/\D/g, ''), 10);
      var nb = parseInt(String(b.lv).replace(/\D/g, ''), 10);
      return (isNaN(na) ? 999 : na) - (isNaN(nb) ? 999 : nb);
    });
    this.setData({ skills: list });
  },

  onSkillSrcTap: function (e) {
    var idx = +e.currentTarget.dataset.idx;
    this.setData({ skillSrc: idx });
    this._renderSkills(idx);
  },

  _groupAtk: function (attackType) {
    var groups = { x2: [], x1: [], x05: [], x0: [] };
    typechart.TYPES.forEach(function (def) {
      var m = typechart.attackMultiplier(attackType, [def]);
      if (m === 0) groups.x0.push(def);
      else if (m === 0.5) groups.x05.push(def);
      else if (m === 2) groups.x2.push(def);
      else groups.x1.push(def);
    });
    return groups;
  }
});
