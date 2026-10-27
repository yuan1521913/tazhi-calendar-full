// 每周该是什么维度：全项目唯一判定入口。
//
// 规则以卡片为准：某一周的维度 = 该周 7 张卡片共同使用的维度。
// 没有卡片的周退回七维轮换（每周一维，7 周一循环），第 53 周为综述。
//
// 生成脚本、服务端注入脚本和 scripts/check-week-dimensions.mjs 都以本模块为基准，
// 任何副本与这里不一致都会被 check 脚本拦下。

export const DIMENSION_IDS = [
  'history',
  'constitution',
  'law',
  'policy',
  'organization',
  'participation',
  'action'
];

export const OVERVIEW_ID = 'overview';
export const WEEKS_IN_YEAR = 52;
export const DAYS_IN_YEAR = 365;
export const OVERVIEW_WEEK = WEEKS_IN_YEAR + 1;

// 天 -> 周的唯一口径。第 365 天收束在最后一周年内：它是一张综述卡，
// 不属于第 53 周，所以这里不能直接用 Math.ceil(365 / 7)。
export function dayToWeek(day) {
  const key = Number(day);
  if (!Number.isFinite(key) || key < 1) return 1;
  if (key >= DAYS_IN_YEAR) return WEEKS_IN_YEAR;
  return Math.ceil(key / 7);
}

// 某一天该显示什么维度：只有第 365 天是综述，其余按它所在的周。
export function dimensionForDay(day, weekDimensions) {
  if (Number(day) >= DAYS_IN_YEAR) return OVERVIEW_ID;
  return dimensionForWeek(dayToWeek(day), weekDimensions);
}

// 无卡片时的兜底：第 1 周历史、第 2 周宪法……第 8 周回到历史。
export function cycleDimension(week) {
  const index = Number(week) - 1;
  if (!Number.isFinite(index) || index < 0) return DIMENSION_IDS[0];
  return DIMENSION_IDS[index % DIMENSION_IDS.length];
}

// 以卡片为主的 week -> dimension 映射。
export function buildWeekDimensions(completeDays) {
  const counts = new Map();
  (completeDays || []).forEach((day) => {
    const week = Number(day && day.week);
    const dimension = day && day.dimension;
    if (!week || !dimension || dimension === OVERVIEW_ID) return;
    const bucket = counts.get(week) || new Map();
    bucket.set(dimension, (bucket.get(dimension) || 0) + 1);
    counts.set(week, bucket);
  });

  const map = {};
  counts.forEach((bucket, week) => {
    let best = '';
    let bestCount = -1;
    bucket.forEach((count, dimension) => {
      // 平手时按 DIMENSION_IDS 顺序取先者，保证结果稳定。
      if (count > bestCount || (count === bestCount && DIMENSION_IDS.indexOf(dimension) < DIMENSION_IDS.indexOf(best))) {
        best = dimension;
        bestCount = count;
      }
    });
    if (best) map[week] = best;
  });

  for (let week = 1; week <= WEEKS_IN_YEAR; week += 1) {
    if (!map[week]) map[week] = cycleDimension(week);
  }
  map[OVERVIEW_WEEK] = OVERVIEW_ID;
  return map;
}

export function dimensionForWeek(week, weekDimensions) {
  const key = Number(week);
  if (!Number.isFinite(key)) return DIMENSION_IDS[0];
  const map = weekDimensions || {};
  if (map[key]) return map[key];
  if (key === OVERVIEW_WEEK || key === DAYS_IN_YEAR) return OVERVIEW_ID;
  return cycleDimension(key);
}

export function weekLabel(week, weekDimensions, dimensions) {
  const id = dimensionForWeek(week, weekDimensions);
  const list = Array.isArray(dimensions) ? dimensions : [];
  const item = list.find((entry) => entry && entry.id === id) || list[0];
  return '第' + week + '周 · ' + ((item && item.name) || '制度') + ' · 制度地图';
}

export function buildYearWeeks(completeDays, dimensions) {
  const weekDimensions = buildWeekDimensions(completeDays);
  return Array.from({ length: WEEKS_IN_YEAR }, (_, index) => {
    const week = index + 1;
    return {
      week,
      dimension: dimensionForWeek(week, weekDimensions),
      label: weekLabel(week, weekDimensions, dimensions),
      weekDimensions
    };
  }).map(({ weekDimensions: _ignored, ...row }) => row);
}

// 卡片自带的维度与判定结果不一致的清单。
export function cardMismatches(completeDays, weekDimensions) {
  const out = [];
  (completeDays || []).forEach((day) => {
    const expected = dimensionForWeek(day && day.week, weekDimensions);
    const actual = day && day.dimension;
    if (!actual || actual === expected) return;
    // 第 365 天按综述收束，卡片标注 week 52、dimension overview。
    if (Number(day && day.day) === DAYS_IN_YEAR && actual === OVERVIEW_ID) return;
    out.push({ day: day.day, week: day.week, card: actual, rule: expected });
  });
  return out;
}

// 同一周内出现多个维度（数据自身矛盾）。
export function splitWeeks(completeDays) {
  const buckets = new Map();
  (completeDays || []).forEach((day) => {
    if (!day || day.dimension === OVERVIEW_ID) return;
    const week = Number(day.week);
    if (!week) return;
    const set = buckets.get(week) || new Set();
    set.add(day.dimension);
    buckets.set(week, set);
  });
  const out = [];
  buckets.forEach((set, week) => {
    if (set.size > 1) out.push({ week, dimensions: [...set] });
  });
  return out;
}

// 浏览器端（非 ESM）注入脚本：只认 payload 里的 weekDimensions，
// 不再从 yearWeeks 反推，避免出现循环依赖。
export function browserSource() {
  return [
    'window.CALENDAR_DATA.dimensionForWeek = function (week) {',
    '  var key = Number(week);',
    '  var map = window.CALENDAR_DATA.weekDimensions || {};',
    "  var hit = map[key] || map[String(key)];",
    "  if (hit) return hit;",
    "  if (key === 53 || key === 365) return 'overview';",
    "  var ids = ['history','constitution','law','policy','organization','participation','action'];",
    '  if (!isFinite(key) || key < 1) return ids[0];',
    '  return ids[(key - 1) % ids.length];',
    '};',
    'window.CALENDAR_DATA.weekLabel = function (week) {',
    '  var id = window.CALENDAR_DATA.dimensionForWeek(week);',
    '  var list = window.CALENDAR_DATA.dimensions || [];',
    '  var item = null;',
    '  for (var i = 0; i < list.length; i += 1) { if (list[i] && list[i].id === id) { item = list[i]; break; } }',
    "  return '第' + week + '周 · ' + ((item && item.name) || '制度') + ' · 制度地图';",
    '};'
  ].join('\n');
}
