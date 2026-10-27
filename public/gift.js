(function () {
  const recipients = {
    daughter: {
      label: '给女儿 / 妹妹',
      title: '遇事时，先知道自己有什么依据。',
      defaultText: '给你一份不说教的支持，你遇事时记得先找依据。'
    },
    self: {
      label: '给自己',
      title: '你的边界，值得被认真对待。',
      defaultText: '先看完整365天，再决定要不要把这份底气留给自己。'
    },
    friend: {
      label: '给闺蜜',
      title: '别怕说不清，你手里可以有答案。',
      defaultText: '给你的不是鸡汤，是遇事时查什么、存什么、找谁的依据。'
    },
    mother: {
      label: '给妈妈',
      title: '你的付出，也值得被制度看见。',
      defaultText: '这份日历不是要你学，是想让你遇事时知道有人和制度可找。'
    }
  };

  const buttons = Array.prototype.slice.call(document.querySelectorAll('[data-person]'));
  const textarea = document.getElementById('noteInput');
  const count = document.getElementById('noteCount');
  const previewPerson = document.getElementById('previewPerson');
  const previewTitle = document.getElementById('previewTitle');
  const previewText = document.getElementById('previewText');
  const copyBtn = document.getElementById('copyNoteBtn');
  const copyStatus = document.getElementById('copyStatus');

  let active = 'daughter';

  const render = function () {
    const data = recipients[active] || recipients.daughter;
    if (previewPerson) previewPerson.textContent = data.label;
    if (previewTitle) previewTitle.textContent = data.title;
    if (previewText) previewText.textContent = textarea && textarea.value.trim() ? textarea.value.trim() : data.defaultText;
    if (count && textarea) count.textContent = textarea.value.length + ' / 80';
  };

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      active = button.getAttribute('data-person');
      buttons.forEach(function (item) { item.classList.toggle('active', item === button); });
      if (textarea) {
        textarea.value = '';
        textarea.placeholder = recipients[active] ? recipients[active].defaultText : '';
      }
      if (copyStatus) copyStatus.textContent = '';
      render();
    });
  });

  if (textarea) textarea.addEventListener('input', render);

  if (copyBtn) {
    copyBtn.addEventListener('click', async function () {
      const data = recipients[active] || recipients.daughter;
      const note = textarea && textarea.value.trim() ? textarea.value.trim() : data.defaultText;
      const text = data.label + '：' + note + ' —— 她知 · 制度日历';
      try {
        await navigator.clipboard.writeText(text);
        if (copyStatus) copyStatus.textContent = '附言已复制，可直接发给她。';
      } catch (error) {
        if (copyStatus) copyStatus.textContent = '复制失败，请手动复制。';
      }
    });
  }

  render();
})();
