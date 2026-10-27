// 舞台控制：字幕章节、触点动画、片头片尾。录制脚本通过 window.stage 驱动。
(function () {
  const $ = (s) => document.querySelector(s);
  let touchEl = null;

  const stage = {
    // chapters: [{ label }]
    setChapters(list) {
      const p = $('#progress');
      p.innerHTML = '';
      list.forEach((c) => {
        const seg = document.createElement('div');
        seg.className = 'seg';
        seg.innerHTML = '<div class="bar"><i></i></div><div class="lbl"></div>';
        seg.querySelector('.lbl').textContent = c.label;
        p.appendChild(seg);
      });
    },

    chapter(i, c) {
      const box = $('#chapter');
      box.classList.add('swap');
      document.querySelectorAll('#progress .seg').forEach((s, k) => {
        s.classList.toggle('done', k < i);
        s.classList.toggle('on', k === i);
      });
      return new Promise((resolve) => setTimeout(() => {
        box.querySelector('.ch-no').textContent = String(i + 1).padStart(2, '0') + ' / ' + String(document.querySelectorAll('#progress .seg').length).padStart(2, '0');
        box.querySelector('.ch-title').textContent = c.title;
        box.querySelector('.ch-desc').textContent = c.desc || '';
        const ul = box.querySelector('.ch-bullets');
        ul.innerHTML = '';
        (c.bullets || []).forEach((b) => {
          const li = document.createElement('li');
          li.innerHTML = b;
          ul.appendChild(li);
        });
        box.classList.remove('swap');
        resolve();
      }, 450));
    },

    bullet(i) {
      const li = document.querySelectorAll('#chapter .ch-bullets li')[i];
      if (li) li.classList.add('on');
    },

    cover(show, html) {
      const c = $('#cover');
      if (html) c.querySelector('.cover-inner').innerHTML = html;
      c.classList.toggle('show', !!show);
    },

    // 触点：先移动到位置，再按下、扩散
    touchMove(x, y) {
      if (!touchEl) {
        touchEl = document.createElement('div');
        touchEl.className = 'touch';
        $('#touch-layer').appendChild(touchEl);
        touchEl.style.transition = 'none';
        touchEl.style.left = x + 'px';
        touchEl.style.top = y + 'px';
        void touchEl.offsetWidth;
        touchEl.style.transition = '';
      }
      touchEl.style.left = x + 'px';
      touchEl.style.top = y + 'px';
      touchEl.classList.add('on');
    },
    touchPress(down) {
      if (!touchEl) return;
      touchEl.classList.toggle('press', !!down);
      if (down) {
        const r = document.createElement('div');
        r.className = 'ripple';
        r.style.left = touchEl.style.left;
        r.style.top = touchEl.style.top;
        $('#touch-layer').appendChild(r);
        setTimeout(() => r.remove(), 600);
      }
    },
    touchHide() {
      if (touchEl) touchEl.classList.remove('on', 'press');
    },

    // 手指拖动 + 当前页滚动同步进行（dy>0 = 内容上移）
    swipe(x, y, dy, ms) {
      const sc = document.querySelector('[data-top] .mp-scroll');
      if (!sc) return Promise.resolve(0);
      const y0 = sc.scrollTop;
      const target = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, y0 + dy));
      const dist = target - y0;
      const fingerTravel = Math.max(-260, Math.min(260, -dist * 0.7));
      stage.touchMove(x, y);
      touchEl.classList.add('press');
      const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
      return new Promise((resolve) => {
        setTimeout(() => {
          touchEl.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
          const t0 = performance.now();
          const step = (t) => {
            const p = Math.min(1, (t - t0) / ms);
            const e = ease(p);
            sc.scrollTop = y0 + dist * e;
            touchEl.style.top = (y + fingerTravel * e) + 'px';
            if (p < 1) requestAnimationFrame(step);
            else {
              touchEl.style.transition = '';
              stage.touchHide();
              setTimeout(() => resolve(dist), 120);
            }
          };
          requestAnimationFrame(step);
        }, 160);
      });
    }
  };
  window.stage = stage;

  function boot() {
    const p = new URLSearchParams(location.search);
    window.__mpsim.boot({ resetStorage: p.get('keep') !== '1' });
    if (p.get('cover') !== '1') stage.cover(false);
    window.__stageReady = true;
  }
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 3000))]).then(boot);
})();
