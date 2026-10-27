(function () {
  const content = window.CALENDAR_CONTENT_LAYER;
  const data = window.CALENDAR_DATA;
  if (!content || !data) return;

  const KEYS = {
    envelopeSeen: 'tazhi_envelope_seen',
    contradictionAnswers: 'tazhi_contradiction_answers',
    contradictionCurrent: 'tazhi_contradiction_current',
    quarterNotes: 'tazhi_quarter_notes',
    quarterCurrent: 'tazhi_quarter_current'
  };

  const read = function (key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  };

  const write = function (key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {}
  };

  const $ = function (selector) {
    return document.querySelector(selector);
  };

  const escapeHtml = function (value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch];
    });
  };

  const contradictionAnswers = read(KEYS.contradictionAnswers, {});
  let contradictionCurrent = Number(read(KEYS.contradictionCurrent, 1)) || 1;
  const quarterNotes = read(KEYS.quarterNotes, {});
  let quarterCurrent = Number(read(KEYS.quarterCurrent, 1)) || 1;

  const updateHeadings = function () {
    const contradictionHeading = $('.contradiction-section .section-heading h2');
    const contradictionSub = $('.contradiction-section .section-heading span');
    if (contradictionHeading) contradictionHeading.textContent = '每月矛盾卡';
    if (contradictionSub) contradictionSub.textContent = '不选也可以 · 每月一张';

    const quarterHeading = $('.quarterly-section .section-heading h2');
    const quarterSub = $('.quarterly-section .section-heading span');
    if (quarterHeading) quarterHeading.textContent = '季度自我对话';
    if (quarterSub) quarterSub.textContent = '回看90天 · 不急着答完';
  };

  const renderContradiction = function () {
    const wrap = $('#contradictionWrap');
    if (!wrap) return;
    const card = content.monthlyContradictions[contradictionCurrent - 1];
    if (!card) return;
    const selected = contradictionAnswers[card.id];

    wrap.innerHTML =
      '<div class="monthly-card-layer">' +
      '<div class="monthly-nav">' +
      '<button type="button" data-month-prev>上一月</button>' +
      '<span>第 ' + contradictionCurrent + ' / 12月</span>' +
      '<button type="button" data-month-next>下一月</button>' +
      '</div>' +
      '<article class="contradiction-experience">' +
      '<span class="month-badge">第 ' + card.month + ' 月 · 矛盾卡</span>' +
      '<h3>' + escapeHtml(card.title) + '</h3>' +
      '<p class="subtitle">' + escapeHtml(card.subtitle) + '</p>' +
      '<p class="intro">' + escapeHtml(card.intro) + '</p>' +
      '<p class="question">' + escapeHtml(card.question) + '</p>' +
      '<div class="contradiction-options">' +
      card.options.map(function (option, index) {
        return '<button type="button" data-option="' + index + '">' +
          '<strong>' + option.key + '.</strong> ' + escapeHtml(option.label) +
          '</button>';
      }).join('') +
      '</div>' +
      (selected
        ? '<div class="contradiction-answer">' + escapeHtml(selected.response) + '<span class="closing">' + escapeHtml(card.closing) + '</span></div>'
        : '') +
      '</article>' +
      '</div>';

    wrap.querySelectorAll('[data-option]').forEach(function (button) {
      button.addEventListener('click', function () {
        const option = card.options[Number(button.getAttribute('data-option'))];
        if (!option) return;
        contradictionAnswers[card.id] = option;
        write(KEYS.contradictionAnswers, contradictionAnswers);
        renderContradiction();
      });
    });

    const prev = wrap.querySelector('[data-month-prev]');
    const next = wrap.querySelector('[data-month-next]');
    if (prev) prev.addEventListener('click', function () {
      contradictionCurrent = contradictionCurrent > 1 ? contradictionCurrent - 1 : 12;
      write(KEYS.contradictionCurrent, contradictionCurrent);
      renderContradiction();
    });
    if (next) next.addEventListener('click', function () {
      contradictionCurrent = contradictionCurrent < 12 ? contradictionCurrent + 1 : 1;
      write(KEYS.contradictionCurrent, contradictionCurrent);
      renderContradiction();
    });
  };

  const renderQuarterly = function () {
    const wrap = $('#quarterlyGrid');
    if (!wrap) return;
    const card = content.quarterlySelfDialogue[quarterCurrent - 1];
    if (!card) return;
    const notes = quarterNotes[card.id] || [];

    wrap.innerHTML =
      '<div class="quarterly-experience">' +
      '<div class="quarterly-tabs">' +
      content.quarterlySelfDialogue.map(function (item, index) {
        return '<button type="button" data-quarter="' + index + '" class="' + (index === quarterCurrent - 1 ? 'active' : '') + '">第 ' + (index + 1) + ' 季度</button>';
      }).join('') +
      '</div>' +
      '<div class="quarterly-panel">' +
      '<h3>' + escapeHtml(card.title) + '</h3>' +
      '<p>' + escapeHtml(card.subtitle) + '<br>' + escapeHtml(card.intro) + '</p>' +
      '<p>' + escapeHtml(card.prompt) + '</p>' +
      '<ol class="quarterly-questions">' +
      card.questions.map(function (question, index) {
        return '<li>' +
          '<strong>' + escapeHtml(question) + '</strong>' +
          '<textarea data-question="' + index + '" placeholder="写一句也行">' + escapeHtml(notes[index] || '') + '</textarea>' +
          '</li>';
      }).join('') +
      '</ol>' +
      '</div>' +
      '</div>';

    wrap.querySelectorAll('[data-quarter]').forEach(function (button) {
      button.addEventListener('click', function () {
        quarterCurrent = Number(button.getAttribute('data-quarter')) + 1;
        write(KEYS.quarterCurrent, quarterCurrent);
        renderQuarterly();
      });
    });

    wrap.querySelectorAll('textarea[data-question]').forEach(function (textarea) {
      textarea.addEventListener('input', function () {
        const list = quarterNotes[card.id] || [];
        list[Number(textarea.getAttribute('data-question'))] = textarea.value;
        quarterNotes[card.id] = list;
        write(KEYS.quarterNotes, quarterNotes);
      });
    });
  };

  const showModal = function (modal) {
    if (modal) modal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  const hideModal = function (modal) {
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  };

  const buildEnvelope = function () {
    const modal = document.createElement('div');
    modal.id = 'envelopeModal';
    modal.className = 'experience-modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="experience-modal-card">' +
      '<h2>' + escapeHtml(content.envelope.title) + '</h2>' +
      '<p>' + escapeHtml(content.envelope.text) + '</p>' +
      '<p class="modal-note">' + escapeHtml(content.envelope.note) + '</p>' +
      '<div class="experience-modal-actions">' +
      '<button type="button" data-envelope-close>封存，开始第1天</button>' +
      '<a class="ghost" href="#card" data-envelope-card>打开365天日历</a>' +
      '</div>' +
      '</div>';
    document.body.appendChild(modal);

    const close = function () {
      write(KEYS.envelopeSeen, true);
      hideModal(modal);
    };
    modal.querySelector('[data-envelope-close]').addEventListener('click', close);
    modal.querySelector('[data-envelope-card]').addEventListener('click', close);
    modal.addEventListener('click', function (event) {
      if (event.target === modal) close();
    });

    const actions = $('.card-actions');
    if (actions) {
      const reopen = document.createElement('button');
      reopen.type = 'button';
      reopen.className = 'action-btn toolbar-secondary';
      reopen.id = 'envelopeReopenBtn';
      reopen.textContent = '扉页';
      reopen.addEventListener('click', function () { showModal(modal); });
      const rightNoteBox = $('#rightNoteBox');
      if (rightNoteBox) {
        actions.insertBefore(reopen, rightNoteBox);
      } else {
        actions.appendChild(reopen);
      }
    }

    const shouldShow = window.location.search.indexOf('envelope=1') >= 0;
    if (shouldShow) showModal(modal);
  };

  const buildFinalMirror = function () {
    const modal = document.createElement('div');
    modal.id = 'finalMirrorModal';
    modal.className = 'experience-modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="experience-modal-card dark">' +
      '<h2>' + escapeHtml(content.finalMirror.title) + '</h2>' +
      '<p>' + escapeHtml(content.finalMirror.text) + '</p>' +
      '<p>' + escapeHtml(content.finalMirror.prompt) + '</p>' +
      '<p class="modal-note">' + escapeHtml(content.finalMirror.shareLine) + '</p>' +
      '<div class="experience-modal-actions">' +
      '<button type="button" data-mirror-share>生成卡片翻面动图</button>' +
      '<button type="button" class="ghost" data-mirror-close>关闭</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelector('[data-mirror-close]').addEventListener('click', function () {
      hideModal(modal);
    });
    modal.querySelector('[data-mirror-share]').addEventListener('click', generateMirrorShare);
    modal.addEventListener('click', function (event) {
      if (event.target === modal) hideModal(modal);
    });

    const actions = $('.card-actions');
    if (actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-btn toolbar-secondary';
      btn.id = 'finalMirrorBtn';
      btn.textContent = '第365天';
      btn.addEventListener('click', function () { showModal(modal); });
      const rightNoteBox = $('#rightNoteBox');
      if (rightNoteBox) {
        actions.insertBefore(btn, rightNoteBox);
      } else {
        actions.appendChild(btn);
      }
    }
  };

  const wrapCanvasText = function (ctx, text, maxWidth) {
    const lines = [];
    let current = '';
    for (const ch of String(text)) {
      if (ctx.measureText(current + ch).width > maxWidth && current) {
        lines.push(current);
        current = ch;
      } else {
        current += ch;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

        const captureActualFace = async function (faceName) {
    const source = document.getElementById('card');
    if (!source || !window.html2canvas) return null;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:600px;z-index:-1;';
    const clone = source.cloneNode(true);
    clone.id = 'card-capture';
    clone.classList.remove('flipped');
    clone.style.width = '400px';
    clone.style.height = '600px';
    clone.style.aspectRatio = 'auto';
    clone.style.position = 'relative';
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
      return await window.html2canvas(clone, { scale: 1.5, backgroundColor: null, useCORS: true });
    } finally {
      host.remove();
    }
  };

  const mixCardFrame = function (from, to, progress) {
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

  const generatePngShare = async function () {
    const back = await captureActualFace('back');
    if (!back) return;
    const a = document.createElement('a');
    a.href = back.toDataURL('image/png');
    a.download = '她知-卡片翻面.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const generateGifShare = async function () {
    const front = await captureActualFace('front');
    const back = await captureActualFace('back');
    if (!front || !back) {
      generatePngShare();
      return;
    }
    const gif = new window.GIF({
      workers: 2,
      quality: 10,
      width: front.width,
      height: front.height,
      workerScript: 'gif.worker.js'
    });
    const frames = [
      { canvas: front, delay: 800 },
      { canvas: mixCardFrame(front, back, 0.33), delay: 140 },
      { canvas: mixCardFrame(front, back, 0.66), delay: 140 },
      { canvas: back, delay: 1400 },
      { canvas: mixCardFrame(back, front, 0.66), delay: 140 },
      { canvas: mixCardFrame(back, front, 0.33), delay: 140 },
      { canvas: front, delay: 900 }
    ];
    frames.forEach(function (frame) {
      gif.addFrame(frame.canvas, { delay: frame.delay });
    });
    gif.on('finished', function (blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '她知-卡片翻面.gif';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    gif.on('error', function (message) {
      console.error('GIF error', message);
      generatePngShare();
    });
    gif.render();
  };

  const generateMirrorShare = function () {
    if (window.GIF && window.html2canvas) {
      generateGifShare();
      return;
    }
    generatePngShare();
  };
  updateHeadings();
  const buildToolbarMore = function () {
    const btn = document.getElementById('moreToolsBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      const open = document.body.classList.toggle('toolbar-more-open');
      btn.classList.toggle('active', open);
    });
  };
  buildToolbarMore();
  renderContradiction();
  renderQuarterly();
  buildEnvelope();
  buildFinalMirror();
})();
