(function () {
  const data = window.CALENDAR_DATA;
  if (!data) return;

  // 2026-10-12 全学科审核：停用 safety-layer / dedupe-layer / title-layer 三个运行时补丁。
  // 三个图层是早期内容版本的补丁，如今 data.js 已经逐字段维护完整
  // （safetyNote 364/365、localNote 364/365、source 与 sourceUrl 365/365、title 365/365），
  // 图层补充 0 个字段，却在覆盖：safety 图层 479 处字段覆盖（抽样多为按块错配，
  // 例如第 110 天的复议期限配了「劳动纠纷」的安全提示、第 149/150 天的反家暴历史卡
  // 配了「劳动纠纷」），title 图层 15 条标题全部换成上一代的行动句，
  // dedupe 图层给 144 张卡的知识区追加同一句模板填充。
  // 三个文件仍留在 public/ 以便回溯，但不再加载、不再应用。

  const state = {
    day: 1,
    flipped: false
  };

  // 侧栏铺满全年52周：滚轮停在那一栏上，就能从第1周一直滑到第52周。
  // 面板高度由 CSS 上限约束（min(620px, 100vh - 40px)），所以列表本身是独立滚动区。
  const ALL_WEEKS = (function () {
    const weeks = [];
    for (let week = 1; week <= 52; week += 1) weeks.push(week);
    return weeks;
  })();
  let weekListRendered = false;

  const FREE_DAY_LIMIT = 28;
  const UNLOCK_KEY = 'tazhi_unlocked';
  const getPaidUntilDay = function () {
    const dataAccess = window.CALENDAR_DATA && window.CALENDAR_DATA.access;
    if (dataAccess === 'full') return 365;
    if (dataAccess === 'month2') return 56;
    return FREE_DAY_LIMIT;
  };
  const launch = Object.assign({
    versionLabel: '365天全部开放 · 前49天完成复核 · 316天资料稿',
    digitalPrice: '99元',
    trialPrice: '9.9元',
    trialLabel: '第二个月',
    digitalLabel: '全年数字版',
    digitalLabel: '全年数字版',
    giftPrice: '299元',
    giftLabel: '实物底气礼盒',
    communityPrice: '999元起',
    communityLabel: '社群/企业定制',
    delivery: '365天内容已全部开放，无需解锁码；第50-365天标注“已补写 · 待复核”。',
    refund: '数字版3天内可申请退款，退款后解锁码停用。',
    buyHint: '在线下单，付款确认后自动发码。',
    buyLabel: '在线购买 · 自动发码'
  }, window.TAZHI_LAUNCH || {});

  let pendingRightDay = null;

  const els = {
    card: document.getElementById('card'),
    cardWrap: document.querySelector('.card-wrap'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    flipBtn: document.getElementById('flipBtn'),
    printBtn: document.getElementById('printBtn'),
    weekLabel: document.getElementById('weekLabel'),
    dayNumber: document.getElementById('dayNumber'),
    dayDow: document.getElementById('dayDow'),
    frontDayNumber: document.getElementById('frontDayNumber'),
    frontDayDow: document.getElementById('frontDayDow'),
    frontText: document.getElementById('frontText'),
    frontTitle: document.getElementById('frontTitle'),
    frontQuote: document.getElementById('frontQuote'),
    backDayNumber: document.getElementById('backDayNumber'),
    backDow: document.getElementById('backDow'),
    backTitle: document.getElementById('backTitle'),
    knowledgeText: document.getElementById('knowledgeText'),
    knowledgeLabel: document.getElementById('knowledgeLabel'),
    knowledgeWrap: document.getElementById('knowledgeWrap'),
    legalMeta: document.getElementById('legalMeta'),
    boundaryText: document.getElementById('boundaryText'),
    relatedText: document.getElementById('relatedText'),
    actionText: document.getElementById('actionText'),

    relatedLabel: document.getElementById('relatedLabel'),
    actionLabel: document.getElementById('actionLabel'),
    dimensionGlyph: document.getElementById('dimensionGlyph'),
    dimensionName: document.getElementById('dimensionName'),
    dimensionQuestion: document.getElementById('dimensionQuestion'),
    dimensionBlock: document.getElementById('dimensionBlock'),
    dimensionIcon: document.getElementById('dimensionIcon'),
    panelDimensionName: document.getElementById('panelDimensionName'),
    panelDimensionQuestion: document.getElementById('panelDimensionQuestion'),
    panelWeekLabel: document.getElementById('panelWeekLabel'),
    weekList: document.getElementById('weekList'),
    dimensionList: document.getElementById('dimensionList'),
    grid: document.getElementById('grid'),
    yearGrid: document.getElementById('yearGrid'),
    contradictionWrap: document.getElementById('contradictionWrap'),
    sceneSearch: document.getElementById('sceneSearch'),
    searchResults: document.getElementById('searchResults'),
    todayHint: document.getElementById('todayHint'),
    todayBtn: document.getElementById('todayBtn'),
    shareBtn: document.getElementById('shareBtn'),
    rightNoteBox: document.getElementById('rightNoteBox'),
    rightNoteInput: document.getElementById('rightNoteInput'),
    rightNoteSave: document.getElementById('rightNoteSave'),
    saveRightBtn: document.getElementById('saveRightBtn'),
    usefulBtn: document.getElementById('usefulBtn'),
    lightModeBtn: document.getElementById('lightModeBtn'),
    largeModeBtn: document.getElementById('largeModeBtn'),
    modeToggle: document.getElementById('modeToggle'),
    rightsList: document.getElementById('rightsList'),
    rightsCount: document.getElementById('rightsCount'),
    socialProof: document.getElementById('socialProof'),
    monthlyGrid: document.getElementById('monthlyGrid'),
    storyGrid: document.getElementById('storyGrid'),
    milestoneGrid: document.getElementById('milestoneGrid'),
    quarterlyGrid: document.getElementById('quarterlyGrid')
  };

  const getDay = function (number) {
    return data.allDays[number - 1] || data.allDays[0];
  };

  const getDimension = function (day) {
    return data.dimensions.find(function (item) { return item.id === day.dimension; }) || data.dimensions[0];
  };

  // 页头标签按这张卡自己的维度拼，不再对收尾日写死。
  // 这样数据层、注入脚本、卡片徽标和这里共用同一套判定，不会出现
  // 「目录写法律、卡片写综述」这类分叉。
  const getWeekLabel = function (day) {
    if (!day || !day.dimension) return data.weekLabel(day.week);
    return '第' + day.week + '周 · ' + getDimension(day).name + ' · 制度地图';
  };

  const padDay = function (number) {
    return String(number).padStart(2, '0');
  };

  const STORAGE_KEYS = {
    day: 'tazhi_day',
    rights: 'tazhi_rights',
    useful: 'tazhi_useful'
  };

  const readStorage = function (key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  };

  const writeStorage = function (key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {}
  };

  const isDayLocked = function (number) {
    return number > getPaidUntilDay();
  };

  const isUnlocked = function () {
    return Boolean(window.CALENDAR_DATA && (window.CALENDAR_DATA.access === 'full' || window.CALENDAR_DATA.access === 'month2'));
  };

  const getRights = function () {
    try {
      const raw = JSON.parse(readStorage(STORAGE_KEYS.rights, '[]')) || [];
      return raw.map(function (item) {
        if (typeof item === 'number') return { day: item, note: '' };
        return { day: Number(item.day), note: item.note || '' };
      });
    } catch (error) {
      return [];
    }
  };

  const saveRights = function (list) {
    writeStorage(STORAGE_KEYS.rights, JSON.stringify(list));
  };



  const getUseful = function () {
    try {
      return JSON.parse(readStorage(STORAGE_KEYS.useful, '{}')) || {};
    } catch (error) {
      return {};
    }
  };

  const saveUseful = function (list) {
    writeStorage(STORAGE_KEYS.useful, JSON.stringify(list));
  };

  const toggleUseful = function () {
    const useful = getUseful();
    const key = String(state.day);
    if (useful[key]) {
      delete useful[key];
    } else {
      useful[key] = true;
    }
    saveUseful(useful);
    renderCard();
  };
  const todayDayNumber = function () {
    const dayOfMonth = new Date().getDate();
    return dayOfMonth > 28 ? ((dayOfMonth - 1) % 28) + 1 : dayOfMonth;
  };

  const restoreProgress = function () {
    const saved = parseInt(readStorage(STORAGE_KEYS.day, ''), 10);
    if (!isNaN(saved) && saved >= 1 && saved <= data.allDays.length) {
      state.day = isDayLocked(saved) ? getPaidUntilDay() : saved;
    }
    if (readStorage(STORAGE_KEYS.day, '') === '') {
      state.day = 1;
    }
  };


  const searchCards = function (query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return data.completeDays.filter(function (day) {
      const text = [day.title, day.frontText, day.knowledge, day.related, day.action, day.review, day.question, day.safetyNote].filter(Boolean).join(' ').toLowerCase();
      return text.includes(q);
    });
  };

  const runSearch = function () {
    const q = els.sceneSearch.value;
    els.searchResults.innerHTML = '';
    if (!q.trim()) {
      els.searchResults.hidden = true;
      return;
    }
    const matches = searchCards(q);
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'search-empty';
      empty.textContent = '没有找到，换个说法试试。';
      els.searchResults.appendChild(empty);
      els.searchResults.hidden = false;
      return;
    }
    matches.slice(0, 8).forEach(function (day) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'search-result';
      item.innerHTML = '<span class="sr-day">第 ' + padDay(day.day) + ' 天</span><span class="sr-title"></span>';
      item.querySelector('.sr-title').textContent = day.title;
      item.addEventListener('click', function () {
        setDay(day.day);
        els.searchResults.hidden = true;
      });
      els.searchResults.appendChild(item);
    });
    els.searchResults.hidden = false;
  };

  const renderRights = function () {
    const list = getRights();
    els.rightsCount.textContent = list.length + ' 条';
    els.rightsList.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'rights-empty';
      empty.textContent = '还没有收藏。';
      els.rightsList.appendChild(empty);
      return;
    }
    list.forEach(function (item) {
      const day = getDay(item.day);
      if (!day) return;
      const card = document.createElement('article');
      card.className = 'right-item';
      const info = document.createElement('div');
      info.className = 'right-info';
      const title = document.createElement('strong');
      title.textContent = day.title;
      const dayLabel = document.createElement('span');
      dayLabel.textContent = '第 ' + padDay(day.day) + ' 天 · ' + day.dow;
      info.append(title, dayLabel);
      if (item.note) {
        const note = document.createElement('p');
        note.className = 'right-note';
        note.textContent = item.note;
        info.appendChild(note);
      }
      const actions = document.createElement('div');
      actions.className = 'right-actions';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'right-remove';
      remove.textContent = '移除';
      remove.addEventListener('click', function () {
        const next = getRights().filter(function (n) { return n.day !== day.day; });
        saveRights(next);
        renderRights();
        renderCard();
      });
      actions.append(remove);
      const noteBtn = document.createElement('button');
      noteBtn.type = 'button';
      noteBtn.className = 'right-note-btn';
      noteBtn.textContent = item.note ? '改原因' : '写下原因';
      noteBtn.addEventListener('click', function () {
        pendingRightDay = day.day;
        els.rightNoteInput.value = item.note || '';
        els.rightNoteBox.hidden = false;
      });
      actions.append(noteBtn, remove);
      card.append(info, actions);
      els.rightsList.appendChild(card);
    });
  };

  const goToday = function () {
    const now = new Date();
    const day = todayDayNumber();
    els.todayHint.hidden = false;
    if (isDayLocked(day)) {
      els.todayHint.textContent = '今天是 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · 今日卡片第 ' + day + ' 天 · 需要解锁全年内容。';
      showPaywall(day);
      return;
    }
    setDay(day);
    els.todayHint.textContent = '今天是 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · 今日卡片第 ' + day + ' 天。';
  };

  const toggleRight = function () {
    const list = getRights();
    const index = list.findIndex(function (item) { return item.day === state.day; });
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push({ day: state.day, note: '' });
      pendingRightDay = state.day;
      els.rightNoteInput.value = '';
      els.rightNoteBox.hidden = false;
    }
    saveRights(list);
    renderRights();
    renderCard();
  };

  const fitContent = function (container, selector) {


    const items = container.querySelectorAll(selector);
    items.forEach(function (item) {
      item.style.fontSize = '';
      item.style.lineHeight = '';
    });
    let guard = 0;
    while (container.scrollHeight > container.clientHeight + 1 && guard < 30) {
      items.forEach(function (item) {
        const size = parseFloat(getComputedStyle(item).fontSize);
        item.style.fontSize = Math.max(14, size - 0.5) + 'px';
      });
      guard += 1;
    }
  };


  const renderCard = function () {
  const renderLegalMeta = function (day) {
    const cardMeta = data.cardLegalMeta && data.cardLegalMeta[day.day];
    const boundarySection = els.boundaryText ? els.boundaryText.closest('.boundary-section') : null;
    if (els.boundaryText) {
      if (day.safetyNote) {
        els.boundaryText.textContent = day.safetyNote;
        if (boundarySection) boundarySection.style.display = '';
      } else {
        els.boundaryText.textContent = '';
        if (boundarySection) boundarySection.style.display = 'none';
      }
    }
    const parts = [];
    if (cardMeta) {
      parts.push('适用地区：' + cardMeta.region + ' 最新修订：' + cardMeta.updated + ' 复核日期：' + cardMeta.reviewed);
    }
    if (day.source) parts.push('来源：' + day.source);
    if (day.localNote) parts.push(day.localNote);
    if (els.legalMeta) {
      els.legalMeta.textContent = parts.join(' ');
      els.legalMeta.style.display = parts.length ? '' : 'none';
    }
  };

    const day = getDay(state.day);
    const dimension = getDimension(day);

    els.card.style.setProperty('--accent', '#D9A27F');
    els.card.style.setProperty('--soft', '#332821');
    els.dimensionBlock.style.setProperty('--accent', dimension.color);
    els.dimensionBlock.style.setProperty('--soft', dimension.soft);

    const label = '第 ' + padDay(day.day) + ' 天';
    els.weekLabel.textContent = getWeekLabel(day);
    els.dayNumber.textContent = label;
    els.dayDow.textContent = day.dow;
    els.frontDayNumber.textContent = padDay(day.day);
    els.frontDayDow.textContent = day.dow;
    els.frontTitle.textContent = day.title;
    const hasFrontText = Boolean(day.frontText);
    els.frontText.textContent = day.frontText || '';
    els.frontText.classList.toggle('hidden', !hasFrontText);
    els.frontTitle.classList.toggle('hidden', hasFrontText);
    els.card.classList.toggle('has-front', hasFrontText);
    els.frontQuote.textContent = day.quote;
    els.backDayNumber.textContent = label;
    els.backDow.textContent = day.dow;
    els.backTitle.textContent = day.backTitle || day.title;

    els.dimensionGlyph.textContent = dimension.glyph;
    els.dimensionName.textContent = dimension.name;
    els.dimensionQuestion.textContent = dimension.question;
    els.dimensionIcon.textContent = dimension.glyph;
    els.panelDimensionName.textContent = dimension.name + ' · 制度脉络';
    els.panelDimensionQuestion.textContent = dimension.question;
    els.panelWeekLabel.textContent = day.day === 365
      ? '第365天 · 七条制度脉络'
      : '第' + day.week + '周 · ' + (day.future ? '待发布' : ((day.draft || day.reviewStatus === 'draft') ? '已补写 · 待复核' : '已完成'));

    // 全站开放后，未复核的卡片必须在卡面上直接看得见，不能只靠侧栏。
    const needsReview = Boolean(day.draft) || day.reviewStatus === 'draft';
    document.querySelectorAll('[data-review-badge]').forEach(function (el) {
      el.hidden = !needsReview;
    });

    if (day.review) {
      if (els.knowledgeLabel) els.knowledgeLabel.textContent = '本周地图';
      els.knowledgeText.textContent = day.review;
      els.knowledgeText.style.display = 'block';
      els.relatedLabel.textContent = '思考题';
      els.relatedText.textContent = day.question;
      els.actionLabel.textContent = '下一步行动';
      els.actionText.textContent = day.action || '选一项本周内容，记入你的权利清单。';
      els.actionText.closest('.back-section').style.display = 'block';
      els.relatedText.closest('.back-section').style.display = 'block';
    } else {
      if (els.knowledgeLabel) els.knowledgeLabel.textContent = '制度依据';
      els.knowledgeText.textContent = day.knowledge;
      els.knowledgeText.style.display = 'block';
      els.relatedLabel.textContent = '与我有关';
      els.relatedText.textContent = day.related;
      els.actionLabel.textContent = day.day === 365 ? '今日行动' : (day.future ? '今日准备' : '今日行动');
      els.actionText.textContent = day.action;
      els.relatedText.closest('.back-section').style.display = 'block';
      els.actionText.closest('.back-section').style.display = 'block';
    }

        els.knowledgeWrap.scrollTop = 0;

    renderLegalMeta(day);
    fitContent(els.knowledgeWrap, '.knowledge-text, .back-section p, .back-title, .back-meta, .legal-meta, .aesthetic-note, .aesthetic-quote, .aesthetic-meta');
    fitContent(document.querySelector('.front'), '.front-text, .face-title, .face-quote, .dimension-copy, .day-dow');
    const savedRights = getRights();
    els.saveRightBtn.querySelector('span').textContent = savedRights.some(function (item) { return item.day === state.day; }) ? '已加入权利清单' : '加入权利清单';
    const useful = getUseful();
    const isUseful = Boolean(useful[String(state.day)]);
    if (els.usefulBtn) {
      els.usefulBtn.classList.toggle('is-active', isUseful);
      els.usefulBtn.querySelector('span').textContent = isUseful ? '已标记有用' : '有用';
    }
    if (els.socialProof) {
      const saved = savedRights.some(function (item) { return item.day === state.day; });
      els.socialProof.hidden = false;
      els.socialProof.textContent = saved
        ? '这条已在你的权利清单中，可在下方回看并写下原因。'
        : '收藏这张卡，它会进入下方的“我的权利清单”。';
    }

    els.prevBtn.disabled = state.day <= 1;
    els.nextBtn.disabled = state.day >= data.allDays.length;
    state.flipped = false;
    els.card.classList.remove('flipped');

    renderActiveStates(day);
  };

  const renderActiveStates = function (day) {
    if (!weekListRendered) renderWeekList();

    document.querySelectorAll('.week-item').forEach(function (item) {
      item.classList.toggle('active', Number(item.dataset.week) === day.week);
    });

    // 侧栏是一屏装不下的季度列表（第1–13周这种）：每次换天都把当前周滚进视野。
    const activeWeekItem = els.weekList && els.weekList.querySelector('.week-item.active');
    if (activeWeekItem && els.weekList.scrollHeight > els.weekList.clientHeight + 1) {
      const list = els.weekList;
      const top = activeWeekItem.offsetTop - list.offsetTop - 8;
      list.scrollTop = Math.max(0, Math.min(top, list.scrollHeight - list.clientHeight));
    }

    document.querySelectorAll('.dimension-item').forEach(function (item) {
      item.classList.toggle('active', item.dataset.dimension === day.dimension);
    });

    document.querySelectorAll('.grid-day').forEach(function (cell) {
      cell.classList.toggle('active', Number(cell.dataset.day) === day.day);
    });
  };

  const setDay = function (number) {
    if (number < 1 || number > data.allDays.length) return;
    if (isDayLocked(number)) {
      showPaywall(number);
      return;
    }
    state.day = number;
    writeStorage(STORAGE_KEYS.day, String(number));
    renderCard();
    const wrapTop = els.cardWrap.getBoundingClientRect().top + window.scrollY - 18;
    if (window.matchMedia('(max-width: 640px)').matches) {
      window.scrollTo({ top: wrapTop, behavior: 'smooth' });
    }
  };

  // 只渲染一次（52项全铺），之后换天只切换 .active 并把当前周滚进视野。
  const renderWeekList = function () {
    if (!els.weekList) return;
    els.weekList.innerHTML = '';
    weekListRendered = true;
    const lastWeek = Math.min(52, Math.ceil(getPaidUntilDay() / 7));

    ALL_WEEKS.filter(function (item) { return item <= lastWeek; }).forEach(function (item) {
      const firstDay = (item - 1) * 7 + 1;
      const day = data.allDays.find(function (entry) { return entry.day === firstDay; });
      if (!day) return;
      const dimension = getDimension({ dimension: data.dimensionForWeek(item) });
      const locked = isDayLocked(firstDay);
      // 周状态看整周：只要周内还有待复核的卡，这一周就不能标成“已完成”。
      const pendingReview = data.allDays.some(function (entry) {
        return entry.week === item && (entry.draft || entry.reviewStatus === 'draft');
      });
      const status = locked
        ? '待解锁'
        : (pendingReview ? '已补写待复核' : '已完成');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'week-item' + (locked ? ' locked' : '');
      button.dataset.week = String(item);
      button.style.setProperty('--week-color', dimension.color);
      button.style.setProperty('--week-soft', dimension.soft);
      button.innerHTML =
        '<span class="week-dot" aria-hidden="true"></span>' +
        '<span class="week-item-copy">' +
        '<strong>第' + item + '周</strong>' +
        '<span>' + dimension.name + ' · 制度脉络 · ' + status + '</span>' +
        '</span>';
      button.addEventListener('click', function () {
        if (locked) {
          showPaywall(firstDay);
          return;
        }
        setDay(firstDay);
      });
      els.weekList.appendChild(button);
    });

  };

  const renderDimensionList = function () {
    if (!els.dimensionList) return;
    els.dimensionList.innerHTML = '';
    data.dimensions.forEach(function (dimension, index) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dimension-item';
      item.dataset.dimension = dimension.id;
      item.innerHTML =
        '<span class="dimension-item-glyph" aria-hidden="true">' + dimension.glyph + '</span>' +
        '<span class="dimension-item-copy">' +
        '<strong>' + dimension.name + ' · 制度脉络</strong>' +
        '<span>' + dimension.question + '</span>' +
        '</span>';
      item.addEventListener('click', function () {
        const week = index < 7 ? index * 7 + 1 : 365;
        setDay(week);
      });
      els.dimensionList.appendChild(item);
    });


  };

  const renderGrid = function () {
    data.allDays.filter(function (day) { return day.day <= getPaidUntilDay(); }).forEach(function (day) {
      const dimension = getDimension(day);
      const locked = isDayLocked(day.day);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'grid-day' + (locked ? ' locked' : '');
      cell.dataset.day = String(day.day);
      cell.style.setProperty('--week-color', dimension.color);
      cell.innerHTML =
        '<span class="gd-top">' +
        '<span class="gd-number">' + padDay(day.day) + '</span>' +
        '<span class="gd-dow">' + day.dow + '</span>' +
        '</span>' +
        '<span class="gd-week">第' + day.week + '周</span>' +
        '<p class="gd-title">' + day.title + '</p>' +
        (locked ? '<span class="gd-lock">待解锁</span>' : '');
      cell.addEventListener('click', function () {
        if (locked) {
          showPaywall(day.day);
          return;
        }
        setDay(day.day);
      });
      els.grid.appendChild(cell);
    });
  };

  const renderYear = function () {
    data.yearWeeks.forEach(function (week) {
      const dimension = getDimension({ dimension: week.dimension });
      const item = document.createElement('div');
      item.className = 'year-week' + (week.complete ? '' : ' future');
      item.title = week.label;
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      item.style.setProperty('--week-color', dimension.color);
      item.innerHTML =
        '<span class="yw-week">第' + week.week + '周</span>' +
        '<span class="yw-label">' + (week.complete ? dimension.name + ' · 制度脉络' : '待发布') + '</span>';
      item.addEventListener('click', function () {
        setDay((week.week - 1) * 7 + 1);
      });
      item.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setDay((week.week - 1) * 7 + 1);
        }
      });
      els.yearGrid.appendChild(item);
    });

    const summary = document.createElement('div');
    summary.className = 'overview-summary';
    summary.textContent = '第365天 · 综述：七条制度脉络的整合';
    els.yearGrid.parentNode.appendChild(summary);

    const legend = document.createElement('div');
    legend.className = 'legend';
    data.dimensions.forEach(function (dimension) {
      const item = document.createElement('span');
      item.className = 'legend-item';
      item.innerHTML =
        '<span class="legend-swatch" style="--swatch:' + dimension.color + '" aria-hidden="true"></span>' +
        '<span>' + dimension.name + ' · 制度脉络</span>';
      legend.appendChild(item);
    });
    els.yearGrid.parentNode.appendChild(legend);
  };

  const renderContradictionCard = function () {
    const cardData = data.contradictionCard;
    if (!cardData) return;

    const card = document.createElement('article');
    card.className = 'contradiction-card';

    const head = document.createElement('div');
    head.className = 'contradiction-head';
    const title = document.createElement('h3');
    title.textContent = cardData.title;
    const subtitle = document.createElement('span');
    subtitle.textContent = cardData.subtitle;
    head.append(title, subtitle);
    card.appendChild(head);

    const intro = document.createElement('p');
    intro.className = 'contradiction-intro';
    intro.textContent = cardData.intro;
    card.appendChild(intro);

    const question = document.createElement('p');
    question.className = 'contradiction-question';
    question.textContent = cardData.question;
    card.appendChild(question);

    const prompt = document.createElement('p');
    prompt.className = 'contradiction-prompt';
    prompt.textContent = cardData.prompt;
    card.appendChild(prompt);

    const options = document.createElement('div');
    options.className = 'contradiction-options';
    const response = document.createElement('div');
    response.className = 'contradiction-response hidden';
    const closing = document.createElement('div');
    closing.className = 'contradiction-closing hidden';
    closing.textContent = cardData.closing;

    cardData.options.forEach(function (option) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'contradiction-option';
      const key = document.createElement('span');
      key.className = 'option-key';
      key.textContent = option.key;
      const label = document.createElement('span');
      label.textContent = option.label;
      btn.append(key, label);
      btn.addEventListener('click', function () {
        document.querySelectorAll('.contradiction-option').forEach(function (item) {
          item.classList.remove('selected');
        });
        btn.classList.add('selected');
        response.textContent = option.response;
        response.classList.remove('hidden');
        closing.classList.remove('hidden');
      });
      options.appendChild(btn);
    });
    card.append(options, response, closing);
    els.contradictionWrap.appendChild(card);
  };
  const renderStoryStages = function () {
    if (!data.storyStages) return;
    data.storyStages.forEach(function (stage) {
      const card = document.createElement('article');
      card.className = 'story-card';
      const color = stage.dims.map(function (id) { return getDimension({ dimension: id }); })[0].color;
      card.style.setProperty('--story-color', color);
      const act = document.createElement('span');
      act.className = 'story-act';
      act.textContent = stage.act;
      const name = document.createElement('h3');
      name.textContent = stage.name;
      const line = document.createElement('p');
      line.className = 'story-line';
      line.textContent = stage.line;
      const note = document.createElement('p');
      note.className = 'story-note';
      note.textContent = stage.note;
      const dims = document.createElement('div');
      dims.className = 'story-dims';
      stage.dims.forEach(function (id) {
        const dim = getDimension({ dimension: id });
        const tag = document.createElement('span');
        tag.textContent = dim.name + ' · 制度脉络';
        dims.appendChild(tag);
      });
      card.append(act, name, line, note, dims);
      els.storyGrid.appendChild(card);
    });
  };

  const renderMilestones = function () {
    if (!data.milestones) return;
    data.milestones.forEach(function (milestone) {
      const dim = getDimension({ dimension: milestone.dimension });
      const card = document.createElement('article');
      card.className = 'milestone-card';
      card.style.setProperty('--milestone-color', dim.color);
      // 标题改成每条脉络自己的一句后，卡片上不再自带脉络名，
      // 这里补一个脉络标签，避免只能靠颜色分辨是哪一条。
      const kicker = document.createElement('span');
      kicker.className = 'milestone-kicker';
      kicker.textContent = dim.name + ' · 制度地图';
      const title = document.createElement('h3');
      title.textContent = milestone.title;
      const list = document.createElement('ol');
      milestone.questions.forEach(function (question) {
        const item = document.createElement('li');
        item.textContent = question;
        list.appendChild(item);
      });
      card.append(kicker, title, list);
      els.milestoneGrid.appendChild(card);
    });
  };

  const renderQuarterly = function () {
    if (!data.quarterlyCards) return;
    data.quarterlyCards.forEach(function (quarter) {
      const card = document.createElement('article');
      card.className = 'quarterly-card';
      const title = document.createElement('h3');
      title.textContent = quarter.title;
      const prompt = document.createElement('p');
      prompt.textContent = quarter.prompt;
      const lines = document.createElement('div');
      lines.className = 'quarterly-lines';
      for (let i = 0; i < 3; i++) {
        const line = document.createElement('span');
        line.textContent = '________________________';
        lines.appendChild(line);
      }
      card.append(title, prompt, lines);
      els.quarterlyGrid.appendChild(card);
    });
  };

  const renderMonthly = function () {
    if (!data.monthlyPages) return;
    data.monthlyPages.forEach(function (page) {
      const card = document.createElement('article');
      card.className = 'monthly-card';
      const month = document.createElement('span');
      month.className = 'monthly-month';
      month.textContent = page.month + '月';
      const title = document.createElement('h3');
      title.textContent = page.title;
      const subtitle = document.createElement('p');
      subtitle.className = 'monthly-subtitle';
      subtitle.textContent = page.subtitle;
      const list = document.createElement('ul');
      page.map.forEach(function (item) {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      });
      card.append(month, title, subtitle, list);
      els.monthlyGrid.appendChild(card);
    });
  };


  const saveRightNote = function () {
    if (!els.rightNoteInput || !els.rightNoteBox) return;
    if (pendingRightDay === null) return;
    const list = getRights();
    const item = list.find(function (entry) { return entry.day === pendingRightDay; });
    if (item) item.note = els.rightNoteInput.value.trim();
    saveRights(list);
    els.rightNoteBox.hidden = true;
    pendingRightDay = null;
    renderRights();
    renderCard();
  };


  const applyMode = function (mode) {
    const daily = mode === 'daily';
    document.body.classList.toggle('mode-daily', daily);
    if (els.modeToggle) {
      els.modeToggle.querySelector('span').textContent = daily ? '送礼模式' : '日常模式';
    }
  };

  const toggleMode = function () {
    const daily = document.body.classList.contains('mode-daily');
    applyMode(daily ? 'gift' : 'daily');
  };

  const enterCardPage = function () {
    applyMode('daily');
    const card = document.getElementById('card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const showPaywall = function (targetDay) {
    if (isUnlocked()) {
      if (targetDay) setDay(targetDay);
      return;
    }
    const paywall = document.getElementById('paywall');
    if (!paywall) return;
    const title = document.getElementById('paywallTitle');
    if (title) title.textContent = targetDay ? (targetDay > 56 ? '第 ' + targetDay + ' 天需要解锁全年内容' : (targetDay > 28 ? '第 ' + targetDay + ' 天需要解锁第二个月体验' : '首月28天免费开放，9.9元继续第二个月')) : '解锁全年内容';
    const badge = document.getElementById('paywallDayBadge');
    if (badge && targetDay) badge.textContent = String(targetDay).padStart(2, '0');
    const status = document.getElementById('paywallStatus');
    if (status) status.textContent = '';
    const copy = document.getElementById('paywallCopy');
    if (copy) copy.textContent = '在线下单，付款确认后自动生成解锁码。9.9元继续第二个月（第29-56天权限）；99元全年数字版按复核进度开放，未复核内容不提前放出。';
    const price = document.getElementById('paywallPrice');
    if (price) price.textContent = launch.trialPrice + ' · ' + launch.trialLabel + ' / ' + launch.digitalPrice + ' · ' + launch.digitalLabel;
    const delivery = document.getElementById('paywallDelivery');
    if (delivery) delivery.textContent = launch.delivery + ' ' + launch.refund;
    const buy = document.getElementById('paywallBuy');
    if (buy) buy.textContent = launch.buyLabel;
    paywall.hidden = false;
    document.body.classList.add('paywall-open');
  };

  const closePaywall = function () {
    const paywall = document.getElementById('paywall');
    if (paywall) paywall.hidden = true;
    document.body.classList.remove('paywall-open');
  };

  const submitUnlockCode = async function () {
    const input = document.getElementById('unlockInput');
    const status = document.getElementById('paywallStatus');
    const code = (input ? input.value : '').trim().toUpperCase();
    if (!code) {
      if (status) status.textContent = '请输入解锁码。';
      return;
    }
    if (status) status.textContent = '正在验证解锁码...';
    try {
      const response = await fetch('/api/verify-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code })
      });
      const result = await response.json();
      if (!result.ok) {
        if (status) status.textContent = result.message || '解锁失败，请稍后重试。';
        return;
      }
    } catch (error) {
      if (status) status.textContent = '无法连接解锁服务，请稍后重试。';
      return;
    }
    writeStorage(UNLOCK_KEY, '1');
    writeStorage('tazhi_used_unlock_code', code);
    writeStorage('tazhi_envelope_seen', '1');
    if (status) status.textContent = '解锁成功，正在打开全年内容。';
    setTimeout(function () { location.reload(); }, 500);
  };

  const toggleLightMode = function () {
    const light = document.body.classList.toggle('light-mode');
    els.lightModeBtn.querySelector('span').textContent = light ? '完整模式' : '轻模式';
    if (light) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleLargeMode = function () {
    const large = document.body.classList.toggle('large-text');
    els.largeModeBtn.querySelector('span').textContent = large ? '标准' : '大字';
    writeStorage('tazhi_large', large ? '1' : '0');
    renderCard();
  };

  const captureCardFace = async function (faceName, scale) {
    const source = document.getElementById('card');
    if (!source || !window.html2canvas) return null;
    const host = document.createElement('div');
    host.className = 'share-capture-host';
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:600px;z-index:-1;';
    const clone = source.cloneNode(true);
    clone.id = 'card-capture';
    clone.classList.remove('flipped');
    clone.style.width = '400px';
    clone.style.height = '600px';
    clone.style.aspectRatio = 'auto';
    clone.style.position = 'relative';
    clone.style.cursor = 'default';
    const inner = clone.querySelector('.card-inner');
    if (inner) {
      inner.style.transform = 'none';
      inner.style.position = 'relative';
      inner.style.width = '400px';
      inner.style.height = '600px';
    }
    clone.querySelectorAll('.face').forEach(function (face) {
      face.style.position = 'absolute';
      face.style.inset = '0';
      face.style.width = '400px';
      face.style.height = '600px';
      if (face.classList.contains('back')) face.style.transform = 'none';
      if (face.classList.contains(faceName)) {
        face.style.display = 'flex';
        face.style.visibility = 'visible';
      } else {
        face.style.display = 'none';
      }
    });
    host.appendChild(clone);
    document.body.appendChild(host);
    try {
      return await window.html2canvas(clone, { scale: scale || 2, backgroundColor: null, useCORS: true });
    } finally {
      host.remove();
    }
  };

  const shareCard = async function () {
    const day = getDay(state.day);
    const dim = getDimension(day);
    if (window.html2canvas) {
      try {
        const front = await captureCardFace('front');
        const back = await captureCardFace('back');
        if (front && back) {
          const canvas = document.createElement('canvas');
          canvas.width = front.width * 2 + 36;
          canvas.height = front.height + 36;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#211C18';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#F7ECDD';
          ctx.font = '600 20px "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('正面', front.width / 2 + 18, 26);
          ctx.fillText('背面', front.width + front.width / 2 + 18, 26);
          ctx.drawImage(front, 18, 36);
          ctx.drawImage(back, front.width + 18, 36);
          const a = document.createElement('a');
          a.href = canvas.toDataURL('image/png');
          a.download = 'tazhi-front-back-' + padDay(day.day) + '.png';
          document.body.appendChild(a);
          a.click();
          a.remove();
          return;
        }
      } catch (error) {}
    }
    const canvas = document.createElement('canvas');
    canvas.width = 750;
    canvas.height = 1125;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#211C18';
    ctx.fillRect(0, 0, 750, 1125);
    ctx.fillStyle = '#D9A27F';
    ctx.fillRect(0, 0, 750, 14);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#F7ECDD';
    ctx.font = '600 22px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(dim.name + ' · 制度脉络', 64, 70);
    ctx.fillStyle = '#D9A27F';
    ctx.textAlign = 'center';
    ctx.font = 'bold 110px Georgia, serif';
    ctx.fillText(padDay(day.day), 375, 230);
    ctx.fillStyle = '#B6A18D';
    ctx.font = '22px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(day.dow, 375, 280);
    ctx.fillStyle = '#F7ECDD';
    ctx.font = '600 30px "Microsoft YaHei", "PingFang SC", sans-serif';
    const titleLines = day.title.length > 28 ? [day.title.slice(0, 28), day.title.slice(28)] : [day.title];
    titleLines.forEach(function (line, index) {
      ctx.fillText(line, 375, 380 + index * 46);
    });
    ctx.strokeStyle = '#A9896C';
    ctx.beginPath();
    ctx.moveTo(120, 540);
    ctx.lineTo(630, 540);
    ctx.stroke();
    ctx.fillStyle = '#D9A27F';
    ctx.font = '22px "Kaiti SC", "KaiTi", serif';
    const quoteLines = day.quote.length > 32 ? [day.quote.slice(0, 32), day.quote.slice(32)] : [day.quote];
    quoteLines.forEach(function (line, index) {
      ctx.fillText(line, 375, 610 + index * 38);
    });
    ctx.fillStyle = '#B6A18D';
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillText('她知 · 底气礼物', 375, 1020);
    ctx.fillText('看得懂制度，才有真正的底气。', 375, 1050);
    ctx.strokeStyle = '#A7342E';
    ctx.lineWidth = 2;
    ctx.strokeRect(600, 930, 44, 44);
    ctx.fillStyle = '#A7342E';
    ctx.font = '600 18px Kaiti SC, KaiTi, serif';
    ctx.fillText('她知', 622, 958);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'tazhi-day-' + padDay(day.day) + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };


  const shareGifCard = async function () {
    if (!window.html2canvas || !window.GIF) {
      shareCard();
      return;
    }
    const day = getDay(state.day);
    try {
      const front = await captureCardFace('front', 1);
      const back = await captureCardFace('back', 1);
      if (!front || !back) {
        shareCard();
        return;
      }
      const gif = new window.GIF({
        workers: 2,
        quality: 10,
        width: front.width,
        height: front.height,
        workerScript: 'gif.worker.js'
      });
      const mixFrame = function (from, to, progress) {
        const canvas = document.createElement('canvas');
        canvas.width = from.width;
        canvas.height = from.height;
        const ctx = canvas.getContext('2d');
        ctx.globalAlpha = 1 - progress;
        ctx.drawImage(from, 0, 0);
        ctx.globalAlpha = progress;
        ctx.drawImage(to, 0, 0);
        return canvas;
      };
      gif.addFrame(front, { delay: 900 });
      gif.addFrame(mixFrame(front, back, 0.33), { delay: 140 });
      gif.addFrame(mixFrame(front, back, 0.66), { delay: 140 });
      gif.addFrame(back, { delay: 1200 });
      gif.addFrame(mixFrame(back, front, 0.66), { delay: 140 });
      gif.addFrame(mixFrame(back, front, 0.33), { delay: 140 });
      gif.addFrame(front, { delay: 900 });
      gif.on('finished', function (blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'tazhi-animated-' + padDay(day.day) + '.gif';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      });
      gif.on('error', function (message) {
        console.error('GIF error', message);
        shareCard();
      });
      gif.render();
    } catch (error) {
      console.error('GIF error', error);
      shareCard();
    }
  };


  const toggleFlip = function () {
    state.flipped = !state.flipped;
    els.card.classList.toggle('flipped', state.flipped);
  };

  els.card.addEventListener('click', function () {
    toggleFlip();
  });

  els.card.addEventListener('keydown', function (event) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggleFlip();
    }
  });

  els.flipBtn.addEventListener('click', toggleFlip);
  els.prevBtn.addEventListener('click', function () { setDay(state.day - 1); });
  els.nextBtn.addEventListener('click', function () { setDay(state.day + 1); });
  els.printBtn.addEventListener('click', function () { window.print(); });
  els.sceneSearch.addEventListener('input', runSearch);
  els.todayBtn.addEventListener('click', goToday);
  els.saveRightBtn.addEventListener('click', toggleRight);
  if (els.usefulBtn) els.usefulBtn.addEventListener('click', toggleUseful);
  if (els.rightNoteSave) els.rightNoteSave.addEventListener('click', saveRightNote);
  els.shareBtn.addEventListener('click', shareGifCard);
  const shareGifBtn = document.getElementById('shareGifBtn');
  if (shareGifBtn) shareGifBtn.addEventListener('click', shareGifCard);
  els.lightModeBtn.addEventListener('click', toggleLightMode);
  els.largeModeBtn.addEventListener('click', toggleLargeMode);
  if (els.modeToggle) els.modeToggle.addEventListener('click', toggleMode);
  window.enterCardPage = enterCardPage;
  const paywallClose = document.getElementById('paywallClose');
  if (paywallClose) paywallClose.addEventListener('click', closePaywall);
  const paywallBackdrop = document.getElementById('paywallBackdrop');
  if (paywallBackdrop) paywallBackdrop.addEventListener('click', closePaywall);
  const paywallBuy = document.getElementById('paywallBuy');
  if (paywallBuy) paywallBuy.addEventListener('click', function () {
    window.location.href = 'checkout.html?sku=full365';
  });
  const trial9Btn = document.getElementById('trial9Btn');
  if (trial9Btn) trial9Btn.addEventListener('click', function () { window.location.href = 'checkout.html?sku=trial28'; });
  const unlockSubmit = document.getElementById('unlockSubmit');
  if (unlockSubmit) unlockSubmit.addEventListener('click', submitUnlockCode);
  const unlockInput = document.getElementById('unlockInput');
  if (unlockInput) unlockInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') submitUnlockCode();
  });
  document.addEventListener('keydown', function (event) {
    if (event.target.matches('input, textarea')) return;
    if (event.key === 'ArrowLeft') setDay(state.day - 1);
    if (event.key === 'ArrowRight') setDay(state.day + 1);
    if (event.key === 'Escape') closePaywall();
  });

  const unlocked = isUnlocked();
  if (!unlocked) document.body.classList.add('trial-free');
  if (unlocked) {
    document.body.classList.add('trial-unlocked');
    const gridHeading = document.querySelector('.grid-section h2');
    if (gridHeading) gridHeading.textContent = '全部卡片 · 365天目录';
    const gridCaption = document.getElementById('gridCaption');
    if (gridCaption) gridCaption.textContent = '点任意一天直接翻到 · 前49天已完成人工复核';
  }
  renderWeekList();
  renderDimensionList();
  restoreProgress();
  applyMode('gift');
  if (readStorage('tazhi_large', '') === '1') {
    document.body.classList.add('large-text');
    els.largeModeBtn.querySelector('span').textContent = '标准';
  }
  renderRights();
  renderGrid();
  renderCard();
  if (unlocked) {
    renderYear();
    // content-layer.js + content-experience.js 会整块重写这两个容器，
    // 有它的时候不再重复渲染 data 里的版本，避免出现两套矛盾卡/季度卡。
    const contentLayer = window.CALENDAR_CONTENT_LAYER;
    if (!(contentLayer && contentLayer.monthlyContradictions)) renderContradictionCard();
    renderStoryStages();
    renderMilestones();
    if (!(contentLayer && contentLayer.quarterlySelfDialogue)) renderQuarterly();
    renderMonthly();
  }
})();
