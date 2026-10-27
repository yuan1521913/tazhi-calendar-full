(function () {
  // 首页抽卡：从已复核内容中选取 6 张。
  // day / dimension / title 必须与 private-data/data.js 逐字一致，
  // scripts/check-launch.mjs 会比对；quote 与 action 是为首页阅读截断过的展示文案，不参与比对。
  const DRAW = [
    {
      day: 1,
      dimension: '历史',
      title: '天足运动——100年前的女人开始放脚',
      quote: '你拥有的，是她们不敢想象的。',
      action: '今天，当有人说你“不够像个女人”的时候——你知道这句话的历史重量吗？'
    },
    {
      day: 8,
      dimension: '宪法',
      title: '第33条——法律面前，人人平等',
      quote: '你身体里住着五个女人。这周，一个一个找到她们。',
      action: '当你有“矮了一截”的感觉时，停下来对自己说一句：“法律面前，我和任何人平等。”'
    },
    {
      day: 17,
      dimension: '法律',
      title: '招聘时问婚育——这件事违法',
      quote: '你可以不回答。你不需要用笑容为越界买单。',
      action: '准备一句礼貌、坚定的回答：“这与我的工作能力无关，我不回答。”'
    },
    {
      day: 22,
      dimension: '政策',
      title: '《中国妇女发展纲要》——每十年的路线图',
      quote: '你以为的运气，可能早就被制度安排好了。',
      action: '找到纲要里一项和你最相关的目标，记下来。'
    },
    {
      day: 24,
      dimension: '政策',
      title: '两癌筛查——适龄女性的健康机会',
      quote: '有些健康机会，不需要等生病才想起。',
      action: '问一句：社区医院是否符合当地免费筛查范围、怎么预约。'
    },
    {
      day: 28,
      dimension: '政策',
      title: '知道制度在哪里，就是知道帮助在哪里',
      quote: '知道制度在哪里，就是知道帮助在哪里。',
      action: '选一项和你相关的政策，今天查一次当地申请或预约方式。'
    }
  ];

  const cards = DRAW.map(function (item) {
    return {
      day: '第 ' + String(item.day).padStart(2, '0') + ' 天 · ' + item.dimension,
      title: item.title,
      quote: item.quote,
      action: '今日行动：' + item.action
    };
  });

  const dayEl = document.getElementById('drawDay');
  const titleEl = document.getElementById('drawTitle');
  const quoteEl = document.getElementById('drawQuote');
  const actionEl = document.getElementById('drawAction');
  const drawBtn = document.getElementById('drawBtn');

  let index = 1;

  const renderCard = function (card) {
    if (dayEl) dayEl.textContent = card.day;
    if (titleEl) titleEl.textContent = card.title;
    if (quoteEl) quoteEl.textContent = card.quote;
    if (actionEl) actionEl.textContent = card.action;
  };

  const drawNext = function () {
    index = (index + 1) % cards.length;
    renderCard(cards[index]);
  };

  if (drawBtn) drawBtn.addEventListener('click', drawNext);
  renderCard(cards[0]);

  document.querySelectorAll('.faq-question').forEach(function (button) {
    button.addEventListener('click', function () {
      button.parentElement.classList.toggle('open');
      const icon = button.querySelector('span');
      if (icon) icon.textContent = button.parentElement.classList.contains('open') ? '−' : '+';
    });
  });
})();
