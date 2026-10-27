(function () {
  const data = window.CALENDAR_DATA;
  const root = document.getElementById('toolsRoot');
  if (!data || !root) return;

  const WEEK_NOTES_KEY = 'tazhi_week_notes';
  const MAP_KEY = 'tazhi_map_notes';
  const ACTIVE_KEY = 'tazhi_tool_active';

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

  const weekNotes = read(WEEK_NOTES_KEY, {});
  const dayQuestions = window.TAZHI_DAILY_QUESTIONS || {};
  const finalQuestions = window.TAZHI_FINAL_QUESTIONS || {};
  const mapNotes = read(MAP_KEY, {});
  let activeTool = read(ACTIVE_KEY, 'guide');
  let weekQuarterCurrent = Number(read('tazhi_week_quarter', 1)) || 1;

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

  const getDimension = function (id) {
    return data.dimensions.find(function (item) { return item.id === id; }) || data.dimensions[0];
  };

  const questionTemplates = [
    function (t) { return '看完「' + t + '」，你最想弄清楚的一个制度问题是？'; },
    function (t) { return '看完「' + t + '」，你最不确定的一条规则是什么？'; },
    function (t) { return '如果「' + t + '」真的能保护你，你最希望它先用在哪个场景？'; },
    function (t) { return '「' + t + '」里，哪一件事值得你今天亲自验证？'; },
    function (t) { return '关于「' + t + '」，你最想和别人讨论的一个问题是？'; },
    function (t) { return '如果「' + t + '」从今天开始更透明，你会先做什么？'; },
    function (t) { return '「' + t + '」给你留下最强烈感受的是哪一句话？'; }
  ];

  // 手写题库按「维度 + 先后」摊到52周：同一维度里的第 k 题，落到第 k 个属于该维度的周。
  // 一周一个问题；没摊到题的周退回按标题生成的通用问题。
  const weekQuestions = (function () {
    const pools = {};
    Object.keys(dayQuestions).map(Number).sort(function (a, b) { return a - b; }).forEach(function (day) {
      const card = (data.completeDays || []).find(function (item) { return item.day === day; });
      if (!card) return;
      if (!pools[card.dimension]) pools[card.dimension] = [];
      pools[card.dimension].push(dayQuestions[day]);
    });
    const cursor = {};
    const map = {};
    for (let week = 1; week <= 52; week += 1) {
      if (finalQuestions[week]) { map[week] = finalQuestions[week]; continue; }
      const id = data.dimensionForWeek(week);
      const pool = pools[id] || [];
      const index = cursor[id] || 0;
      if (pool[index] !== undefined) {
        map[week] = pool[index];
        cursor[id] = index + 1;
      }
    }
    return map;
  })();

  const getWeekQuestion = function (week) {
    if (weekQuestions[week]) return weekQuestions[week];
    const card = (data.allDays || []).find(function (item) { return Number(item.week) === Number(week); });
    const topic = card ? String(card.title || '').split(/[：:]/)[0].trim() : '';
    if (topic) return questionTemplates[(week - 1) % questionTemplates.length](topic);
    return '这一周，你最想弄清楚的一个制度问题是什么？';
  };

  const copyText = function (text, button) {
    const done = function () {
      const old = button.textContent;
      button.textContent = '已复制';
      setTimeout(function () { button.textContent = old; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text);
        done();
      });
      return;
    }
    fallbackCopy(text);
    done();
  };

  const fallbackCopy = function (text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (error) {}
    textarea.remove();
  };

  const getRightsCount = function () {
    try {
      const raw = JSON.parse(window.localStorage.getItem('tazhi_rights') || '[]');
      return Array.isArray(raw) ? raw.length : 0;
    } catch (error) {
      return 0;
    }
  };

  const renderGuide = function (panel) {
    panel.innerHTML =
      '<div class="tool-block">' +
      '<h3>这本日历可以帮你</h3>' +
      '<div class="tool-grid">' +
      '<div class="tool-card"><strong>每天1分钟</strong><span>了解一个制度知识点。</span></div>' +
      '<div class="tool-card"><strong>一年后构建体系</strong><span>从历史、宪法、法律、政策到组织、参与、行动。</span></div>' +
      '<div class="tool-card"><strong>收集求助入口</strong><span>重要热线、维权工具和申请路径。</span></div>' +
      '<div class="tool-card"><strong>找到参与入口</strong><span>投票、议事、意见征集和公共表达。</span></div>' +
      '</div>' +
      '<h3>怎么用</h3>' +
      '<div class="tool-grid">' +
      '<div class="tool-card"><strong>每天翻开一张卡</strong><span>正面看日期和主题，背面读知识点。</span></div>' +
      '<div class="tool-card"><strong>每周日做回顾</strong><span>用思考题回看一周内容，写下你的回答。</span></div>' +
      '<div class="tool-card"><strong>把有用的内容留下</strong><span>加入权利清单，或分享给重要的人。</span></div>' +
      '<div class="tool-card"><strong>把重要号码存好</strong><span>存进通讯录，也放进手机壁纸。</span></div>' +
      '</div>' +
      '<div class="tools-note">它不替你下结论，也不保证改变命运；它只是把制度变成你能用起来的东西。</div>' +
      '</div>';
  };

  const renderNumbers = function (panel) {
    const numbers = [
      {
        num: '12338',
        name: '妇女维权公益服务',
        desc: '妇女权益、婚姻家庭、维权咨询等求助入口。',
        place: '存进手机通讯录'
      },
      {
        num: '12348',
        name: '法律援助',
        desc: '法律咨询和符合条件时的法律援助申请入口。',
        place: '存进手机通讯录'
      },
      {
        num: '12333',
        name: '人力资源社会保障服务热线',
        desc: '社保、劳动权益、劳动关系等咨询入口。',
        place: '存在办公桌或手机里'
      },
      {
        num: '12345',
        name: '政务服务便民热线',
        desc: '政务服务咨询、投诉和建议入口。',
        place: '存在手机通讯录'
      }
    ];
    panel.innerHTML =
      '<div class="tool-block">' +
      '<h3>重要号码速查</h3>' +
      '<div class="number-row">' +
      numbers.map(function (item) {
        return '<div class="number-card">' +
          '<span class="num">' + item.num + '</span>' +
          '<span class="name">' + escapeHtml(item.name) + '</span>' +
          '<p>' + escapeHtml(item.desc) + '<br>' + escapeHtml(item.place) + '</p>' +
          '<div class="number-actions">' +
          '<a href="tel:' + item.num + '">拨打</a>' +
          '<button type="button" data-copy="' + item.num + '">复制号码</button>' +
          '</div>' +
          '</div>';
      }).join('') +
      '</div>' +
      '<div class="tools-note">不同地区接听时间和服务范围可能不同，以当地最新口径为准。</div>' +
      '</div>';
    panel.querySelectorAll('[data-copy]').forEach(function (button) {
      button.addEventListener('click', function () {
        copyText(button.getAttribute('data-copy'), button);
      });
    });
  };

  const renderMap = function (panel) {
    const dimensions = data.dimensions.filter(function (item) { return item.id !== 'overview'; });
    panel.innerHTML =
      '<div class="tool-block">' +
      '<h3>我的认知地图</h3>' +
      '<p>七个维度分别回看，写下你的疑问、感悟和下一步。目前你的权利清单中有 <strong>' + getRightsCount() + '</strong> 条记录。</p>' +
      '<div class="map-grid">' +
      dimensions.map(function (dim) {
        return '<div class="map-node">' +
          '<span class="glyph">' + escapeHtml(dim.glyph) + '</span>' +
          '<strong>' + escapeHtml(dim.name) + '</strong>' +
          '<span>' + escapeHtml(dim.question) + '</span>' +
          '<textarea data-map="' + escapeHtml(dim.id) + '" placeholder="写下你的记录">' + escapeHtml(mapNotes[dim.id] || '') + '</textarea>' +
          '</div>';
      }).join('') +
      '</div>' +
      '<div class="tools-note">不用一次填完。每看过一个维度，回来补一句就够了。</div>' +
      '</div>';
    panel.querySelectorAll('textarea[data-map]').forEach(function (textarea) {
      textarea.addEventListener('input', function () {
        mapNotes[textarea.getAttribute('data-map')] = textarea.value;
        write(MAP_KEY, mapNotes);
      });
    });
  };

    const renderWeeks = function (panel) {
    const start = (weekQuarterCurrent - 1) * 13 + 1;
    const rows = Array.from({ length: 13 }, function (_, index) {
      const week = start + index;
      const dim = getDimension(data.dimensionForWeek(week));
      return '<tr>' +
        '<td class="week-cell">第 ' + week + ' 周</td>' +
        '<td class="dim-cell">' + escapeHtml(dim.name) + '</td>' +
        '<td>' + escapeHtml(getWeekQuestion(week)).replace(/\n/g, '<br>') + '</td>' +
        '<td><input type="text" data-week="' + week + '" value="' + escapeHtml(weekNotes[week] || '') + '" placeholder="写下你的回答"></td>' +
        '</tr>';
    }).join('');
    panel.innerHTML =
      '<div class="tool-block">' +
      '<h3>52周思考记录</h3>' +
      '<p>每季度一页，一次只看13周。一周一个问题，写一句也算完成。</p>' +
      '<div class="quarterly-tabs">' +
      [1, 2, 3, 4].map(function (quarter) {
        return '<button type="button" data-week-quarter="' + quarter + '" class="' + (quarter === weekQuarterCurrent ? 'active' : '') + '">第 ' + quarter + ' 季度</button>';
      }).join('') +
      '</div>' +
      '<div class="week-table-wrap"><table class="week-table"><thead><tr><th>周</th><th>维度</th><th>思考题</th><th>我的回答</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div>' +
      '<div class="tools-note">没写完整也没关系。记录不是为了完美，是为了看见自己在想什么。</div>' +
      '</div>';
    panel.querySelectorAll('[data-week-quarter]').forEach(function (button) {
      button.addEventListener('click', function () {
        weekQuarterCurrent = Number(button.getAttribute('data-week-quarter'));
        write('tazhi_week_quarter', weekQuarterCurrent);
        renderWeeks(panel);
      });
    });
    panel.querySelectorAll('input[data-week]').forEach(function (input) {
      input.addEventListener('input', function () {
        weekNotes[input.getAttribute('data-week')] = input.value;
        write(WEEK_NOTES_KEY, weekNotes);
      });
    });
  };

const getRightsList = function () {
    try {
      const raw = JSON.parse(window.localStorage.getItem('tazhi_rights') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (error) {
      return [];
    }
  };

  const exportRights = function () {
    const list = getRightsList();
    const lines = list.map(function (item) {
      const day = item.day ? '第 ' + item.day + ' 天' : '';
      const note = item.note ? '：' + item.note : '';
      return (day ? day + ' ' : '') + (item.title || '') + note;
    }).filter(Boolean);
    const text = '我的权利清单\n' + (lines.length ? lines.join('\n') : '（暂无记录）');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '我的权利清单.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };

  const printRights = function () {
    const list = getRightsList();
    const lines = list.map(function (item) {
      const day = item.day ? '第 ' + item.day + ' 天' : '';
      const note = item.note ? '：' + item.note : '';
      return (day ? day + ' ' : '') + (item.title || '') + note;
    }).filter(Boolean);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write('<html><head><meta charset="utf-8"><title>我的权利清单</title></head><body><h1>我的权利清单</h1></body></html>');
    const pre = win.document.createElement('pre');
    pre.textContent = lines.length ? lines.join('\n') : '（暂无记录）';
    win.document.body.appendChild(pre);
    win.document.close();
    win.print();
  };

  const renderFiles = function (panel) {
    const checklistKey = 'tazhi_file_checklist';
    const checklist = read(checklistKey, {});
    const files = [
      { id: 'id', label: '身份证', note: '确认在有效期内' },
      { id: 'household', label: '户口本', note: '核对家庭成员与婚姻状态' },
      { id: 'contract', label: '劳动合同', note: '检查是否完整、是否盖章' },
      { id: 'salary', label: '工资流水', note: '保留最近12个月' },
      { id: 'social', label: '社保记录', note: '核对缴费月份和主体' },
      { id: 'rent', label: '租房合同', note: '保留押金和缴费凭证' },
      { id: 'property', label: '房产/土地材料', note: '按当地登记情况整理' },
      { id: 'medical', label: '医疗/体检记录', note: '高风险检查结果单独保存' },
      { id: 'debt', label: '银行与债务记录', note: '避免共同债务信息缺失' },
      { id: 'child', label: '子女出生/抚养材料', note: '出生证、抚养协议等' },
      { id: 'will', label: '遗嘱/继承相关材料', note: '不替代律师意见' }
    ];
    panel.innerHTML =
      '<div class="tool-block">' +
      '<h3>重要文件清单</h3>' +
      '<p>不用一次整理完。先标出“我已经有”的，再慢慢补。</p>' +
      '<div class="tool-grid">' +
      files.map(function (item) {
        return '<label class="tool-card file-check">' +
          '<strong>' + escapeHtml(item.label) + '</strong>' +
          '<span>' + escapeHtml(item.note) + '</span>' +
          '<input type="checkbox" data-file="' + item.id + '"' + (checklist[item.id] ? ' checked' : '') + '> 已有</label>';
      }).join('') +
      '</div>' +
      '<div class="tool-grid">' +
      '<div class="tool-card"><strong>权利清单</strong><span>导出为 TXT，或直接打印。</span><div class="number-actions"><button type="button" data-export-rights>导出 TXT</button><button type="button" data-print-rights>打印</button></div></div>' +
      '<div class="tool-card"><strong>本地政策入口</strong><span>官方核验来源：</span><div class="number-actions"><a href="https://flk.npc.gov.cn" target="_blank" rel="noopener">国家法律法规数据库</a><a href="https://www.gov.cn/zhengce" target="_blank" rel="noopener">中国政府网政策文件库</a><a href="https://www.12345.gov.cn" target="_blank" rel="noopener">12345</a></div></div>' +
      '</div>' +
      '<div class="tools-note">工具箱是陪伴工具，不用也不代表失败。不同女性的处境不同，按你需要的来。纸质工具箱版将在底气礼盒中上线，当前暂无实拍图，暂不开放正式付款。</div>' +
      '<div class="tools-note">工具箱不替代法律咨询；具体个案请咨询律师或拨打12338 / 12348。</div>' +
      '</div>';
    panel.querySelectorAll('input[data-file]').forEach(function (input) {
      input.addEventListener('change', function () {
        checklist[input.getAttribute('data-file')] = input.checked;
        write(checklistKey, checklist);
      });
    });
    panel.querySelector('[data-export-rights]').addEventListener('click', exportRights);
    panel.querySelector('[data-print-rights]').addEventListener('click', printRights);
  };

const render = function () {
    const tools = [
      { id: 'guide', name: '使用说明', render: renderGuide },
      { id: 'numbers', name: '号码速查', render: renderNumbers },
      { id: 'map', name: '认知地图', render: renderMap },
      { id: 'weeks', name: '52周记录', render: renderWeeks },
      { id: 'files', name: '文件清单', render: renderFiles }
    ];
    root.innerHTML =
      '<div class="tools-nav">' +
      tools.map(function (tool) {
        return '<button type="button" data-tool="' + tool.id + '" class="' + (tool.id === activeTool ? 'active' : '') + '">' + tool.name + '</button>';
      }).join('') +
      '</div>' +
      '<div class="tools-panel" id="toolsPanel"></div>';
    const panel = root.querySelector('#toolsPanel');
    const current = tools.find(function (tool) { return tool.id === activeTool; }) || tools[0];
    current.render(panel);
    root.querySelectorAll('[data-tool]').forEach(function (button) {
      button.addEventListener('click', function () {
        activeTool = button.getAttribute('data-tool');
        write(ACTIVE_KEY, activeTool);
        render();
      });
    });
  };

  render();
})();
