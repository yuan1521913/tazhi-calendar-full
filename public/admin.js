(function () {
  const tokenInput = document.getElementById('tokenInput');
  const loginBtn = document.getElementById('loginBtn');
  const loginStatus = document.getElementById('loginStatus');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginPanel = document.getElementById('loginPanel');
  const adminPanel = document.getElementById('adminPanel');
  const ordersView = document.getElementById('ordersView');
  const codesView = document.getElementById('codesView');
  const ordersTab = document.getElementById('ordersTab');
  const codesTab = document.getElementById('codesTab');
  const ordersBody = document.getElementById('ordersBody');
  const codesBody = document.getElementById('codesBody');
  const ordersStatus = document.getElementById('ordersStatus');
  const codesStatus = document.getElementById('codesStatus');
  const codeCount = document.getElementById('codeCount');
  const codeScope = document.getElementById('codeScope');
  const generateCodesBtn = document.getElementById('generateCodesBtn');

  let token = sessionStorage.getItem('tazhi_admin_token') || '';
  let ordersData = [];

  const esc = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const showLogin = function (message) {
    token = '';
    sessionStorage.removeItem('tazhi_admin_token');
    loginPanel.hidden = false;
    adminPanel.hidden = true;
    logoutBtn.hidden = true;
    if (message) loginStatus.textContent = message;
  };

  const showAdmin = function () {
    loginPanel.hidden = true;
    adminPanel.hidden = false;
    logoutBtn.hidden = false;
    loginStatus.textContent = '';
    loadOrders();
  };

  const api = async function (path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    if (token) headers['x-admin-token'] = token;
    if (options.body) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, Object.assign({}, options, { headers }));
    if (response.status === 401) {
      showLogin('登录已失效，请重新输入 ADMIN_TOKEN。');
      throw new Error('unauthorized');
    }
    return response.json();
  };

  const statusClass = function (status) {
    const map = {
      unpaid: 'unpaid',
      paid: 'paid',
      refunded: 'refunded',
      cancelled: 'cancelled',
      available: 'available',
      assigned: 'assigned',
      used: 'used',
      orphaned: 'orphaned'
    };
    return map[status] || '';
  };

  const statusText = function (status) {
    const map = {
      unpaid: '待确认',
      paid: '已付款',
      refunded: '已退款',
      cancelled: '已取消',
      available: '可用',
      assigned: '已分配',
      used: '已使用',
      orphaned: '待回收',
      missing: '缺失'
    };
    return map[status] || status || '';
  };

  const loadOrders = async function () {
    ordersStatus.textContent = '加载中...';
    try {
      const data = await api('/api/admin-orders');
      ordersData = data.orders || [];
      ordersBody.innerHTML = (data.orders || []).map(function (order) {
        const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString() : '';
        return '<tr>' +
          '<td>' + esc(order.orderId) + '</td>' +
          '<td>' + esc(order.title || order.sku) + '</td>' +
          '<td>' + esc(order.priceYuan) + ' 元</td>' +
          '<td><span class="status ' + statusClass(order.status) + '">' + esc(statusText(order.status)) + '</span></td>' +
          '<td>' + esc(order.scope) + '</td>' +
          '<td>' + esc(order.code || '') + '</td>' +
          '<td>' + esc(createdAt) + '</td>' +
          '<td class="action-buttons">' +
          (order.status === 'unpaid' ? '<button type="button" data-action="confirm" data-order="' + esc(order.orderId) + '">确认到账</button>' : '') +
          (order.status === 'unpaid' || order.status === 'paid' ? '<button class="ghost" type="button" data-action="refund" data-order="' + esc(order.orderId) + '">退款</button>' : '') +
          (order.status === 'unpaid' ? '<button class="ghost" type="button" data-action="cancel" data-order="' + esc(order.orderId) + '">取消</button>' : '') +
          (order.deliveryToken ? '<button class="ghost" type="button" data-order-link="' + esc(order.orderId) + '">复制订单链接</button>' : '') +
          '</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="8" class="empty">暂无订单</td></tr>';
      ordersStatus.textContent = '';
    } catch (error) {
      if (error.message !== 'unauthorized') ordersStatus.textContent = '订单加载失败。';
    }
  };

  const loadCodes = async function () {
    codesStatus.textContent = '加载中...';
    try {
      const data = await api('/api/admin-codes');
      codesBody.innerHTML = (data.codes || []).map(function (code) {
        const createdAt = code.createdAt ? new Date(code.createdAt).toLocaleString() : '';
        const usedAt = code.usedAt ? new Date(code.usedAt).toLocaleString() : '';
        return '<tr>' +
          '<td>' + esc(code.code) + '</td>' +
          '<td>' + esc(code.scope) + '</td>' +
          '<td><span class="status ' + statusClass(code.status) + '">' + esc(statusText(code.status)) + '</span></td>' +
          '<td>' + esc(code.orderId || '') + '</td>' +
          '<td>' + esc(createdAt) + '</td>' +
          '<td>' + esc(usedAt) + '</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="6" class="empty">暂无解锁码</td></tr>';
      codesStatus.textContent = '';
    } catch (error) {
      if (error.message !== 'unauthorized') codesStatus.textContent = '解锁码加载失败。';
    }
  };

  const postOrderAction = async function (action, orderId) {
    ordersStatus.textContent = '处理中...';
    try {
      const data = await api('/api/admin-orders', {
        method: 'POST',
        body: JSON.stringify({ action, orderId })
      });
      ordersStatus.textContent = data.message || (data.ok ? '操作完成。' : '操作失败。');
      if (data.ok) {
        loadOrders();
        loadCodes();
      }
    } catch (error) {
      if (error.message !== 'unauthorized') ordersStatus.textContent = '操作失败。';
    }
  };

  const login = async function () {
    token = tokenInput.value.trim();
    if (!token) {
      loginStatus.textContent = '请输入 ADMIN_TOKEN。';
      return;
    }
    sessionStorage.setItem('tazhi_admin_token', token);
    try {
      const data = await api('/api/admin-orders');
      if (data.ok) {
        showAdmin();
      } else {
        showLogin(data.message || '登录失败。');
      }
    } catch (error) {
      showLogin('登录失败，请核对 ADMIN_TOKEN。');
    }
  };

  const generateCodes = async function () {
    const count = Math.min(Math.max(Number(codeCount.value) || 1, 1), 50);
    generateCodesBtn.disabled = true;
    codesStatus.textContent = '生成中...';
    try {
      const data = await api('/api/admin-codes', {
        method: 'POST',
        body: JSON.stringify({ count, scope: codeScope.value })
      });
      codesStatus.textContent = data.ok ? '已生成 ' + data.codes.length + ' 个解锁码。' : (data.message || '生成失败。');
      loadCodes();
    } catch (error) {
      if (error.message !== 'unauthorized') codesStatus.textContent = '生成失败。';
    } finally {
      generateCodesBtn.disabled = false;
    }
  };

  loginBtn.addEventListener('click', login);
  tokenInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') login();
  });
  logoutBtn.addEventListener('click', function () {
    showLogin('已退出。');
  });
  ordersTab.addEventListener('click', function () {
    ordersTab.classList.add('active');
    codesTab.classList.remove('active');
    ordersView.hidden = false;
    codesView.hidden = true;
    loadOrders();
  });
  codesTab.addEventListener('click', function () {
    codesTab.classList.add('active');
    ordersTab.classList.remove('active');
    codesView.hidden = false;
    ordersView.hidden = true;
    loadCodes();
  });
  generateCodesBtn.addEventListener('click', generateCodes);
  document.addEventListener('click', function (event) {
    const linkButton = event.target.closest('[data-order-link]');
    if (!linkButton) return;
    const orderId = linkButton.getAttribute('data-order-link');
    const order = ordersData.find(function (item) { return item.orderId === orderId; });
    if (!order || !order.deliveryToken) return;
    const url = window.location.origin + '/order.html?orderId=' + encodeURIComponent(order.orderId) + '#token=' + encodeURIComponent(order.deliveryToken);
    const textarea = document.createElement('textarea');
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    ordersStatus.textContent = '已复制订单链接，可直接发给顾客。';
  });

  document.addEventListener('click', function (event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const orderId = button.getAttribute('data-order');
    if (action === 'confirm') {
      postOrderAction('confirm', orderId);
    } else if (action === 'refund') {
      if (window.confirm('确认退款订单 ' + orderId + ' ？')) postOrderAction('refund', orderId);
    } else if (action === 'cancel') {
      if (window.confirm('确认取消订单 ' + orderId + ' ？')) postOrderAction('cancel', orderId);
    }
  });

  if (token) {
    tokenInput.value = token;
    showAdmin();
  }
})();
