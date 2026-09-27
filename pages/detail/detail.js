var tools = require('../../utils/tools.js');
var typechart = require('../../utils/typechart.js');

var TYPE_COLOR = {
  '普通': '#9FA7B3', '草': '#5CB85C', '火': '#E8634C', '水': '#4A90D9',
  '光': '#F0C94A', '地': '#C98A3D', '冰': '#6FC7E8', '龙': '#7A5AE0',
  '电': '#F0A24A', '毒': '#A05AC8', '虫': '#9BB534', '武': '#D9534F',
  '翼': '#8FA8D8', '萌': '#F08CB8', '幽': '#6A5A9A', '恶': '#5A5A6A',
  '机械': '#8A9AAA', '幻': '#C87AD9'
};

var STAT_LABEL = {
  hp: '生命', atk: '物攻', satk: '魔攻',
  def: '物防', sdef: '魔防', spd: '速度'
};

var TYPE_EN2CN = {
  Normal: '普通', Grass: '草', Fire: '火', Water: '水', Light: '光',
  Ground: '地', Ice: '冰', Dragon: '龙', Electric: '电', Poison: '毒',
  Bug: '虫', Fighting: '武', Wing: '翼', Cute: '萌', Ghost: '幽',
  Dark: '恶', Machine: '机械', Psychic: '幻'
};

Page({
  data: {
    loading: true,
    notFound: false,
    spirit: null,
    statBars: [],
    family: [],
    typeColor: TYPE_COLOR,
    atkGroups: null,
    defGroups: null,
    skillTab: 0,
    skillFilter: '全部',
    skillTypes: [],
    skills: [],
    skillCounts: { level: 0, blood: 0, stone: 0 },
    traits: [],
    detailDesc: ''
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
      if (!payload) { that.setData({ loading: false, notFound: true }); return; }
      var spirit = null;
      for (var i = 0; i < payload.spirits.length; i++) {
        var s = payload.spirits[i];
        if ((slug && s.slug === slug) || (!slug && s.name === name)) { spirit = s; break; }
      }
      if (!spirit) { that.setData({ loading: false, notFound: true }); return; }

      var family = [];
      payload.spirits.forEach(function (s) {
        if (spirit.family && s.family === spirit.family) family.push(s);
      });
      var stageOrder = { '1': 1, '2': 2, '3': 3, '4': 4 };
      family.sort(function (a, b) {
        return (stageOrder[a.stage] || 9) - (stageOrder[b.stage] || 9) || (a.name < b.name ? -1 : 1);
      });

      // 详细数据：缓存优先 → 远程
      var detail = null;
      try { detail = wx.getStorageSync('roco_detail_' + (spirit.slug || spirit.name)); } catch (e) { }
      that.applyDetail(spirit, family, detail);

      if (!detail && spirit.slug) {
        wx.request({
          url: 'https://xjl-955.github.io/roco-data/spirits-detail.json',
          timeout: 15000,
          success: function (res) {
            if (res.statusCode === 200 && res.data && res.data[spirit.slug]) {
              var d = res.data[spirit.slug];
              that.detail = d;
              try { wx.setStorageSync('roco_detail_' + spirit.slug, d); } catch (e) { }
              that.applyDetail(spirit, family, d);
            }
          }
        });
      }
    });
  },

  applyDetail: function (spirit, family, detail) {
    var statBars = [];
    if (detail && detail.stats) {
      var maxVal = 160;
      var keys = ['hp', 'atk', 'satk', 'def', 'sdef', 'spd'];
      for (var i = 0; i < keys.length; i++) {
        var v = detail.stats[keys[i]] || 0;
        statBars.push({
          key: keys[i],
          label: STAT_LABEL[keys[i]],
          value: v,
          pct: Math.min(100, Math.round(v / maxVal * 100))
        });
      }
    }

    var mainType = (spirit.types && spirit.types[0]) || '';
    var atkGroups = null, defGroups = null;
    if (mainType && typechart.TYPE_CHART[mainType]) {
      atkGroups = this._groupAtk(mainType);
      defGroups = typechart.defenseProfile([mainType]);
    }

    var skillCounts = { level: 0, blood: 0, stone: 0 };
    var skills = [];
    var skillTypes = ['全部'];
    if (detail && detail.skills) {
      skillCounts = {
        level: (detail.skills.level || []).length,
        blood: (detail.skills.blood || []).length,
        stone: (detail.skills.stone || []).length
      };
      var all = detail.skills.level || [];
      all.forEach(function (s) {
        var cn = TYPE_EN2CN[s.type] || s.type;
        if (skillTypes.indexOf(cn) < 0) skillTypes.push(cn);
      });
      skills = this._mapSkills(all);
    }

    wx.setNavigationBarTitle({ title: spirit.name });
    this.setData({
      loading: false,
      notFound: false,
      spirit: spirit,
      statBars: statBars,
      family: family,
      atkGroups: atkGroups,
      defGroups: defGroups,
      skillCounts: skillCounts,
      skillTypes: skillTypes,
      skillFilter: '全部',
      skills: skills,
      detailDesc: (detail && detail.desc) || '',
      traits: (detail && detail.traits) || []
    });
  },

  _mapSkills: function (list) {
    return (list || []).map(function (s) {
      return {
        name: s.name, lv: s.lv, type: TYPE_EN2CN[s.type] || s.type,
        kind: s.kind, power: s.power, pp: s.pp, desc: s.desc,
        color: TYPE_COLOR[TYPE_EN2CN[s.type]] || '#9AA7B3'
      };
    });
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
  },

  onSkillTab: function (e) {
    var idx = +e.currentTarget.dataset.idx;
    this.setData({ skillTab: idx, skillFilter: '全部' });
    this._renderSkills(idx, '全部');
  },

  onSkillFilter: function (e) {
    var f = e.currentTarget.dataset.f;
    this.setData({ skillFilter: f });
    this._renderSkills(this.data.skillTab, f);
  },

  _renderSkills: function (tab, filter) {
    var d = this.detail;
    if (!d || !d.skills) { this.setData({ skills: [] }); return; }
    var src = tab === 0 ? d.skills.level : tab === 1 ? d.skills.blood : d.skills.stone;
    var list = this._mapSkills((src || []).filter(function (s) {
      if (filter === '全部') return true;
      return (TYPE_EN2CN[s.type] || s.type) === filter;
    }));
    this.setData({ skills: list });
  },

  onFamilyTap: function (e) {
    var name = e.currentTarget.dataset.name;
    var slug = e.currentTarget.dataset.slug;
    wx.redirectTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) + '&slug=' + slug });
  }
});
