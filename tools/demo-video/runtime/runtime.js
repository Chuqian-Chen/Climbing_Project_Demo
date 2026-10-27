// 浏览器端微信小程序模拟器（只覆盖本项目用到的能力）
// 加载 compile.js 生成的 window.__MP__，在 #mp-screen 内跑真实的页面 JS / WXML / WXSS。
// 本地演示模式：wx.cloud 恒为 undefined，api.js 自动走 mock-data + storage。
(function () {
  'use strict';

  const MP = window.__MP__;
  const CFG = Object.assign({
    assetBase: '/miniprogram',
    storagePrefix: 'mpsim:',
    location: { latitude: 39.9938, longitude: 116.4787 },
    locationAuthorized: true,
    statusBar: 44,
    navBar: 44,
    safeBottom: 34,
    screenW: 375,
    screenH: 812
  }, window.__SIM_CONFIG__ || {});

  const log = (...a) => console.log('[sim]', ...a);
  const warn = (...a) => console.warn('[sim]', ...a);

  /* ================= 小工具 ================= */

  function clone(v) {
    if (v === undefined || v === null || typeof v !== 'object') return v;
    return JSON.parse(JSON.stringify(v));
  }
  function camel(s) {
    return s.toLowerCase().replace(/-([a-z0-9])/g, (m, c) => c.toUpperCase());
  }
  function propCamel(s) {
    return s.replace(/-([a-z0-9])/g, (m, c) => c.toUpperCase());
  }
  function toStr(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function rpxToPx(str) {
    return String(str).replace(/(-?\d*\.?\d+)rpx/g, (m, n) => +(parseFloat(n) * CFG.screenW / 750).toFixed(3) + 'px');
  }
  function dirname(p) {
    const i = p.lastIndexOf('/');
    return i < 0 ? '' : p.slice(0, i);
  }
  function normPath(p) {
    const out = [];
    p.split('/').forEach((seg) => {
      if (!seg || seg === '.') return;
      if (seg === '..') out.pop();
      else out.push(seg);
    });
    return out.join('/');
  }
  function setPath(obj, path, val) {
    const keys = [];
    path.replace(/[^.[\]]+|\[(\d+)\]/g, (m, idx) => { keys.push(idx != null ? +idx : m); return m; });
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (o[k] === null || typeof o[k] !== 'object') o[k] = typeof keys[i + 1] === 'number' ? [] : {};
      o = o[k];
    }
    o[keys[keys.length - 1]] = val;
    return keys[0];
  }

  // 资源路径：/assets/x → 小程序根；sim-asset://docs/x → 仓库根；cloud:// 无法加载
  function resolveSrc(src, basePath) {
    if (!src || typeof src !== 'string') return '';
    if (/^(https?:|data:|blob:)/.test(src)) return src;
    if (src.indexOf('sim-asset://') === 0) return '/' + src.slice('sim-asset://'.length);
    if (src.indexOf('cloud://') === 0) return '';
    if (src[0] === '/') return CFG.assetBase + src;
    return CFG.assetBase + '/' + normPath(dirname(basePath || '') + '/' + src);
  }

  /* ================= 模块系统 ================= */

  const modCache = {};
  const pageDefs = {};
  const compDefs = {};
  let registering = '';

  function resolveModule(from, req) {
    let p = req[0] === '/' ? req.slice(1) : normPath(dirname(from) + '/' + req);
    p = normPath(p);
    const cands = [p, p + '.js', p + '/index.js'];
    for (const c of cands) if (MP.modules[c]) return c;
    throw new Error('[sim] module not found: ' + req + ' (from ' + from + ')');
  }

  function loadModule(id) {
    if (modCache[id]) return modCache[id].exports;
    const fn = MP.modules[id];
    if (!fn) throw new Error('[sim] module not found: ' + id);
    const module = { exports: {} };
    modCache[id] = module;
    const prev = registering;
    registering = id.replace(/\.js$/, '');
    try {
      fn.call(module.exports, module, module.exports, (r) => loadModule(resolveModule(id, r)));
    } finally {
      registering = prev;
    }
    return module.exports;
  }

  /* ================= 表达式 ================= */

  const exprCache = new Map();
  const SCOPE_HANDLER = {
    has: () => true,
    get: (t, k) => (k === Symbol.unscopables ? undefined : t[k])
  };
  const proxyCache = new WeakMap();

  function evalExpr(src, scope) {
    let f = exprCache.get(src);
    if (!f) {
      try {
        // eslint-disable-next-line no-new-func
        f = new Function('__s', 'with(__s){return (' + src + ')}');
      } catch (e) {
        warn('bad expression:', src);
        f = () => undefined;
      }
      exprCache.set(src, f);
    }
    let p = proxyCache.get(scope);
    if (!p) { p = new Proxy(scope, SCOPE_HANDLER); proxyCache.set(scope, p); }
    try {
      return f(p);
    } catch (e) {
      return undefined;
    }
  }

  function interp(c, scope) {
    if (c.s !== undefined) return c.s;
    if (c.raw) return evalExpr(c.e, scope);
    let out = '';
    for (const part of c.p) out += part.s !== undefined ? part.s : toStr(evalExpr(part.e, scope));
    return out;
  }

  /* ================= WXML → vnode ================= */

  const EVENT_RE = /^(capture-bind|capture-catch|mut-bind|bind|catch):?(.+)$/;

  function renderList(nodes, scope, ctx, out) {
    let chain = null;
    for (const n of nodes) {
      if (n.t) {
        out.push({ k: 'text', v: toStr(interp(n.t, scope)) });
        chain = null;
        continue;
      }
      const a = n.a;
      if (a['wx:for']) { renderFor(n, scope, ctx, out); chain = null; continue; }
      if (a['wx:if']) {
        const ok = !!interp(a['wx:if'], scope);
        chain = ok;
        if (ok) renderNode(n, scope, ctx, out);
        continue;
      }
      if (a['wx:elif']) {
        if (chain === false && interp(a['wx:elif'], scope)) { chain = true; renderNode(n, scope, ctx, out); }
        continue;
      }
      if (a['wx:else']) {
        if (chain === false) renderNode(n, scope, ctx, out);
        chain = null;
        continue;
      }
      chain = null;
      renderNode(n, scope, ctx, out);
    }
  }

  function renderFor(n, scope, ctx, out) {
    let list = interp(n.a['wx:for'], scope);
    const itemName = n.a['wx:for-item'] ? interp(n.a['wx:for-item'], scope) : 'item';
    const indexName = n.a['wx:for-index'] ? interp(n.a['wx:for-index'], scope) : 'index';
    if (typeof list === 'number') list = Array.from({ length: list }, (_, i) => i);
    else if (typeof list === 'string') list = list.split('');
    let entries = [];
    if (Array.isArray(list)) entries = list.map((v, i) => [i, v]);
    else if (list && typeof list === 'object') entries = Object.keys(list).map((k) => [k, list[k]]);
    for (const [i, v] of entries) {
      const s = Object.create(scope);
      s[itemName] = v;
      s[indexName] = i;
      if (n.a['wx:if'] && !interp(n.a['wx:if'], s)) continue;
      renderNode(n, s, ctx, out);
    }
  }

  function renderNode(n, scope, ctx, out) {
    if (n.tag === 'block') { renderList(n.c, scope, ctx, out); return; }
    const attrs = {};
    const events = {};
    const dataset = {};
    for (const name in n.a) {
      if (name.indexOf('wx:') === 0) continue;
      const v = interp(n.a[name], scope);
      const m = EVENT_RE.exec(name);
      if (m) { events[m[2].toLowerCase()] = { h: v, c: m[1].indexOf('catch') >= 0 }; continue; }
      if (name.indexOf('data-') === 0) { dataset[camel(name.slice(5))] = v; continue; }
      attrs[name] = v;
    }
    const compPath = ctx.using[n.tag];
    if (compPath) {
      out.push({ k: 'comp', tag: n.tag, path: compPath, attrs, events, dataset, owner: ctx.owner });
      return;
    }
    const v = { k: 'el', tag: n.tag, attrs, events, dataset, owner: ctx.owner, c: [] };
    renderList(n.c, scope, ctx, v.c);
    out.push(v);
  }

  /* ================= vnode → DOM ================= */

  const EMPTY_EL = { k: 'el', attrs: {}, events: {}, dataset: {} };
  const LEAF = { image: 1, input: 1, textarea: 1, video: 1, canvas: 1 };
  let pendingAttached = [];

  function createDom(v) {
    if (v.k === 'text') {
      const t = document.createTextNode(v.v);
      t.__v = v;
      return t;
    }
    if (v.k === 'comp') return createCompHost(v);
    const el = document.createElement(v.tag);
    el.__v = Object.assign({}, EMPTY_EL, { tag: v.tag });
    updateEl(el, v);
    if (!LEAF[v.tag]) patchChildren(el, v.c);
    el.__v = v;
    return el;
  }

  function patchChildren(parent, list) {
    const kids = parent.__kids || (parent.__kids = []);
    const n = Math.min(kids.length, list.length);
    for (let i = 0; i < n; i++) kids[i] = patchNode(kids[i], list[i]);
    for (let i = n; i < list.length; i++) {
      const d = createDom(list[i]);
      parent.appendChild(d);
      kids.push(d);
    }
    for (let i = kids.length - 1; i >= list.length; i--) {
      destroyDom(kids[i]);
      if (kids[i].parentNode) kids[i].parentNode.removeChild(kids[i]);
      kids.pop();
    }
  }

  function patchNode(dom, v) {
    const o = dom.__v;
    if (o.k !== v.k || o.tag !== v.tag || (v.k === 'comp' && o.path !== v.path)) {
      const nd = createDom(v);
      if (dom.parentNode) dom.parentNode.replaceChild(nd, dom);
      destroyDom(dom);
      return nd;
    }
    if (v.k === 'text') {
      if (o.v !== v.v) dom.nodeValue = v.v;
      dom.__v = v;
      return dom;
    }
    if (v.k === 'comp') { updateCompHost(dom, v); return dom; }
    updateEl(dom, v);
    if (!LEAF[v.tag]) patchChildren(dom, v.c);
    dom.__v = v;
    return dom;
  }

  function destroyDom(dom) {
    if (dom.nodeType !== 1) return;
    const hosts = [];
    if (dom.__inst) hosts.push(dom);
    dom.querySelectorAll('[data-comp]').forEach((h) => { if (h.__inst) hosts.push(h); });
    hosts.forEach((h) => {
      const inst = h.__inst;
      if (inst.__dead) return;
      inst.__dead = true;
      callLife(inst, 'detached');
    });
  }

  function setAttr(el, name, val) {
    if (val === false || val === undefined || val === null || val === '') el.removeAttribute(name);
    else if (val === true) el.setAttribute(name, '');
    else if (typeof val !== 'object') el.setAttribute(name, String(val));
  }

  function updateEl(el, v) {
    const o = el.__v || EMPTY_EL;
    const a = v.attrs;
    const oa = o.attrs || {};
    el.__events = v.events;
    el.__owner = v.owner;
    el.__dataset = v.dataset;
    el.__attrs = a;
    const tag = v.tag;
    for (const k in a) {
      const val = a[k];
      if (val === oa[k] && k !== 'value') continue;
      if (k === 'class') el.setAttribute('class', toStr(val));
      else if (k === 'style') el.setAttribute('style', rpxToPx(toStr(val)));
      else if (k === 'id') el.id = toStr(val);
      else if (k === 'hidden') el.hidden = !!val;
      else if (tag === 'image' && k === 'src') { /* 下面统一处理 */ }
      else if ((tag === 'input' || tag === 'textarea') && (k === 'value' || k === 'placeholder' || k === 'maxlength' || k === 'type' || k === 'focus' || k === 'password' || k === 'disabled')) { /* 下面 */ }
      else if (tag === 'video' && (k === 'src' || k === 'poster')) { /* 下面 */ }
      else setAttr(el, k, val);
    }
    for (const k in oa) {
      if (!(k in a)) {
        if (k === 'class') el.removeAttribute('class');
        else if (k === 'style') el.removeAttribute('style');
        else if (k === 'hidden') el.hidden = false;
        else el.removeAttribute(k);
      }
    }
    const base = v.owner && v.owner.__base;
    if (tag === 'image') updateImage(el, a, oa, base);
    else if (tag === 'input' || tag === 'textarea') updateInput(el, a, oa, tag);
    else if (tag === 'video') {
      const src = resolveSrc(a.src, base);
      if (el.getAttribute('src') !== src) { if (src) el.src = src; else el.removeAttribute('src'); }
      if (a.poster) el.poster = resolveSrc(a.poster, base);
      el.controls = a.controls !== false;
      el.playsInline = true;
      if (a['object-fit']) el.style.objectFit = a['object-fit'] === 'fill' ? 'fill' : a['object-fit'];
    } else if (tag === 'canvas') prepCanvas(el);
    else if (tag === 'scroll-view') updateScrollView(el, a, oa);
    else if (tag === 'button') el.type = 'button';
  }

  function updateImage(el, a, oa, base) {
    let img = el.__img;
    if (!img) {
      img = el.__img = document.createElement('img');
      img.draggable = false;
      img.decoding = 'async';
      img.addEventListener('load', () => {
        el.classList.add('mp-img-loaded');
        fireEvent(el, 'load', { width: img.naturalWidth, height: img.naturalHeight });
      });
      img.addEventListener('error', () => fireEvent(el, 'error', { errMsg: 'image load fail' }));
      el.appendChild(img);
    }
    const src = resolveSrc(a.src, base);
    if (img.__src !== src) {
      img.__src = src;
      if (src) img.src = src;
      else img.removeAttribute('src');
    }
    if (!a.mode) el.setAttribute('mode', 'scaleToFill');
  }

  function updateInput(el, a, oa, tag) {
    if (!el.__inputBound) {
      el.__inputBound = true;
      el.addEventListener('input', () => {
        if (tag === 'textarea' && el.__attrs['auto-height']) autoHeight(el);
        fireEvent(el, 'input', { value: el.value, cursor: el.selectionStart, keyCode: 0 });
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && tag === 'input') fireEvent(el, 'confirm', { value: el.value });
      });
      el.addEventListener('focus', () => fireEvent(el, 'focus', { value: el.value, height: 0 }));
      el.addEventListener('blur', () => fireEvent(el, 'blur', { value: el.value }));
    }
    if (tag === 'input') {
      const t = a.password ? 'password' : 'text';
      if (el.type !== t) el.type = t;
      if (a.type === 'number' || a.type === 'digit' || a.type === 'idcard') el.inputMode = 'decimal';
    }
    const val = toStr(a.value);
    if (oa.value !== a.value || el.__first !== true) {
      if (el.value !== val) el.value = val;
    }
    el.__first = true;
    el.placeholder = toStr(a.placeholder);
    const ml = parseInt(a.maxlength, 10);
    if (ml > 0) el.maxLength = ml; else el.removeAttribute('maxlength');
    el.disabled = !!a.disabled;
    if (a.focus && !oa.focus) setTimeout(() => el.focus(), 0);
    if (tag === 'textarea' && a['auto-height']) requestAnimationFrame(() => autoHeight(el));
  }

  function autoHeight(el) {
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 20) + 'px';
  }

  function updateScrollView(el, a, oa) {
    if (!el.__scrollBound) {
      el.__scrollBound = true;
      el.addEventListener('scroll', () => {
        fireEvent(el, 'scroll', {
          scrollTop: el.scrollTop, scrollLeft: el.scrollLeft,
          scrollHeight: el.scrollHeight, scrollWidth: el.scrollWidth
        });
        if (el.__events && el.__events.scrolltolower &&
          el.scrollTop + el.clientHeight >= el.scrollHeight - 50) fireEvent(el, 'scrolltolower', {});
      });
    }
    if (a['scroll-top'] !== undefined && a['scroll-top'] !== oa['scroll-top']) {
      requestAnimationFrame(() => { el.scrollTop = +a['scroll-top'] || 0; });
    }
    if (a['scroll-left'] !== undefined && a['scroll-left'] !== oa['scroll-left']) {
      requestAnimationFrame(() => { el.scrollLeft = +a['scroll-left'] || 0; });
    }
    const into = a['scroll-into-view'];
    if (into && into !== oa['scroll-into-view']) {
      requestAnimationFrame(() => {
        const t = el.querySelector('#' + CSS.escape(into));
        if (!t) return;
        const r = t.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        el.scrollTo({ left: el.scrollLeft + r.left - b.left, top: el.scrollTop + r.top - b.top, behavior: a['scroll-with-animation'] ? 'smooth' : 'auto' });
      });
    }
  }

  function prepCanvas(el) {
    if (el.__prepped) return;
    el.__prepped = true;
    el.createImage = () => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      Object.defineProperty(img, 'src', {
        get() { return desc.get.call(img); },
        set(v) { desc.set.call(img, resolveSrc(v, '')); }
      });
      return img;
    };
    el.requestAnimationFrame = (cb) => requestAnimationFrame(cb);
    el.cancelAnimationFrame = (id) => cancelAnimationFrame(id);
  }

  /* ================= 事件 ================= */

  function bodyOf(el) {
    return el.closest('.mp-body');
  }

  function mkEvent(type, target, current, detail, domEvent) {
    const body = current && current.closest ? bodyOf(current) : null;
    let touch = null;
    if (domEvent && body) {
      const b = body.getBoundingClientRect();
      const sc = body.querySelector('.mp-scroll');
      const cx = domEvent.clientX - b.left;
      const cy = domEvent.clientY - b.top;
      touch = { identifier: 0, clientX: cx, clientY: cy, pageX: cx, pageY: cy + (sc ? sc.scrollTop : 0), x: cx, y: cy };
    }
    const info = (n) => ({
      id: (n && n.id) || '',
      dataset: (n && (n.__dataset || (n.__inst && n.__inst.dataset))) || {},
      offsetLeft: n && n.offsetLeft, offsetTop: n && n.offsetTop
    });
    return {
      type,
      timeStamp: Math.round(performance.now()),
      target: info(target),
      currentTarget: info(current),
      mark: {},
      detail: detail || (touch ? { x: touch.pageX, y: touch.pageY } : {}),
      touches: touch ? [touch] : [],
      changedTouches: touch ? [touch] : []
    };
  }

  function callHandler(owner, h, ev) {
    if (typeof h === 'function') return h.call(owner, ev);
    const fn = owner && owner[h];
    if (typeof fn !== 'function') { warn('handler not found:', h); return undefined; }
    try {
      return fn.call(owner, ev);
    } catch (err) {
      console.error('[sim] handler error in ' + h + ':', err);
      return undefined;
    }
  }

  // 非冒泡事件：直接触发该节点上的绑定
  function fireEvent(el, type, detail) {
    const ev = el.__events && el.__events[type];
    if (!ev) return;
    callHandler(el.__owner, ev.h, mkEvent(type, el, el, detail));
  }

  // 冒泡事件：沿 DOM 往上走，catch 截断
  function bubble(startEl, type, domEvent, screenEl) {
    const path = [];
    for (let n = startEl; n && n !== screenEl; n = n.parentElement) path.push(n);
    const target = path.find((n) => n.__dataset) || startEl;
    let fired = false;
    for (const n of path) {
      const ev = n.__events && n.__events[type];
      if (!ev) continue;
      fired = true;
      callHandler(n.__owner, ev.h, mkEvent(type, target, n, null, domEvent));
      if (ev.c) break;
    }
    return { path, fired };
  }

  function installDelegation(screenEl) {
    let suppressClick = false;
    let lpTimer = null;
    let down = null;
    let hovered = [];

    screenEl.addEventListener('pointerdown', (e) => {
      if (!e.target.closest || !e.target.closest('.mp-body')) return;
      down = { x: e.clientX, y: e.clientY, target: e.target, ev: e };
      // hover-class
      hovered = [];
      for (let n = e.target; n && n !== screenEl; n = n.parentElement) {
        const hc = n.__attrs && n.__attrs['hover-class'];
        const cls = hc && hc !== 'none' ? hc : (n.tagName === 'BUTTON' && hc !== 'none' ? 'button-hover' : '');
        if (cls) { n.classList.add(cls); hovered.push([n, cls]); if (n.__attrs['hover-stop-propagation']) break; }
      }
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        if (!down) return;
        const r = bubble(down.target.nodeType === 1 ? down.target : down.target.parentElement, 'longpress', down.ev, screenEl);
        const r2 = r.fired ? r : bubble(down.target, 'longtap', down.ev, screenEl);
        if (r.fired || r2.fired) suppressClick = true;
      }, 350);
    }, true);
    const clearHover = () => {
      const h = hovered;
      hovered = [];
      setTimeout(() => h.forEach(([n, c]) => n.classList.remove(c)), 70);
    };
    screenEl.addEventListener('pointermove', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) { clearTimeout(lpTimer); down = null; clearHover(); }
    }, true);
    screenEl.addEventListener('pointerup', () => { clearTimeout(lpTimer); down = null; clearHover(); }, true);
    screenEl.addEventListener('pointercancel', () => { clearTimeout(lpTimer); down = null; clearHover(); }, true);

    screenEl.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; return; }
      let t = e.target;
      if (t.nodeType !== 1) t = t.parentElement;
      if (!t.closest('.mp-body')) return;
      const { path } = bubble(t, 'tap', e, screenEl);
      // 原生组件行为（picker 弹出、button open-type）
      for (const n of path) {
        if (n.tagName === 'PICKER' && !(n.__attrs && n.__attrs.disabled)) { openPicker(n); break; }
        if (n.tagName === 'BUTTON' && n.__attrs && n.__attrs['open-type']) { buttonOpenType(n); break; }
      }
    });
  }

  function buttonOpenType(btn) {
    const t = btn.__attrs['open-type'];
    if (t === 'share') UI.shareSheet();
    else if (t === 'chooseAvatar') fireEvent(btn, 'chooseavatar', { avatarUrl: '' });
    else if (t === 'contact') UI.toast({ title: '客服会话（模拟）', icon: 'none' });
  }

  /* ================= setData / 实例公共 ================= */

  function setDataImpl(inst, obj, cb) {
    const changed = [];
    Object.keys(obj || {}).forEach((k) => {
      const v = obj[k];
      if (k.indexOf('.') < 0 && k.indexOf('[') < 0) inst.data[k] = v;
      else setPath(inst.data, k, v);
      changed.push(k);
    });
    if (inst.__def && inst.__def.observers) runObservers(inst, changed);
    renderInst(inst);
    if (typeof cb === 'function') Promise.resolve().then(() => cb.call(inst));
  }

  function renderInst(inst) {
    if (inst.__dead || !inst.__root) return;
    if (inst.__rendering) { inst.__dirty = true; return; }
    inst.__rendering = true;
    try {
      let guard = 0;
      do {
        inst.__dirty = false;
        const list = [];
        renderList(inst.__view.ast, inst.data, { owner: inst, using: inst.__using }, list);
        patchChildren(inst.__root, list);
      } while (inst.__dirty && ++guard < 5);
    } catch (e) {
      console.error('[sim] render error in ' + inst.__base + ':', e);
    } finally {
      inst.__rendering = false;
    }
    flushAttached();
  }

  function flushAttached() {
    if (!pendingAttached.length) return;
    const list = pendingAttached;
    pendingAttached = [];
    list.forEach((inst) => {
      if (inst.__dead) return;
      callLife(inst, 'attached');
      setTimeout(() => { if (!inst.__dead) callLife(inst, 'ready'); }, 0);
    });
  }

  function usingOf(json, basePath) {
    const out = {};
    const u = (json && json.usingComponents) || {};
    Object.keys(u).forEach((k) => {
      const p = u[k];
      out[k] = p[0] === '/' ? normPath(p) : normPath(dirname(basePath) + '/' + p);
    });
    return out;
  }

  function querySelf(inst, sel) {
    const root = inst.__root;
    if (!root) return null;
    const host = root.querySelector(sel);
    return host && host.__inst ? host.__inst : null;
  }

  /* ================= Component ================= */

  function defaultOf(p) {
    const t = p && typeof p === 'object' ? p.type : p;
    if (p && typeof p === 'object' && 'value' in p) return clone(p.value);
    if (t === String) return '';
    if (t === Number) return 0;
    if (t === Boolean) return false;
    if (t === Array) return [];
    return null;
  }

  function coerce(p, val) {
    const t = p && typeof p === 'object' ? p.type : p;
    if (t === Boolean) return val === '' ? true : !!val;
    if (t === Number) return typeof val === 'number' ? val : (val === '' || val == null ? 0 : +val);
    if (t === String) return val == null ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val));
    return clone(val);
  }

  function callLife(inst, name) {
    const d = inst.__def || {};
    const fn = (d.lifetimes && d.lifetimes[name]) || d[name];
    if (typeof fn === 'function') {
      try { fn.call(inst); } catch (e) { console.error('[sim] ' + name + ' error in ' + inst.is, e); }
    }
  }

  function runObservers(inst, changed) {
    const obs = inst.__def.observers;
    Object.keys(obs).forEach((key) => {
      const fields = key.split(',').map((s) => s.trim().replace(/\.\*\*$/, ''));
      const hit = fields.some((f) => changed.some((c) => c === f || c.indexOf(f + '.') === 0 || c.indexOf(f + '[') === 0 || f.indexOf(c + '.') === 0));
      if (!hit) return;
      const vals = fields.map((f) => {
        let o = inst.data;
        f.split('.').forEach((seg) => { o = o == null ? undefined : o[seg]; });
        return o;
      });
      try { obs[key].apply(inst, vals); } catch (e) { console.error('[sim] observer error', key, e); }
    });
  }

  function newComponent(path, host) {
    loadModule(path + '.js');
    const def = compDefs[path] || {};
    const view = MP.views[path];
    const inst = {};
    const methods = def.methods || {};
    Object.keys(methods).forEach((k) => { inst[k] = methods[k]; });
    const data = clone(def.data || {});
    const props = def.properties || {};
    Object.keys(props).forEach((k) => { data[k] = defaultOf(props[k]); });
    Object.assign(inst, {
      is: path,
      id: '',
      dataset: {},
      data,
      properties: data,
      __def: def,
      __view: view,
      __base: path,
      __using: usingOf(view && view.json, path),
      __root: host,
      __host: host,
      __propSig: {},
      setData(obj, cb) { setDataImpl(inst, obj, cb); },
      triggerEvent(name, detail) {
        const v = host.__v;
        const ev = v && v.events && v.events[String(name).toLowerCase()];
        if (!ev) return;
        callHandler(v.owner, ev.h, mkEvent(name, host, host, detail || {}));
      },
      selectComponent(sel) { return querySelf(inst, sel); },
      createSelectorQuery() { return createSelectorQuery().in(inst); },
      getTabBar() { return null; },
      getPageId() { return 'sim'; }
    });
    callLife(inst, 'created');
    return inst;
  }

  function createCompHost(v) {
    const host = document.createElement(v.tag);
    host.setAttribute('data-comp', v.path);
    const inst = newComponent(v.path, host);
    host.__inst = inst;
    host.__v = { k: 'comp', tag: v.tag, path: v.path, attrs: {}, events: {}, dataset: {} };
    updateCompHost(host, v, true);
    pendingAttached.push(inst);
    return host;
  }

  function updateCompHost(host, v, first) {
    const inst = host.__inst;
    const a = v.attrs;
    host.__events = v.events;
    host.__owner = v.owner;
    host.__dataset = v.dataset;
    host.__attrs = a;
    inst.dataset = v.dataset;
    const cls = toStr(a.class);
    if (host.getAttribute('class') !== cls) { if (cls) host.setAttribute('class', cls); else host.removeAttribute('class'); }
    const st = a.style ? rpxToPx(toStr(a.style)) : '';
    if ((host.getAttribute('style') || '') !== st) { if (st) host.setAttribute('style', st); else host.removeAttribute('style'); }
    if (a.id) { host.id = toStr(a.id); inst.id = host.id; }
    host.hidden = !!a.hidden;
    const props = inst.__def.properties || {};
    const changed = [];
    Object.keys(a).forEach((k) => {
      if (k === 'class' || k === 'style' || k === 'id' || k === 'hidden' || k === 'slot') return;
      const name = propCamel(k);
      if (!(name in props)) return;
      const sig = JSON.stringify(a[k] === undefined ? null : a[k]);
      if (inst.__propSig[name] === sig) return;
      inst.__propSig[name] = sig;
      const old = inst.data[name];
      const nv = a[k] === undefined ? defaultOf(props[name]) : coerce(props[name], a[k]);
      inst.data[name] = nv;
      changed.push(name);
      const p = props[name];
      if (!first && p && typeof p === 'object' && p.observer) {
        const fn = typeof p.observer === 'function' ? p.observer : inst[p.observer];
        if (typeof fn === 'function') { try { fn.call(inst, nv, old); } catch (e) { console.error(e); } }
      }
    });
    host.__v = v;
    if (changed.length && inst.__def.observers) runObservers(inst, changed);
    if (first || changed.length) renderInst(inst);
  }

  /* ================= Page / App ================= */

  let appInst = null;
  const stack = [];
  const tabPages = {};

  function tabRoutes() {
    const tb = MP.appJson.tabBar;
    return tb ? tb.list.map((t) => normPath(t.pagePath)) : [];
  }
  function isTab(route) { return tabRoutes().indexOf(route) >= 0; }

  function parseUrl(url, from) {
    const [p, qs] = String(url).split('?');
    const route = p[0] === '/' ? normPath(p) : normPath(dirname(from || '') + '/' + p);
    const query = {};
    (qs || '').split('&').forEach((kv) => {
      if (!kv) return;
      const i = kv.indexOf('=');
      const k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      query[k] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
    });
    return { route, query };
  }

  function screen() { return document.getElementById('mp-screen'); }
  function pagesLayer() { return document.getElementById('mp-pages'); }

  function createPage(route, query) {
    loadModule(route + '.js');
    const def = pageDefs[route];
    if (!def) throw new Error('[sim] page not registered: ' + route);
    const view = MP.views[route];
    const json = Object.assign({}, MP.appJson.window || {}, (view && view.json) || {});
    const inst = {};
    Object.keys(def).forEach((k) => {
      if (k === 'data') return;
      inst[k] = typeof def[k] === 'function' ? def[k] : clone(def[k]);
    });

    const wrap = document.createElement('div');
    wrap.className = 'mp-wrap';
    wrap.innerHTML =
      '<div class="mp-nav"><div class="mp-nav-inner">' +
      '<div class="mp-nav-back" role="button" aria-label="返回"><svg viewBox="0 0 12 24" width="12" height="24"><path d="M10 3 L2 12 L10 21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      '<div class="mp-nav-title"></div>' +
      '<div class="mp-capsule"><span class="mp-cap-dots"><i></i><i class="big"></i><i></i></span><span class="mp-cap-sep"></span><span class="mp-cap-ring"></span></div>' +
      '</div></div>' +
      '<div class="mp-body"><div class="mp-scroll"><div class="mp-page"></div></div></div>' +
      '<div class="mp-shade"></div>';
    const nav = wrap.querySelector('.mp-nav');
    nav.style.background = json.navigationBarBackgroundColor || '#ffffff';
    nav.classList.toggle('white', json.navigationBarTextStyle === 'white');
    wrap.querySelector('.mp-nav-title').textContent = json.navigationBarTitleText || '';
    wrap.querySelector('.mp-nav-back').addEventListener('click', () => api.navigateBack({ delta: 1 }));
    const pageEl = wrap.querySelector('.mp-page');
    pageEl.classList.add('p-' + route.replace(/\//g, '-'));
    wrap.querySelector('.mp-scroll').style.background = json.backgroundColor || '';
    wrap.querySelector('.mp-scroll').addEventListener('scroll', (e) => {
      if (typeof inst.onPageScroll === 'function') inst.onPageScroll({ scrollTop: e.target.scrollTop });
    });

    Object.assign(inst, {
      route,
      options: query,
      data: clone(def.data || {}),
      __def: null,
      __view: view,
      __json: json,
      __base: route,
      __using: usingOf(view && view.json, route),
      __root: pageEl,
      __wrap: wrap,
      setData(obj, cb) { setDataImpl(inst, obj, cb); },
      getTabBar() { return inst.__tabBar || null; },
      selectComponent(sel) { return querySelf(inst, sel); },
      selectAllComponents(sel) {
        return Array.from(pageEl.querySelectorAll(sel)).filter((h) => h.__inst).map((h) => h.__inst);
      },
      createSelectorQuery() { return createSelectorQuery().in(inst); },
      getOpenerEventChannel() { return { emit() {}, on() {}, once() {}, off() {} }; }
    });
    wrap.__page = inst;

    if (isTab(route) && MP.views['custom-tab-bar/index']) {
      const host = document.createElement('custom-tab-bar');
      host.setAttribute('data-comp', 'custom-tab-bar/index');
      wrap.querySelector('.mp-body').appendChild(host);
      const tb = newComponent('custom-tab-bar/index', host);
      host.__inst = tb;
      host.__v = { k: 'comp', tag: 'custom-tab-bar', path: 'custom-tab-bar/index', attrs: {}, events: {}, dataset: {} };
      inst.__tabBar = tb;
      renderInst(tb);
      pendingAttached.push(tb);
    }
    renderInst(inst);
    return inst;
  }

  function life(inst, name, arg) {
    const fn = inst && inst[name];
    if (typeof fn !== 'function') return;
    try { fn.call(inst, arg); } catch (e) { console.error('[sim] ' + inst.route + '.' + name + ' error:', e); }
  }

  function updateNav() {
    Object.keys(tabPages).forEach((k) => tabPages[k].__wrap.removeAttribute('data-top'));
    stack.forEach((p, i) => {
      p.__wrap.querySelector('.mp-nav-back').style.visibility = i > 0 ? 'visible' : 'hidden';
      // 录制脚本用 [data-top] 定位当前页
      p.__wrap.toggleAttribute('data-top', i === stack.length - 1);
    });
  }

  function mountPage(inst, animate) {
    const layer = pagesLayer();
    const wrap = inst.__wrap;
    const prev = stack[stack.length - 1];
    if (animate && prev) {
      wrap.classList.add('off-right', 'no-anim');
      layer.appendChild(wrap);
      void wrap.offsetWidth;
      wrap.classList.remove('no-anim');
      requestAnimationFrame(() => {
        wrap.classList.remove('off-right');
        prev.__wrap.classList.add('under');
      });
      setTimeout(() => { if (prev.__wrap.classList.contains('under')) prev.__wrap.classList.add('hidden'); }, 360);
    } else {
      if (!wrap.parentNode) layer.appendChild(wrap);
      if (prev) prev.__wrap.classList.add('hidden');
    }
  }

  function openPage(route, query, animate) {
    const prev = stack[stack.length - 1];
    if (prev) life(prev, 'onHide');
    const inst = createPage(route, query);
    mountPage(inst, animate);
    stack.push(inst);
    updateNav();
    flushAttached();
    life(inst, 'onLoad', query);
    life(inst, 'onShow');
    setTimeout(() => life(inst, 'onReady'), 30);
    if (isTab(route)) tabPages[route] = inst;
    emit('navigate', { route, depth: stack.length });
    return inst;
  }

  function unloadPage(inst) {
    life(inst, 'onUnload');
    destroyDom(inst.__root);
    if (inst.__tabBar) inst.__tabBar.__dead = true;
    if (inst.__wrap.parentNode) inst.__wrap.parentNode.removeChild(inst.__wrap);
    if (tabPages[inst.route] === inst) delete tabPages[inst.route];
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent('mpsim:' + name, { detail }));
  }

  /* ================= UI（toast / modal / picker / sheet） ================= */

  const UI = (function () {
    function layer() { return document.getElementById('mp-overlay'); }
    let toastEl = null;
    let toastTimer = null;

    function toast(o) {
      hideToast();
      const icon = o.icon === undefined ? 'success' : o.icon;
      const el = document.createElement('div');
      el.className = 'mp-toast-wrap' + (o.mask ? ' mask' : '');
      const box = document.createElement('div');
      const hasIcon = icon === 'success' || icon === 'error' || icon === 'loading' || o.image;
      box.className = 'mp-toast ' + (hasIcon ? 'with-icon' : 'text-only');
      if (icon === 'loading') box.innerHTML = '<div class="mp-spinner"></div>';
      else if (icon === 'success') box.innerHTML = '<svg class="mp-toast-ic" viewBox="0 0 48 48"><path d="M12 25 L21 34 L37 15" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      else if (icon === 'error') box.innerHTML = '<svg class="mp-toast-ic" viewBox="0 0 48 48"><circle cx="24" cy="24" r="17" fill="none" stroke="#fff" stroke-width="3"/><path d="M24 14 V27 M24 32 V34" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>';
      const t = document.createElement('div');
      t.className = 'mp-toast-title';
      t.textContent = o.title || '';
      box.appendChild(t);
      el.appendChild(box);
      layer().appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      toastEl = el;
      if (icon !== 'loading' || o.duration) {
        toastTimer = setTimeout(hideToast, o.duration || 1500);
      }
    }
    function hideToast() {
      clearTimeout(toastTimer);
      if (!toastEl) return;
      const el = toastEl;
      toastEl = null;
      el.classList.remove('show');
      setTimeout(() => el.remove(), 180);
    }

    function modal(o, done) {
      const el = document.createElement('div');
      el.className = 'mp-modal-wrap';
      el.innerHTML = '<div class="mp-modal"><div class="mp-modal-bd"></div><div class="mp-modal-ft"></div></div>';
      const bd = el.querySelector('.mp-modal-bd');
      if (o.title) { const h = document.createElement('div'); h.className = 'mp-modal-title'; h.textContent = o.title; bd.appendChild(h); }
      let input = null;
      if (o.editable) {
        input = document.createElement('textarea');
        input.className = 'mp-modal-input';
        input.placeholder = o.placeholderText || '';
        input.value = o.content || '';
        bd.appendChild(input);
      } else if (o.content) {
        const c = document.createElement('div');
        c.className = 'mp-modal-content';
        c.textContent = o.content;
        bd.appendChild(c);
      }
      const ft = el.querySelector('.mp-modal-ft');
      const close = (confirm) => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 200);
        done({ confirm, cancel: !confirm, content: input ? input.value : undefined, errMsg: 'showModal:ok' });
      };
      if (o.showCancel !== false) {
        const b = document.createElement('div');
        b.className = 'mp-modal-btn cancel';
        b.textContent = o.cancelText || '取消';
        if (o.cancelColor) b.style.color = o.cancelColor;
        b.addEventListener('click', () => close(false));
        ft.appendChild(b);
      }
      const ok = document.createElement('div');
      ok.className = 'mp-modal-btn confirm';
      ok.textContent = o.confirmText || '确定';
      ok.style.color = o.confirmColor || '#576B95';
      ok.addEventListener('click', () => close(true));
      ft.appendChild(ok);
      layer().appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
    }

    function sheet(itemList, opts, done) {
      const el = document.createElement('div');
      el.className = 'mp-sheet-wrap';
      el.innerHTML = '<div class="mp-sheet-mask"></div><div class="mp-sheet"><div class="mp-sheet-list"></div><div class="mp-sheet-gap"></div><div class="mp-sheet-item cancel">取消</div></div>';
      const list = el.querySelector('.mp-sheet-list');
      if (opts.alertText) { const t = document.createElement('div'); t.className = 'mp-sheet-alert'; t.textContent = opts.alertText; list.appendChild(t); }
      const close = (idx) => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 260);
        done(idx);
      };
      itemList.forEach((txt, i) => {
        const it = document.createElement('div');
        it.className = 'mp-sheet-item';
        if (typeof txt === 'object') { it.innerHTML = txt.html; } else it.textContent = txt;
        if (opts.itemColor) it.style.color = opts.itemColor;
        it.addEventListener('click', () => close(i));
        list.appendChild(it);
      });
      el.querySelector('.cancel').addEventListener('click', () => close(-1));
      el.querySelector('.mp-sheet-mask').addEventListener('click', () => close(-1));
      layer().appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      return el;
    }

    function shareSheet() {
      sheet([{ html: '<span class="mp-share-ic">💬</span>发送给朋友' }, { html: '<span class="mp-share-ic">🌐</span>分享到朋友圈' }], { alertText: '分享（模拟）' }, () => {});
    }

    // 滚轮式 picker：selector / multiSelector
    function picker(o, onConfirm, onColumn) {
      const el = document.createElement('div');
      el.className = 'mp-sheet-wrap mp-picker-wrap';
      el.innerHTML = '<div class="mp-sheet-mask"></div><div class="mp-picker"><div class="mp-picker-hd"><span class="mp-picker-cancel">取消</span><span class="mp-picker-ok">确定</span></div><div class="mp-picker-cols"><div class="mp-picker-band"></div></div></div>';
      const colsEl = el.querySelector('.mp-picker-cols');
      const ROW = 40;
      const values = o.columns.map((c, i) => Math.max(0, Math.min(c.length - 1, o.value[i] || 0)));
      const colEls = [];
      function fillCol(ci) {
        const col = colEls[ci];
        col.innerHTML = '<div class="mp-picker-pad"></div>' + o.columns[ci].map((t) => '<div class="mp-picker-row"></div>').join('') + '<div class="mp-picker-pad"></div>';
        const rows = col.querySelectorAll('.mp-picker-row');
        o.columns[ci].forEach((t, i) => {
          rows[i].textContent = t;
          rows[i].addEventListener('click', () => col.scrollTo({ top: i * ROW, behavior: 'smooth' }));
        });
        col.scrollTop = values[ci] * ROW;
      }
      o.columns.forEach((c, ci) => {
        const col = document.createElement('div');
        col.className = 'mp-picker-col';
        colsEl.appendChild(col);
        colEls.push(col);
        let t = null;
        col.addEventListener('scroll', () => {
          clearTimeout(t);
          t = setTimeout(() => {
            const idx = Math.max(0, Math.min(o.columns[ci].length - 1, Math.round(col.scrollTop / ROW)));
            if (idx !== values[ci]) {
              values[ci] = idx;
              if (onColumn) {
                const next = onColumn(ci, idx);
                if (next) {
                  next.forEach((cc, j) => {
                    if (j === ci) return;
                    const changedCol = JSON.stringify(cc) !== JSON.stringify(o.columns[j]);
                    o.columns[j] = cc;
                    if (changedCol) { values[j] = Math.min(values[j], cc.length - 1); if (j > ci) values[j] = 0; fillCol(j); }
                  });
                }
              }
            }
            mark();
          }, 90);
        });
        fillCol(ci);
      });
      function mark() {
        colEls.forEach((col, ci) => col.querySelectorAll('.mp-picker-row').forEach((r, i) => r.classList.toggle('on', i === values[ci])));
      }
      mark();
      const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 260); };
      el.querySelector('.mp-picker-cancel').addEventListener('click', close);
      el.querySelector('.mp-sheet-mask').addEventListener('click', close);
      el.querySelector('.mp-picker-ok').addEventListener('click', () => { close(); onConfirm(values.slice()); });
      el.__select = (ci, idx) => colEls[ci].scrollTo({ top: idx * ROW, behavior: 'smooth' });
      layer().appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      return el;
    }

    function preview(urls, current) {
      const el = document.createElement('div');
      el.className = 'mp-preview';
      const img = document.createElement('img');
      img.src = resolveSrc(current || urls[0], '');
      el.appendChild(img);
      const idx = Math.max(0, urls.indexOf(current));
      const n = document.createElement('div');
      n.className = 'mp-preview-n';
      n.textContent = (idx + 1) + ' / ' + urls.length;
      el.appendChild(n);
      el.addEventListener('click', () => { el.classList.remove('show'); setTimeout(() => el.remove(), 200); });
      layer().appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
    }

    return { toast, hideToast, modal, sheet, shareSheet, picker, preview };
  })();

  function openPicker(el) {
    const a = el.__attrs || {};
    const mode = a.mode || 'selector';
    const rk = a['range-key'];
    const label = (x) => (x && typeof x === 'object' ? toStr(rk ? x[rk] : x) : toStr(x));
    if (mode === 'multiSelector') {
      const range = (a.range || []).map((col) => (col || []).map(label));
      const value = Array.isArray(a.value) ? a.value : [];
      UI.picker({ columns: range, value }, (vals) => fireEvent(el, 'change', { value: vals }), (column, idx) => {
        fireEvent(el, 'columnchange', { column, value: idx });
        const fresh = (el.__attrs.range || []).map((col) => (col || []).map(label));
        return fresh;
      });
    } else if (mode === 'selector') {
      const range = (a.range || []).map(label);
      UI.picker({ columns: [range], value: [+a.value || 0] }, (vals) => fireEvent(el, 'change', { value: vals[0] }));
    } else {
      UI.toast({ title: 'picker mode=' + mode + '（未模拟）', icon: 'none' });
    }
  }

  /* ================= 选择器查询 ================= */

  function createSelectorQuery() {
    const tasks = [];
    let root = null;
    const q = {
      in(comp) { root = comp ? comp.__root : null; return q; },
      select(sel) { return nodesRef(sel, false, false); },
      selectAll(sel) { return nodesRef(sel, true, false); },
      selectViewport() { return nodesRef(null, false, true); },
      exec(cb) {
        setTimeout(() => {
          const res = tasks.map((t) => t());
          if (typeof cb === 'function') cb(res);
        }, 16);
        return q;
      }
    };
    function currentRoot() {
      const top = stack[stack.length - 1];
      return root || (top && top.__root);
    }
    function nodesRef(sel, all, viewport) {
      function add(fields, cb) {
        tasks.push(() => {
          const scope = currentRoot();
          let nodes = [];
          if (viewport) nodes = [null];
          else if (scope) nodes = all ? Array.from(scope.querySelectorAll(sel)) : [scope.querySelector(sel)].filter(Boolean);
          const out = nodes.map((n) => nodeInfo(n, fields, scope));
          const r = all ? out : (out[0] || null);
          if (typeof cb === 'function') cb(r);
          return r;
        });
        return q;
      }
      return {
        boundingClientRect: (cb) => add({ rect: true, size: true, id: true, dataset: true }, cb),
        scrollOffset: (cb) => add({ scrollOffset: true, id: true, dataset: true }, cb),
        fields: (f, cb) => add(f || {}, cb),
        node: (cb) => add({ node: true }, cb),
        context: (cb) => add({ context: true }, cb)
      };
    }
    return q;
  }

  function nodeInfo(n, f, scope) {
    const body = scope ? bodyOf(scope) : null;
    const b = body ? body.getBoundingClientRect() : { left: 0, top: 0, width: CFG.screenW, height: 0 };
    const out = {};
    if (!n) {
      const sc = body && body.querySelector('.mp-scroll');
      if (f.rect || f.size) Object.assign(out, { left: 0, top: 0, right: b.width, bottom: b.height, width: b.width, height: b.height });
      if (f.scrollOffset) Object.assign(out, { scrollTop: sc ? sc.scrollTop : 0, scrollLeft: 0, scrollHeight: sc ? sc.scrollHeight : 0 });
      return out;
    }
    const r = n.getBoundingClientRect();
    if (f.id) out.id = n.id || '';
    if (f.dataset) out.dataset = n.__dataset || {};
    if (f.rect) Object.assign(out, { left: r.left - b.left, top: r.top - b.top, right: r.right - b.left, bottom: r.bottom - b.top });
    if (f.size) Object.assign(out, { width: r.width, height: r.height });
    if (f.scrollOffset) Object.assign(out, { scrollTop: n.scrollTop, scrollLeft: n.scrollLeft, scrollHeight: n.scrollHeight, scrollWidth: n.scrollWidth });
    if (f.node) { if (n.tagName === 'CANVAS') prepCanvas(n); out.node = n; }
    if (f.context && n.tagName === 'VIDEO') out.context = videoCtx(n);
    if (f.computedStyle) {
      const cs = getComputedStyle(n);
      f.computedStyle.forEach((k) => { out[k] = cs.getPropertyValue(k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())); });
    }
    return out;
  }

  function videoCtx(v) {
    return {
      play() { v && v.play && v.play().catch(() => {}); },
      pause() { v && v.pause && v.pause(); },
      stop() { if (v) { v.pause(); v.currentTime = 0; } },
      seek(t) { if (v) v.currentTime = t; },
      requestFullScreen() {}, exitFullScreen() {}
    };
  }

  /* ================= wx API ================= */

  function asyncApi(fn) {
    return function (opts) {
      opts = opts || {};
      const p = new Promise((resolve, reject) => {
        try { fn(opts, resolve, reject); } catch (e) { reject({ errMsg: String(e && e.message || e) }); }
      });
      const hasCb = opts.success || opts.fail || opts.complete;
      p.then((r) => {
        if (opts.success) opts.success(r);
        if (opts.complete) opts.complete(r);
      }, (e) => {
        if (opts.fail) opts.fail(e);
        if (opts.complete) opts.complete(e);
      }).catch((err) => console.error('[sim] callback error', err));
      if (!hasCb) return p;
      p.catch(() => {});
      return undefined;
    };
  }

  function storageKey(k) { return CFG.storagePrefix + k; }

  // 选图结果固定轮换，保证每次录制画面一致；脚本可用 window.__SIM_NEXT_MEDIA__ 指定
  const MEDIA_POOL = ['/assets/demo/climb4.jpg', '/assets/demo/climb6.jpg', '/assets/demo/climb2.jpg'];
  let mediaTurn = 0;

  const api = {
    // 关键：不提供 cloud → api.js 走本地演示数据
    cloud: undefined,

    getSystemInfoSync() {
      return Object.assign(api.getWindowInfo(), api.getDeviceInfo(), api.getAppBaseInfo());
    },
    getWindowInfo() {
      return {
        pixelRatio: 3, screenWidth: CFG.screenW, screenHeight: CFG.screenH,
        windowWidth: CFG.screenW, windowHeight: CFG.screenH - CFG.statusBar - CFG.navBar,
        statusBarHeight: CFG.statusBar, screenTop: CFG.statusBar + CFG.navBar,
        safeArea: { left: 0, right: CFG.screenW, top: CFG.statusBar, bottom: CFG.screenH - CFG.safeBottom, width: CFG.screenW, height: CFG.screenH - CFG.statusBar - CFG.safeBottom }
      };
    },
    getDeviceInfo() { return { brand: 'iPhone', model: 'iPhone 15 (模拟)', platform: 'ios', system: 'iOS 17.5', benchmarkLevel: 1 }; },
    getAppBaseInfo() { return { SDKVersion: MP.appJson.libVersion || '3.0.0', language: 'zh_CN', version: '8.0.50', theme: 'light' }; },
    getMenuButtonBoundingClientRect() { return { width: 87, height: 32, top: 48, bottom: 80, left: 281, right: 368 }; },
    getLaunchOptionsSync() { return { path: stack[0] ? stack[0].route : '', query: {}, scene: 1001 }; },
    getEnterOptionsSync() { return api.getLaunchOptionsSync(); },
    getAccountInfoSync() { return { miniProgram: { appId: 'sim', envVersion: 'develop', version: '' } }; },
    canIUse() { return true; },
    nextTick(cb) { Promise.resolve().then(cb); },
    onAppShow() {}, onAppHide() {}, offAppShow() {}, offAppHide() {}, onError() {},
    reportAnalytics() {}, reportEvent() {},
    showShareMenu: asyncApi((o, ok) => ok({})),
    hideShareMenu: asyncApi((o, ok) => ok({})),
    updateShareMenu: asyncApi((o, ok) => ok({})),

    // 存储
    setStorageSync(k, v) { localStorage.setItem(storageKey(k), JSON.stringify(v === undefined ? null : v)); },
    getStorageSync(k) {
      const raw = localStorage.getItem(storageKey(k));
      if (raw == null) return '';
      try { return JSON.parse(raw); } catch (e) { return ''; }
    },
    removeStorageSync(k) { localStorage.removeItem(storageKey(k)); },
    clearStorageSync() {
      Object.keys(localStorage).filter((k) => k.indexOf(CFG.storagePrefix) === 0).forEach((k) => localStorage.removeItem(k));
    },
    getStorageInfoSync() {
      const keys = Object.keys(localStorage).filter((k) => k.indexOf(CFG.storagePrefix) === 0).map((k) => k.slice(CFG.storagePrefix.length));
      return { keys, currentSize: 1, limitSize: 10240 };
    },
    setStorage: asyncApi((o, ok) => { api.setStorageSync(o.key, o.data); ok({}); }),
    getStorage: asyncApi((o, ok, fail) => {
      const raw = localStorage.getItem(storageKey(o.key));
      if (raw == null) fail({ errMsg: 'getStorage:fail data not found' }); else ok({ data: JSON.parse(raw) });
    }),
    removeStorage: asyncApi((o, ok) => { api.removeStorageSync(o.key); ok({}); }),

    // 界面
    showToast: asyncApi((o, ok) => { UI.toast(o); ok({}); }),
    hideToast: asyncApi((o, ok) => { UI.hideToast(); ok({}); }),
    showLoading: asyncApi((o, ok) => { UI.toast(Object.assign({}, o, { icon: 'loading', duration: 0 })); ok({}); }),
    hideLoading: asyncApi((o, ok) => { UI.hideToast(); ok({}); }),
    showModal: asyncApi((o, ok) => UI.modal(o, ok)),
    showActionSheet: asyncApi((o, ok, fail) => UI.sheet(o.itemList || [], o, (i) => (i < 0 ? fail({ errMsg: 'showActionSheet:fail cancel' }) : ok({ tapIndex: i })))),
    setNavigationBarTitle: asyncApi((o, ok) => {
      const top = stack[stack.length - 1];
      if (top) top.__wrap.querySelector('.mp-nav-title').textContent = o.title || '';
      ok({});
    }),
    setNavigationBarColor: asyncApi((o, ok) => {
      const top = stack[stack.length - 1];
      if (top) {
        const nav = top.__wrap.querySelector('.mp-nav');
        if (o.backgroundColor) nav.style.background = o.backgroundColor;
        nav.classList.toggle('white', o.frontColor === '#ffffff');
      }
      ok({});
    }),
    showNavigationBarLoading() {}, hideNavigationBarLoading() {},
    startPullDownRefresh: asyncApi((o, ok) => ok({})),
    stopPullDownRefresh: asyncApi((o, ok) => ok({})),
    pageScrollTo: asyncApi((o, ok) => {
      const top = stack[stack.length - 1];
      const sc = top && top.__wrap.querySelector('.mp-scroll');
      if (sc) sc.scrollTo({ top: o.scrollTop || 0, behavior: o.duration === 0 ? 'auto' : 'smooth' });
      ok({});
    }),
    previewImage: asyncApi((o, ok) => { UI.preview(o.urls || [], o.current); ok({}); }),
    vibrateShort: asyncApi((o, ok) => ok({})),
    vibrateLong: asyncApi((o, ok) => ok({})),
    setClipboardData: asyncApi((o, ok) => { UI.toast({ title: '内容已复制', icon: 'none' }); ok({}); }),
    getClipboardData: asyncApi((o, ok) => ok({ data: '' })),
    makePhoneCall: asyncApi((o, ok) => ok({})),
    openLocation: asyncApi((o, ok) => { UI.toast({ title: '打开地图（模拟）', icon: 'none' }); ok({}); }),

    // 路由
    navigateTo: asyncApi((o, ok, fail) => {
      const cur = stack[stack.length - 1];
      const { route, query } = parseUrl(o.url, cur && cur.route);
      if (isTab(route)) return fail({ errMsg: 'navigateTo:fail can not navigateTo a tabbar page' });
      if (!MP.views[route]) return fail({ errMsg: 'navigateTo:fail page "' + route + '" is not found' });
      openPage(route, query, true);
      ok({ errMsg: 'navigateTo:ok', eventChannel: { emit() {}, on() {} } });
    }),
    redirectTo: asyncApi((o, ok, fail) => {
      const cur = stack[stack.length - 1];
      const { route, query } = parseUrl(o.url, cur && cur.route);
      if (isTab(route)) return fail({ errMsg: 'redirectTo:fail can not redirectTo a tabbar page' });
      if (cur && !isTab(cur.route)) { stack.pop(); unloadPage(cur); }
      openPage(route, query, false);
      ok({});
    }),
    navigateBack: asyncApi((o, ok, fail) => {
      const delta = Math.max(1, o.delta || 1);
      if (stack.length <= 1) return fail({ errMsg: 'navigateBack:fail cannot navigate back at first page.' });
      const n = Math.min(delta, stack.length - 1);
      const top = stack[stack.length - 1];
      const dropped = stack.splice(stack.length - n, n);
      const back = stack[stack.length - 1];
      top.__wrap.removeAttribute('data-top');
      back.__wrap.classList.remove('hidden');
      // 中间页直接卸载，栈顶做滑出动画
      dropped.slice(0, -1).forEach(unloadPage);
      void back.__wrap.offsetWidth;
      requestAnimationFrame(() => {
        back.__wrap.classList.remove('under');
        top.__wrap.classList.add('off-right');
      });
      setTimeout(() => unloadPage(top), 360);
      updateNav();
      life(back, 'onShow');
      emit('navigate', { route: back.route, depth: stack.length });
      ok({});
    }),
    switchTab: asyncApi((o, ok, fail) => {
      const { route } = parseUrl(o.url, '');
      if (!isTab(route)) return fail({ errMsg: 'switchTab:fail can not switch to no-tabBar page' });
      const cur = stack[stack.length - 1];
      if (cur && cur.route === route && stack.length === 1) return ok({});
      if (cur) life(cur, 'onHide');
      // 关闭所有非 tab 页
      while (stack.length) {
        const p = stack.pop();
        if (isTab(p.route)) p.__wrap.classList.add('hidden');
        else unloadPage(p);
      }
      const keep = tabPages[route];
      if (keep) {
        keep.__wrap.classList.remove('hidden', 'under', 'off-right');
        stack.push(keep);
        updateNav();
        life(keep, 'onShow');
        emit('navigate', { route, depth: 1 });
      } else {
        openPage(route, {}, false);
      }
      ok({});
    }),
    reLaunch: asyncApi((o, ok) => {
      const { route, query } = parseUrl(o.url, '');
      while (stack.length) unloadPage(stack.pop());
      Object.keys(tabPages).forEach((k) => { unloadPage(tabPages[k]); });
      openPage(route, query, false);
      ok({});
    }),

    // 位置 / 授权
    getSetting: asyncApi((o, ok) => ok({ authSetting: { 'scope.userLocation': !!CFG.locationAuthorized } })),
    openSetting: asyncApi((o, ok) => ok({ authSetting: { 'scope.userLocation': !!CFG.locationAuthorized } })),
    authorize: asyncApi((o, ok, fail) => (CFG.locationAuthorized ? ok({}) : fail({ errMsg: 'authorize:fail auth deny' }))),
    getLocation: asyncApi((o, ok, fail) => {
      if (!CFG.locationAuthorized) return fail({ errMsg: 'getLocation:fail auth deny' });
      setTimeout(() => ok(Object.assign({ speed: 0, accuracy: 30, altitude: 0, horizontalAccuracy: 30, verticalAccuracy: 0 }, CFG.location)), 60);
    }),
    chooseLocation: asyncApi((o, ok, fail) => fail({ errMsg: 'chooseLocation:fail (sim)' })),

    // 网络：演示环境不出网，统一失败（调用方都有兜底）
    request: asyncApi((o, ok, fail) => setTimeout(() => fail({ errMsg: 'request:fail (sim offline)' }), 30)),
    uploadFile: asyncApi((o, ok, fail) => fail({ errMsg: 'uploadFile:fail (sim offline)' })),
    downloadFile: asyncApi((o, ok, fail) => fail({ errMsg: 'downloadFile:fail (sim offline)' })),
    login: asyncApi((o, ok) => ok({ code: 'sim-code' })),
    getUserProfile: asyncApi((o, ok, fail) => fail({ errMsg: 'getUserProfile:fail (sim)' })),
    requestSubscribeMessage: asyncApi((o, ok) => {
      const r = { errMsg: 'requestSubscribeMessage:ok' };
      (o.tmplIds || []).forEach((id) => { r[id] = 'accept'; });
      ok(r);
    }),

    // 媒体
    chooseMedia: asyncApi((o, ok) => {
      const queue = window.__SIM_NEXT_MEDIA__ || [];
      const picks = queue.length ? queue.splice(0, o.count || 1) : [MEDIA_POOL[mediaTurn++ % MEDIA_POOL.length]];
      setTimeout(() => ok({
        type: 'image',
        tempFiles: picks.map((p) => ({ tempFilePath: p, size: 120000, fileType: 'image', width: 640, height: 853 }))
      }), 120);
    }),
    chooseImage: asyncApi((o, ok) => {
      const p = MEDIA_POOL[0];
      ok({ tempFilePaths: [p], tempFiles: [{ path: p, size: 120000 }] });
    }),
    getImageInfo: asyncApi((o, ok, fail) => {
      const img = new Image();
      img.onload = () => ok({ width: img.naturalWidth, height: img.naturalHeight, path: o.src, orientation: 'up', type: 'jpeg' });
      img.onerror = () => fail({ errMsg: 'getImageInfo:fail' });
      img.src = resolveSrc(o.src, '');
    }),
    compressImage: asyncApi((o, ok) => ok({ tempFilePath: o.src })),
    saveImageToPhotosAlbum: asyncApi((o, ok) => ok({})),
    canvasToTempFilePath: asyncApi((o, ok, fail) => {
      try {
        ok({ tempFilePath: o.canvas.toDataURL('image/png') });
      } catch (e) {
        fail({ errMsg: 'canvasToTempFilePath:fail ' + e.message });
      }
    }),
    createVideoContext(id) {
      const top = stack[stack.length - 1];
      return videoCtx(top && top.__root.querySelector('#' + CSS.escape(id)));
    },
    createSelectorQuery() { return createSelectorQuery(); },
    createIntersectionObserver() { return { relativeToViewport() { return this; }, relativeTo() { return this; }, observe() {}, disconnect() {} }; },
    getFileSystemManager() {
      return {
        saveFileSync(temp) { return temp; },
        saveFile(o) { setTimeout(() => o.success && o.success({ savedFilePath: o.tempFilePath }), 0); },
        readFile(o) { setTimeout(() => o.fail && o.fail({ errMsg: 'readFile:fail (sim)' }), 0); },
        readFileSync() { return ''; },
        writeFile(o) { setTimeout(() => o.success && o.success({}), 0); },
        writeFileSync() {},
        accessSync() { throw new Error('no such file'); },
        unlink(o) { setTimeout(() => o.success && o.success({}), 0); }
      };
    }
  };

  const warned = {};
  const wx = new Proxy(api, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (!warned[k]) { warned[k] = true; warn('wx.' + k + ' 未模拟，按空操作处理'); }
      return asyncApi((o, ok) => ok({}));
    }
  });

  /* ================= 全局注入 ================= */

  window.wx = wx;
  window.Page = function (def) { pageDefs[registering] = def; };
  window.Component = function (def) {
    // 页面也可以用 Component 构造；这里按注册路径区分
    if (MP.views[registering] && MP.views[registering].kind === 'page') {
      const methods = def.methods || {};
      const pageDef = Object.assign({}, methods, { data: def.data });
      ['onLoad', 'onShow', 'onReady', 'onHide', 'onUnload'].forEach((k) => { if (def[k]) pageDef[k] = def[k]; });
      pageDefs[registering] = pageDef;
    } else {
      compDefs[registering] = def;
    }
  };
  window.Behavior = function (def) { return def; };
  window.App = function (def) {
    appInst = Object.assign({}, def, { globalData: clone(def.globalData || {}) });
    Object.keys(def).forEach((k) => { if (typeof def[k] === 'function') appInst[k] = def[k]; });
  };
  window.getApp = function () { return appInst; };
  window.getCurrentPages = function () { return stack.slice(); };

  /* ================= 启动 ================= */

  function boot(opts) {
    opts = opts || {};
    const scr = screen();
    scr.style.setProperty('--sab', CFG.safeBottom + 'px');
    installDelegation(scr);
    if (opts.resetStorage) api.clearStorageSync();
    const seed = opts.storage || window.__SIM_SEED__;
    if (seed) Object.keys(seed).forEach((k) => api.setStorageSync(k, seed[k]));
    loadModule('app.js');
    if (appInst && typeof appInst.onLaunch === 'function') {
      try { appInst.onLaunch.call(appInst, { path: '', query: {}, scene: 1001 }); } catch (e) { console.error('[sim] onLaunch error', e); }
    }
    const first = opts.entry || (MP.appJson.entryPagePath) || MP.appJson.pages[0];
    const { route, query } = parseUrl('/' + first, '');
    if (isTab(route)) api.switchTab({ url: '/' + route });
    else openPage(route, query, false);
    if (appInst && typeof appInst.onShow === 'function') appInst.onShow.call(appInst, {});
    log('booted at', route);
  }

  window.__mpsim = {
    boot,
    wx,
    stack,
    UI,
    config: CFG,
    top() { return stack[stack.length - 1]; },
    topWrap() { const t = stack[stack.length - 1]; return t && t.__wrap; },
    // 测试用：按小程序根目录路径取模块，如 require('/utils/api')
    require(id) { return loadModule(resolveModule('app.js', id)); },
    resolveSrc
  };
})();
