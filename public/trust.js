(function () {
  const config = window.TAZHI_LAUNCH || {};
  const support = config.support || {};
  const box = document.getElementById('supportInfo');
  if (!box) return;

  const email = String(support.email || '').trim();
  const wechat = String(support.wechat || '').trim();
  const hours = String(support.hours || '').trim();

  const parts = [];
  if (email) parts.push('客服邮箱：' + email);
  if (wechat) parts.push('客服微信：' + wechat);
  if (hours) parts.push('响应时间：' + hours);
  if (parts.length === 0) {
    box.textContent = '客服入口正在上线前配置，请先使用页面订单号联系后台管理员。';
    return;
  }
  box.innerHTML = parts.map(function (part) {
    return '<div>' + part + '</div>';
  }).join('');
})();
