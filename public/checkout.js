(function () {
  const manualPanel = document.getElementById('manualPanel');
  const orderNumber = document.getElementById('orderNumber');
  const manualMessage = document.getElementById('manualMessage');
  const orderLink = document.getElementById('orderLink');
  const pageStatus = document.getElementById('pageStatus');
  const urlParams = new URLSearchParams(window.location.search);
  const resolveSku = function (sku) { return sku === 'month2' ? 'trial28' : sku; };
  const preferredSku = resolveSku(urlParams.get('sku'));
  const manualSku = document.getElementById('manualSku');
  const manualPrice = document.getElementById('manualPrice');
  const mockPayBtn = document.getElementById('mockPayBtn');
  const mockPayNote = document.getElementById('mockPayNote');
  const mockCode = document.getElementById('mockCode');
  const demoMode = urlParams.get('demo') === '1';
  let currentOrderId = '';
  let currentSku = '';
  const PRODUCTS = {
    trial28: { title: '第二个月体验 · 第29-56天', price: '9.9元' },
    month2: { title: '第二个月体验 · 第29-56天', price: '9.9元' },
    full365: { title: '全年数字版 · 365天', price: '99元' }
  };

  const setStatus = function (message, isError) {
    if (!pageStatus) return;
    pageStatus.textContent = message || '';
    pageStatus.style.color = isError ? '#A7342E' : '#2F6B4F';
  };

  const showManual = function (orderId, sku, message) {
    if (!manualPanel) return;
    manualPanel.hidden = false;
    currentOrderId = orderId;
    currentSku = sku || '';
    orderNumber.textContent = orderId;
    const product = PRODUCTS[currentSku] || PRODUCTS['full365'];
    if (manualSku) manualSku.textContent = product.title;
    if (manualPrice) manualPrice.textContent = product.price;
    orderLink.href = 'order.html?orderId=' + encodeURIComponent(orderId) + '&sku=' + encodeURIComponent(currentSku) + '#token=' + encodeURIComponent(sessionStorage.getItem('tazhi_order_token_' + orderId) || '');
    orderLink.textContent = '我已完成付款，等待确认';
    manualMessage.textContent = message || '请保留订单号，付款后等待确认。';
    if (mockPayBtn) mockPayBtn.hidden = !demoMode;
    if (mockPayNote) mockPayNote.hidden = !demoMode;
    if (preferredSku && document.querySelector('[data-buy="' + preferredSku + '"]')) {
      document.querySelector('[data-buy="' + preferredSku + '"]').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const simulatePay = async function () {
    if (!currentOrderId) return;
    const token = sessionStorage.getItem('tazhi_order_token_' + currentOrderId) || '';
    if (!token) {
      setStatus('缺少订单令牌，请重新下单。', true);
      return;
    }
    if (mockPayBtn) mockPayBtn.disabled = true;
    setStatus('模拟支付处理中...');
    try {
      const response = await fetch('/api/mock-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: currentOrderId, token })
      });
      const data = await response.json();
      if (!data.ok) {
        setStatus(data.message || '模拟支付失败。', true);
        return;
      }
      const code = data.order && data.order.code;
      if (mockCode) {
        mockCode.hidden = false;
        mockCode.textContent = '';
        mockCode.append('模拟支付成功，解锁码：');
        const strong = document.createElement('strong');
        strong.textContent = code || '';
        mockCode.append(strong);
      }
      orderLink.href = 'order.html?orderId=' + encodeURIComponent(currentOrderId) + '&sku=' + encodeURIComponent(currentSku) + '#token=' + encodeURIComponent(token);
      orderLink.textContent = '查看订单和解锁码';
      manualMessage.textContent = '模拟支付已完成，订单页已生成解锁码。';
      setStatus('模拟支付成功。');
    } catch (error) {
      setStatus('模拟支付失败，请稍后重试。', true);
    } finally {
      if (mockPayBtn) mockPayBtn.disabled = false;
    }
  };

  const createOrder = async function (button, sku) {
    if (!button || button.disabled) return;
    button.disabled = true;
    setStatus('正在创建订单...');
    try {
      const response = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, source: 'checkout' })
      });
      const data = await response.json();
      if (!data.ok) {
        setStatus(data.message || '下单失败，请稍后重试。', true);
        return;
      }
      if (data.deliveryToken) {
        sessionStorage.setItem('tazhi_order_token_' + data.orderId, data.deliveryToken);
        sessionStorage.setItem('tazhi_order_sku_' + data.orderId, data.sku || sku);
      }
      if (data.mode === 'stripe' && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
      showManual(data.orderId, data.sku || sku, data.message || '');
      setStatus('订单已创建，请扫码付款。');
    } catch (error) {
      setStatus('网络异常，请稍后重试。', true);
    } finally {
      button.disabled = false;
    }
  };

  document.querySelectorAll('[data-buy]').forEach(function (button) {
    button.addEventListener('click', function () {
      createOrder(button, resolveSku(button.getAttribute('data-buy')));
    });
  });

  if (mockPayBtn) {
    mockPayBtn.addEventListener('click', simulatePay);
  }

  if (preferredSku) {
    const target = document.querySelector('[data-buy="' + preferredSku + '"]');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
})();
