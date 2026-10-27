// 把 miniprogram/ 编译成浏览器可跑的 bundle：
//   WXML → AST（运行时解释）、WXSS → 带页面作用域的 CSS（rpx→px）、JS/TS → CommonJS 模块表
// 产物写到 tools/demo-video/dist/，由 runtime/ 下的模拟器加载。零第三方依赖。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MP = path.join(ROOT, 'miniprogram');
const DIST = path.join(__dirname, 'dist');

// 375 宽设计稿：1rpx = 0.5px
const RPX = 0.5;

/* ---------------- WXML ---------------- */

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e] != null ? ENTITIES[e] : m;
  });
}

// "a {{b}} c" → [{s:'a '}, {e:'b'}, {s:' c'}]；纯 "{{b}}" → {e:'b', raw:true}
function compileInterp(str) {
  const parts = [];
  let i = 0;
  while (i < str.length) {
    const j = str.indexOf('{{', i);
    if (j < 0) { parts.push({ s: str.slice(i) }); break; }
    if (j > i) parts.push({ s: str.slice(i, j) });
    const k = str.indexOf('}}', j + 2);
    if (k < 0) { parts.push({ s: str.slice(j) }); break; }
    parts.push({ e: str.slice(j + 2, k).trim() });
    i = k + 2;
  }
  if (parts.length === 1 && parts[0].e != null) return { e: parts[0].e, raw: true };
  if (parts.every((p) => p.s != null)) return { s: parts.map((p) => p.s).join('') };
  return { p: parts };
}

function parseWxml(src, file) {
  const root = { tag: '#root', c: [] };
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];

  function readText() {
    // 文本读到下一个标签开始；{{ }} 内的 < 不算
    let j = i;
    while (j < src.length) {
      if (src.startsWith('{{', j)) {
        const k = src.indexOf('}}', j + 2);
        j = k < 0 ? src.length : k + 2;
        continue;
      }
      if (src[j] === '<') break;
      j++;
    }
    const raw = src.slice(i, j);
    i = j;
    if (!raw.trim()) return;
    // 模板源码里的换行缩进不进入渲染（数据里的 \n 保留）
    const text = decodeEntities(raw.replace(/\s*\n\s*/g, ''));
    top().c.push({ t: compileInterp(text) });
  }

  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const j = src.indexOf('-->', i + 4);
      i = j < 0 ? src.length : j + 3;
      continue;
    }
    if (src[i] === '<' && src[i + 1] === '/') {
      const j = src.indexOf('>', i);
      const tag = src.slice(i + 2, j).trim();
      // 弹到匹配的标签
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) { stack.length = k; break; }
      }
      i = j + 1;
      continue;
    }
    if (src[i] === '<' && /[a-zA-Z]/.test(src[i + 1] || '')) {
      i++;
      let j = i;
      while (j < src.length && /[^\s/>]/.test(src[j])) j++;
      const tag = src.slice(i, j);
      i = j;
      const attrs = {};
      let selfClose = false;
      for (;;) {
        while (/\s/.test(src[i])) i++;
        if (src[i] === '/' && src[i + 1] === '>') { selfClose = true; i += 2; break; }
        if (src[i] === '>') { i++; break; }
        if (i >= src.length) throw new Error(file + ': unexpected EOF in <' + tag + '>');
        let k = i;
        while (k < src.length && /[^\s=/>]/.test(src[k])) k++;
        const name = src.slice(i, k);
        i = k;
        while (/\s/.test(src[i])) i++;
        if (src[i] === '=') {
          i++;
          while (/\s/.test(src[i])) i++;
          const q = src[i];
          let val;
          if (q === '"' || q === "'") {
            // 值里可能含 {{ a > b }} 与另一种引号
            let e = i + 1;
            while (e < src.length && src[e] !== q) {
              if (src.startsWith('{{', e)) {
                const z = src.indexOf('}}', e + 2);
                // {{ }} 内若出现同种引号，WXML 本身也会截断；这里按引号优先
                const qi = src.indexOf(q, e + 2);
                if (z >= 0 && (qi < 0 || z < qi)) { e = z + 2; continue; }
              }
              e++;
            }
            val = src.slice(i + 1, e);
            i = e + 1;
          } else {
            let e = i;
            while (e < src.length && /[^\s>]/.test(src[e])) e++;
            val = src.slice(i, e);
            i = e;
          }
          attrs[name] = compileInterp(decodeEntities(val));
        } else if (name) {
          attrs[name] = { s: true };
        }
      }
      const node = { tag, a: attrs, c: [] };
      top().c.push(node);
      if (!selfClose) stack.push(node);
      continue;
    }
    readText();
  }
  return root.c;
}

/* ---------------- WXSS ---------------- */

function convertUnits(css) {
  return css
    .replace(/(-?\d*\.?\d+)rpx/g, (m, n) => +(parseFloat(n) * RPX).toFixed(3) + 'px')
    .replace(/env\(\s*safe-area-inset-bottom\s*\)/g, 'var(--sab, 0px)')
    .replace(/constant\(\s*safe-area-inset-bottom\s*\)/g, 'var(--sab, 0px)');
}

// 极简 CSS 解析：只处理顶层规则与 @media 嵌套，够用即可
function scopeCss(css, scope, pageScope) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let i = 0;
  while (i < css.length) {
    const brace = css.indexOf('{', i);
    if (brace < 0) break;
    const head = css.slice(i, brace).trim();
    // 找配对的 }
    let depth = 1;
    let j = brace + 1;
    while (j < css.length && depth) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(brace + 1, j - 1);
    i = j;
    if (head.startsWith('@media') || head.startsWith('@supports')) {
      out += head + '{' + scopeCss(body, scope, pageScope) + '}\n';
    } else if (head.startsWith('@')) {
      out += head + '{' + body + '}\n';
    } else {
      const sel = head.split(',').map((s) => scopeSelector(s.trim(), scope, pageScope)).join(', ');
      out += sel + '{' + body + '}\n';
    }
  }
  return out;
}

function scopeSelector(sel, scope, pageScope) {
  // page 选择器 → 页面根节点
  if (/^page\b/.test(sel)) return sel.replace(/^page\b/, pageScope);
  if (/^:host\b/.test(sel)) return sel.replace(/^:host/, scope);
  return scope ? scope + ' ' + sel : sel;
}

/* ---------------- 模块 ---------------- */

function stripTs(code) {
  const m = require('node:module');
  if (typeof m.stripTypeScriptTypes === 'function') {
    const warn = process.emitWarning;
    process.emitWarning = () => {};
    try { return m.stripTypeScriptTypes(code); } finally { process.emitWarning = warn; }
  }
  // 兜底：只处理 app.ts 里出现的几种写法
  return code
    .replace(/App<[^>]+>\(/g, 'App(')
    .replace(/\(([a-zA-Z_$][\w$]*)\s*:\s*[\w.<>[\]| ]+\)/g, '($1)');
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function rel(p) {
  return path.relative(MP, p).split(path.sep).join('/');
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}

function build() {
  const appJson = readJson(path.join(MP, 'app.json'), {});
  const files = walk(MP);
  const modules = [];
  for (const f of files) {
    const r = rel(f);
    if (r.startsWith('miniprogram_npm/') || r.endsWith('.d.ts')) continue;
    if (r.endsWith('.js')) modules.push({ id: r, code: fs.readFileSync(f, 'utf8') });
    else if (r.endsWith('.ts')) {
      const id = r.replace(/\.ts$/, '.js');
      if (!files.includes(path.join(MP, id))) modules.push({ id, code: stripTs(fs.readFileSync(f, 'utf8')) });
    }
  }

  const views = {};
  let css = '';
  const appCssFile = ['app.wxss', 'app.less'].map((n) => path.join(MP, n)).find((p) => fs.existsSync(p));
  if (appCssFile) css += '/* app */\n' + scopeCss(convertUnits(fs.readFileSync(appCssFile, 'utf8')), '', '.mp-page');

  function addView(id, kind) {
    const base = path.join(MP, id);
    const wxml = base + '.wxml';
    if (!fs.existsSync(wxml)) return;
    const json = readJson(base + '.json', {});
    views[id] = { kind, json, ast: parseWxml(fs.readFileSync(wxml, 'utf8'), id) };
    const wxss = base + '.wxss';
    if (fs.existsSync(wxss)) {
      const raw = convertUnits(fs.readFileSync(wxss, 'utf8'));
      if (kind === 'page') {
        const sc = '.p-' + id.replace(/[/]/g, '-');
        css += '/* ' + id + ' */\n' + scopeCss(raw, sc, sc);
      } else {
        // 组件样式限定在宿主节点内（宿主带 data-comp 属性）
        const sc = '[data-comp="' + id + '"]';
        css += '/* ' + id + ' */\n' + scopeCss(raw, sc, sc);
      }
    }
    // 递归登记组件
    const using = json.usingComponents || {};
    Object.keys(using).forEach((k) => {
      const cid = using[k].replace(/^\//, '');
      if (!views[cid]) addView(cid, 'comp');
    });
  }

  (appJson.pages || []).forEach((p) => addView(p, 'page'));
  if (appJson.tabBar && appJson.tabBar.custom) addView('custom-tab-bar/index', 'comp');

  fs.mkdirSync(DIST, { recursive: true });
  let js = '/* 由 tools/demo-video/compile.js 生成，勿手改 */\n';
  js += 'window.__MP__ = {\n';
  js += '  appJson: ' + JSON.stringify(appJson) + ',\n';
  js += '  views: ' + JSON.stringify(views) + ',\n';
  js += '  modules: {\n';
  for (const m of modules) {
    js += '    ' + JSON.stringify(m.id) + ': function (module, exports, require) {\n' + m.code + '\n},\n';
  }
  js += '  }\n};\n';
  fs.writeFileSync(path.join(DIST, 'mp-bundle.js'), js);
  fs.writeFileSync(path.join(DIST, 'mp-bundle.css'), css);
  return { pages: (appJson.pages || []).length, views: Object.keys(views).length, modules: modules.length };
}

module.exports = { build, parseWxml };

if (require.main === module) {
  const r = build();
  console.log('[compile] pages=%d views=%d modules=%d → %s', r.pages, r.views, r.modules, path.relative(ROOT, DIST));
}
