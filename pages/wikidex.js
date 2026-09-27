/**
 * WIKI 图鉴分类与详情数据层
 *
 * 分类体系（与 WIKI 精灵图鉴页一致）：
 *   - 形态阶段：一阶 / 二阶 / 三阶 / 首领（stage 1/2/3，form 含 lord）
 *   - 属性：18 系（data-type，双系精灵归入两系）
 *   - 赛季：S1~S4 / 未实装（season）
 *   - 异色：是 / 否（shiny）
 *
 * 数据源：public/spirits.json（基础+分类）+ public/spirits-wiki.json（详情）
 */

var DETAIL_URL = 'https://xjl-955.github.io/roco-data/spirits-wiki.json';
var DETAIL_KEY = 'roco_wiki_detail_cache_v1';

/** 提取可用的分类维度（从 spirits 数组归纳） */
function buildCategories(spirits) {
  var stages = { '1': '一阶', '2': '二阶', '3': '三阶' };
  var stageCounts = {};
  var types = {};
  var seasons = {};
  var shinyCount = 0;

  spirits.forEach(function (s) {
    // 阶段：首领形态的 form 是 lord；WIKI 卡 stage 为空但 form=lord
    var stageLabel = s.stage === '1' ? '一阶' : s.stage === '2' ? '二阶' : s.stage === '3' ? '三阶' : '';
    if (s.isLord || s.stageLabel === '首领化' || s.stageLabel === '首领') stageLabel = '首领';
    if (stageLabel) stageCounts[stageLabel] = (stageCounts[stageLabel] || 0) + 1;

    (s.types || []).forEach(function (t) { types[t] = (types[t] || 0) + 1; });

    if (s.season && s.season !== 'none') seasons[s.season] = (seasons[s.season] || 0) + 1;
    if (s.shiny === true || s.shiny === 'yes') shinyCount++;
  });

  return {
    stages: stageCounts,
    types: types,
    seasons: seasons,
    shinyCount: shinyCount
  };
}

/** 拉取 WIKI 详情全量数据（大文件，缓存 7 天） */
function loadWikiDetails(callback) {
  try {
    var c = wx.getStorageSync(DETAIL_KEY);
    if (c && c.data && Date.now() - c.at < 7 * 24 * 3600 * 1000) {
      callback(c.data, true);
      return;
    }
  } catch (e) { }

  wx.request({
    url: DETAIL_URL,
    timeout: 30000,
    success: function (res) {
      if (res.statusCode === 200 && res.data) {
        try { wx.setStorageSync(DETAIL_KEY, { data: res.data, at: Date.now() }); } catch (e) { }
        callback(res.data, false);
      } else {
        callback(null, false);
      }
    },
    fail: function () { callback(null, false); }
  });
}

module.exports = {
  buildCategories: buildCategories,
  loadWikiDetails: loadWikiDetails
};
