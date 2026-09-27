/** 18 系克制矩阵（进攻视角）
 *  数据来源：洛克王国世界WIKI Module:Pets/data/Types（via 克制计算器 data-config）
 *  chart[攻击系] = { 防守系: 倍率 }；未列出的防守系 = ×1
 *  2 = 克制，0.5 = 抵抗，0 = 免疫
 */
var TYPE_CHART = {"普通":{"火":2,"地":2,"武":0.5,"机械":2},"草":{"火":0.5,"水":2,"光":2,"地":2,"冰":0.5,"毒":0.5,"虫":0.5,"翼":0.5},"火":{"普通":0.5,"草":2,"水":0.5,"地":0.5,"冰":2,"虫":2,"机械":2},"水":{"草":0.5,"火":2,"地":2,"电":0.5,"机械":2},"光":{"草":0.5,"幽":2,"恶":2},"地":{"普通":0.5,"草":0.5,"火":2,"水":0.5,"冰":2,"电":2,"毒":2,"武":0.5,"机械":0.5},"冰":{"草":2,"火":0.5,"地":2,"龙":2,"武":0.5,"翼":2,"机械":0.5},"龙":{"冰":0.5,"龙":2,"萌":0.5},"电":{"水":2,"地":0.5,"翼":2},"毒":{"草":2,"地":0.5,"萌":2,"恶":0.5,"幻":0.5},"虫":{"草":2,"火":0.5,"翼":0.5,"恶":2,"幻":2},"武":{"普通":2,"地":2,"冰":2,"翼":0.5,"萌":0.5,"恶":2,"机械":2,"幻":0.5},"翼":{"草":2,"冰":0.5,"电":0.5,"虫":2,"武":2},"萌":{"龙":2,"毒":0.5,"武":2,"恶":2,"机械":0.5},"幽":{"光":2,"幽":2,"恶":0.5,"幻":2},"恶":{"光":0.5,"毒":2,"虫":0.5,"武":0.5,"萌":2,"幽":2},"机械":{"普通":0.5,"火":0.5,"水":0.5,"地":2,"冰":2,"武":0.5,"萌":2},"幻":{"毒":2,"虫":0.5,"武":2,"幽":0.5}};

var TYPES = Object.keys(TYPE_CHART);

var COLOR_MAP = {
  '普通': '#9FA7B3', '草': '#5CB85C', '火': '#E8634C', '水': '#4A90D9',
  '光': '#F0C94A', '地': '#C98A3D', '冰': '#6FC7E8', '龙': '#7A5AE0',
  '电': '#F0A24A', '毒': '#A05AC8', '虫': '#9BB534', '武': '#D9534F',
  '翼': '#8FA8D8', '萌': '#F08CB8', '幽': '#6A5A9A', '恶': '#5A5A6A',
  '机械': '#8A9AAA', '幻': '#C87AD9'
};

/** 查询进攻倍率：攻击系 attack 对防守系列表（1~2 系）的总倍率 */
function attackMultiplier(attackType, defenseTypes) {
  var row = TYPE_CHART[attackType];
  if (!row) return 1;
  var m = 1;
  for (var i = 0; i < defenseTypes.length; i++) {
    var v = row[defenseTypes[i]];
    if (v !== undefined) m *= v;
  }
  return m;
}

/** 查询防守视角：防守系列表（1~2 系）受到各系攻击的倍率分组 */
function defenseProfile(defenseTypes) {
  var groups = { x4: [], x2: [], x1: [], x05: [], x0: [] };
  for (var t = 0; t < TYPES.length; t++) {
    var atk = TYPES[t];
    var m = 1;
    for (var i = 0; i < defenseTypes.length; i++) {
      var v = (TYPE_CHART[atk] || {})[defenseTypes[i]];
      if (v !== undefined) m *= v;
    }
    if (m === 0) groups.x0.push(atk);
    else if (m === 0.25) groups.x05.push(atk);
    else if (m === 0.5) groups.x05.push(atk);
    else if (m === 2) groups.x2.push(atk);
    else if (m === 4) groups.x4.push(atk);
    else groups.x1.push(atk);
  }
  return groups;
}

module.exports = {
  TYPES: TYPES,
  COLOR_MAP: COLOR_MAP,
  TYPE_CHART: TYPE_CHART,
  attackMultiplier: attackMultiplier,
  defenseProfile: defenseProfile
};
