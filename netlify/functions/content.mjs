import fs from 'node:fs';
import vm from 'node:vm';
import { getStore } from '../../lib/store.mjs';
import { OPEN_TO_PUBLIC } from '../../lib/launch-mode.mjs';
import { codeStatus } from './_shared.mjs';
import { browserSource, dayToWeek, dimensionForDay } from '../../lib/week-dimensions.mjs';

let dataPromise;

const loadFullData = () => {
  if (!dataPromise) {
    dataPromise = (async () => {
      const vercelSource = new URL('../../api/_data.js', import.meta.url);
      const source = await fs.promises.readFile(vercelSource, 'utf8');
      const sandbox = {};
      sandbox.window = sandbox;
      sandbox.global = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(source, sandbox, { filename: 'data.js' });
      return sandbox.CALENDAR_DATA;
    })();
  }
  return dataPromise;
};

const parseCookies = (req) => {
  const header = req.headers.get('cookie') || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index > 0) {
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (key) {
        try {
          cookies[key] = decodeURIComponent(value);
        } catch (error) {
          cookies[key] = value;
        }
      }
    }
  });
  return cookies;
};

const isReviewed = (item) => Boolean(item && (item.reviewStatus === 'complete' || item.draft !== true));

// 开关定义在 lib/launch-mode.mjs，下单接口读同一份。
export { OPEN_TO_PUBLIC };

const makeLockedDay = (full, day, message = '解锁后查看这一天的制度卡片。') => ({
  day,
  week: dayToWeek(day),
  dimension: dimensionForDay(day, full.weekDimensions),
  dow: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][(day - 1) % 7],
  title: '待复核开放',
  quote: message,
  knowledge: '',
  related: '',
  action: '',
  future: true,
  locked: true
});

const buildScopedData = (full, scope, paidUntilDay, includeDrafts = false) => {
  const completeDays = full.completeDays.filter(
    (item) => item.day <= paidUntilDay && (includeDrafts || isReviewed(item))
  );
  const reviewedIds = new Set(completeDays.map((item) => item.day));
  const allDays = Array.from({ length: 365 }, (_, index) => {
    const day = index + 1;
    const item = completeDays.find((candidate) => candidate.day === day);
    if (item) return item;
    return makeLockedDay(full, day, scope === 'full365'
      ? '已补写待复核，复核通过后开放。'
      : (day <= paidUntilDay ? '当前权限已解锁，内容复核通过后开放。' : '解锁后查看这一天的制度卡片。'));
  });
  return { completeDays, allDays, reviewedIds };
};

const buildData = (full, scope) => {
  const effectiveScope = OPEN_TO_PUBLIC ? 'full365' : scope;
  if (effectiveScope === 'full365') {
    const { completeDays, allDays } = buildScopedData(full, effectiveScope, 365, OPEN_TO_PUBLIC);
    return {
      ...full,
      completeDays,
      allDays,
      access: 'full',
      scope: 'full365',
      paidUntilDay: 365
    };
  }

  const paidUntilDay = (effectiveScope === 'month2' || effectiveScope === 'trial28') ? 56 : 28;
  const { completeDays, allDays } = buildScopedData(full, effectiveScope, paidUntilDay);

  const cardLegalMeta = {};
  Object.entries(full.cardLegalMeta || {}).forEach(([key, value]) => {
    if (Number(key) <= paidUntilDay) cardLegalMeta[key] = value;
  });

  return {
    dimensions: full.dimensions,
    completeDays,
    yearWeeks: full.yearWeeks,
    weekDimensions: full.weekDimensions,
    allDays,
    legalMeta: full.legalMeta,
    scenePresets: full.scenePresets,
    contradictionCard: null,
    storyStages: null,
    milestones: null,
    quarterlyCards: null,
    monthlyPages: null,
    cardLegalMeta,
    access: (effectiveScope === 'month2' || effectiveScope === 'trial28') ? 'month2' : 'trial',
    scope: (effectiveScope === 'month2' || effectiveScope === 'trial28') ? 'month2' : 'free',
    paidUntilDay
  };
};

// 维度判定只在 lib/week-dimensions.mjs 里定义一次；这里注入同一份浏览器实现，
// 数据来自 payload 的 weekDimensions，不再从 yearWeeks 反推。
// 导出给 dev-server 与守卫脚本复用，避免多处各自拼一份模板字符串。
export const FUNCTION_SOURCE = `\n${browserSource()}\n`;

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ ok: false, message: '请求方式不对。' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const sessionToken = parseCookies(req).tazhi_session;
  let session = null;
  if (sessionToken) {
    try {
      session = await getStore('unlock-sessions').get(sessionToken, { type: 'json' });
    } catch (error) {
      session = null;
    }
  }
  if (session?.code) {
    try {
      const codeRecord = await getStore('unlock-codes').get(session.code, { type: 'json' });
      if (codeStatus(codeRecord) === 'refunded' || codeRecord?.refunded) session = null;
    } catch (error) {}
  }
  const authorizedScope = session && new Date(session.expiresAt) > new Date() ? ((session.scope === 'month2' || session.scope === 'trial28') ? 'month2' : 'full365') : 'free';
  const full = await loadFullData();
  const payload = buildData(full, authorizedScope);

  const script = `window.CALENDAR_DATA = ${JSON.stringify(payload)};\n${FUNCTION_SOURCE}`;
  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'private, no-store'
    }
  });
};

export { buildData, loadFullData };
