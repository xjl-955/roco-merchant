/** 性格修正表（洛克王国：世界）
 *  规则与系列通例一致：每项性格对 6 项能力中的 1 项 +10%、1 项 -10%，其余不变。
 *  能力项：hp(生命) atk(物攻) def(物防) satk(魔攻) sdef(魔防) spd(速度)
 *  来源：游戏内通用规则整理；后续可由 WIKI 数据文件覆盖修正。
 */

var NATURES = [
  { name: '勤奋', up: null, down: null },
  { name: '怕寂寞', up: 'atk', down: 'def' },
  { name: '勇敢', up: 'atk', down: 'spd' },
  { name: '固执', up: 'atk', down: 'satk' },
  { name: '顽皮', up: 'atk', down: 'sdef' },
  { name: '大胆', up: 'def', down: 'atk' },
  { name: '坦率', up: null, down: null },
  { name: '悠闲', up: 'def', down: 'spd' },
  { name: '淘气', up: 'def', down: 'satk' },
  { name: '乐天', up: 'def', down: 'sdef' },
  { name: '胆小', up: 'spd', down: 'atk' },
  { name: '急躁', up: 'spd', down: 'def' },
  { name: '认真', up: null, down: null },
  { name: '开朗', up: 'spd', down: 'satk' },
  { name: '天真', up: 'spd', down: 'sdef' },
  { name: '保守', up: 'satk', down: 'atk' },
  { name: '稳重', up: 'satk', down: 'def' },
  { name: '冷静', up: 'satk', down: 'spd' },
  { name: '温和', up: null, down: null },
  { name: '马虎', up: 'satk', down: 'sdef' },
  { name: '沉着', up: 'sdef', down: 'atk' },
  { name: '温顺', up: 'sdef', down: 'def' },
  { name: '自大', up: 'sdef', down: 'spd' },
  { name: '慎重', up: 'sdef', down: 'satk' },
  { name: '浮躁', up: null, down: null }
];

var STAT_NAMES = {
  hp: '生命', atk: '物攻', def: '物防',
  satk: '魔攻', sdef: '魔防', spd: '速度'
};

/** 查询性格修正：返回 { name, upText, downText, neutral } */
function getNature(name) {
  for (var i = 0; i < NATURES.length; i++) {
    if (NATURES[i].name === name) {
      var n = NATURES[i];
      return {
        name: n.name,
        up: n.up,
        down: n.down,
        upText: n.up ? STAT_NAMES[n.up] : '无',
        downText: n.down ? STAT_NAMES[n.down] : '无',
        neutral: !n.up && !n.down
      };
    }
  }
  return null;
}

/** 全部性格（按 +项分组展示用） */
function grouped() {
  var groups = [
    { key: 'atk', label: '物攻+', list: [] },
    { key: 'def', label: '物防+', list: [] },
    { key: 'spd', label: '速度+', list: [] },
    { key: 'satk', label: '魔攻+', list: [] },
    { key: 'sdef', label: '魔防+', list: [] },
    { key: 'none', label: '无修正', list: [] }
  ];
  for (var i = 0; i < NATURES.length; i++) {
    var n = NATURES[i];
    var target = null;
    for (var g = 0; g < groups.length; g++) {
      if (groups[g].key === (n.up || 'none')) { target = groups[g]; break; }
    }
    target.list.push(n.name + (n.down ? '（- ' + STAT_NAMES[n.down] + '）' : ''));
  }
  return groups;
}

module.exports = {
  NATURES: NATURES,
  STAT_NAMES: STAT_NAMES,
  getNature: getNature,
  grouped: grouped
};
