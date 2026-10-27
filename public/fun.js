(function () {
  const data = window.CALENDAR_DATA;
  const els = {
    card: document.getElementById('card'),
    dayNumber: document.getElementById('dayNumber'),
    dimensionName: document.getElementById('dimensionName'),
    title: document.getElementById('cardTitle'),
    quote: document.getElementById('cardQuote'),
    action: document.getElementById('cardAction'),
    share: document.getElementById('shareBtn'),
    draw: document.getElementById('drawBtn'),
    status: document.getElementById('shareStatus')
  };

  if (!data || !els.card) return;

  const cards = data.completeDays.filter(function (day) {
    return !day.draft && day.locked !== true && day.day <= 28;
  });

  const fallback = data.completeDays.filter(function (day) {
    return day.day <= 7;
  });

  const pool = cards.length ? cards : fallback;
  let current = null;

  const getDimension = function (id) {
    return data.dimensions.find(function (item) {
      return item.id === id;
    }) || data.dimensions[0];
  };

  const draw = function () {
    if (!pool.length) return;
    current = pool[Math.floor(Math.random() * pool.length)];
    const dimension = getDimension(current.dimension);
    els.dayNumber.textContent = String(current.day).padStart(2, '0');
    els.dimensionName.textContent = dimension.name;
    els.title.textContent = current.title || '';
    els.quote.textContent = current.quote || '';
    els.action.textContent = current.action || '今天做一件让心里有底的小事。';
    els.status.textContent = '';
    els.card.classList.remove('drawing');
    void els.card.offsetWidth;
    els.card.classList.add('drawing');
  };

  const share = function () {
    if (!current) return;
    const text = '她知 · 今日底气签 第' + current.day + '天：' + current.title + '\n' + (current.quote || '') + '\n\n她也值得看看。';
    if (navigator.share) {
      navigator.share({ title: '她知 · 今日底气签', text: text }).catch(function () {});
    } else {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          els.status.textContent = '已复制，去发给那个她';
        });
      } else {
        els.status.textContent = '长按复制这张卡吧';
      }
    }
  };

  els.draw.addEventListener('click', draw);
  els.share.addEventListener('click', share);
  draw();
})();
