(function () {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const orderId = params.get('orderId') || '';
  const sessionId = params.get('session_id') || '';
  let token = hash.get('token') || sessionStorage.getItem('tazhi_order_token_' + orderId) || '';

  const els = {
    title: document.getElementById('orderTitle'),
    meta: document.getElementById('orderMeta'),
    qr: document.getElementById('qrBlock'),
    code: document.getElementById('codeBlock'),
    codeValue: document.getElementById('codeValue'),
    unlock: document.getElementById('unlockBtn'),
    refresh: document.getElementById('refreshBtn'),
    status: document.getElementById('orderStatus'),
    note: document.getElementById('orderNote')
  };

  let pollTimer = null;
  let latestOrder = null;

  const esc = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const renderMeta = function (order) {
    els.meta.hidden = false;
    const rows = [
      ['订单号', order.orderId],
      ['商品', order.title],
      ['金额', order.priceLabel],
      ['创建时间', order.createdAt ? new Date(order.createdAt).toLocaleString() : '']
    ];
    if (order.paidAt) rows.push(['付款时间', new Date(order.paidAt).toLocaleString()]);
    els.meta.innerHTML = rows.map(function (row) {
      return '<div class="meta-item"><span class="meta-label">' + esc(row[0]) + '</span><span class="meta-value">' + esc(row[1]) + '</span></div>';
    }).join('');
  };

  const renderOrder = function (order) {
    latestOrder = order;
    els.code.hidden = true;
    els.qr.hidden = true;
    els.unlock.hidden = true;
    els.note.hidden = true;

    if (order.status === 'paid') {
      els.title.textContent = '付款确认成功';
      els.code.hidden = false;
      els.codeValue.textContent = order.code || '';
      els.unlock.hidden = false;
      els.status.textContent = '解锁码已生成，点击进入日历。';
      els.note.hidden = false;
      els.note.textContent = '解锁码30天有效。数字版3天内可申请退款，退款后解锁码停用。';
      stopPolling();
      return;
    }

    if (order.status === 'unpaid') {
      els.title.textContent = order.provider === 'stripe' ? '等待支付结果' : '等待付款确认';
      if (order.qr) els.qr.hidden = false;
      els.status.textContent = order.manualMessage || '订单尚未确认到账。';
      els.note.hidden = false;
      els.note.textContent = '保留订单号；人工确认后本页会自动显示解锁码。';
      startPolling();
      return;
    }

    els.title.textContent = order.status === 'refunded' ? '订单已退款' : '订单已关闭';
    els.status.textContent = '这个订单不能再生成解锁码。';
  };

  const loadOrder = async function () {
    els.refresh.disabled = true;
    els.status.textContent = '正在查询订单...';
    try {
      let url;
      if (sessionId) {
        url = '/api/order-status?session_id=' + encodeURIComponent(sessionId);
      } else if (orderId && token) {
        url = '/api/order-status?orderId=' + encodeURIComponent(orderId) + '&token=' + encodeURIComponent(token);
      } else {
        throw new Error('missing-params');
      }
      const response = await fetch(url);
      const data = await response.json();
      if (!data.ok) {
        els.title.textContent = '订单查询失败';
        els.status.textContent = data.message || '请检查订单号后重试。';
        return;
      }
      if (data.deliveryToken) {
        token = data.deliveryToken;
        sessionStorage.setItem('tazhi_order_token_' + data.order.orderId, token);
      }
      renderMeta(data.order);
      renderOrder(data.order);
    } catch (error) {
      els.title.textContent = '订单查询失败';
      els.status.textContent = '请检查订单号或稍后重试。';
    } finally {
      els.refresh.disabled = false;
    }
  };

  const unlock = async function () {
    if (!latestOrder || !latestOrder.code) return;
    els.unlock.disabled = true;
    els.status.textContent = '正在解锁...';
    try {
      const response = await fetch('/api/restore-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: latestOrder.orderId, token })
      });
      const data = await response.json();
      if (!data.ok) {
        els.status.textContent = data.message || '解锁失败，请稍后重试。';
        els.unlock.disabled = false;
        return;
      }
      window.location.href = 'index.html';
    } catch (error) {
      els.status.textContent = '网络异常，请稍后重试。';
      els.unlock.disabled = false;
    }
  };

  const startPolling = function () {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (sessionId || (orderId && token)) loadOrder();
    }, 15000);
  };

  const stopPolling = function () {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  if (token && orderId) {
    sessionStorage.setItem('tazhi_order_token_' + orderId, token);
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  els.refresh.addEventListener('click', loadOrder);
  els.unlock.addEventListener('click', unlock);
  loadOrder();
})();
