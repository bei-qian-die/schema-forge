/* ==========================================================================
   schema-forge · 预览页交互
   1) 入场序列 + 导航高亮
   2) Designer 舱体：模式切换 / 字段选中 / 属性面板 Tab
   3) ★ 迷你表达式引擎：lexer → parser → 依赖收集 → 拓扑排序 → 脏值传播
      这段代码是 §06 运行时效果图背后的真实逻辑，可直接作为 W2 的起点
   ========================================================================== */
(function () {
  'use strict';

  /* ───────────────────────── 1. 入场序列 ───────────────────────── */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = document.querySelectorAll('.reveal');

  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* 导航高亮 */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.navlinks a'));
  var secs = navLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  function syncNav() {
    var y = window.scrollY + 140, idx = -1;
    secs.forEach(function (s, i) { if (s && s.offsetTop <= y) idx = i; });
    navLinks.forEach(function (a, i) { a.classList.toggle('is-active', i === idx); });
  }
  window.addEventListener('scroll', syncNav, { passive: true });
  syncNav();

  /* ───────────────────────── 2. Designer 舱体 ───────────────────────── */

  // 模式切换
  var segBtns = document.querySelectorAll('.ck-seg button');
  segBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      segBtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
  });

  // 属性面板 Tab
  var tabBtns = document.querySelectorAll('.ck-tabs button');
  var panes = document.querySelectorAll('.ck-tabpane');
  tabBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.dataset.tab;
      tabBtns.forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      panes.forEach(function (p) { p.classList.toggle('is-on', p.dataset.pane === name); });
    });
  });

  // 字段选中 → 属性面板联动
  var FIELD_DATA = {
    'invoice.type':  { label: '发票类型',       ph: '请选择发票类型',        colSpan: '6' },
    'company.name':  { label: '单位名称',       ph: '请输入单位全称',        colSpan: '6' },
    'company.taxNo': { label: '纳税人识别号',   ph: '请输入 15/18/20 位税号', colSpan: '6' },
    'amount':        { label: '开票金额',       ph: '0.00',                  colSpan: '6' },
    'invoice.date':  { label: '开票日期',       ph: 'YYYY-MM-DD',            colSpan: '6' },
    'remark':        { label: '备注',           ph: '选填，500 字以内',      colSpan: '12' }
  };
  var pKey = document.getElementById('p-key');
  var pLabel = document.getElementById('p-label');
  var pPh = document.getElementById('p-ph');
  var fields = document.querySelectorAll('.ck-canvas .field');

  function selectField(el) {
    fields.forEach(function (f) { f.classList.remove('is-sel'); });
    el.classList.add('is-sel');
    var d = FIELD_DATA[el.dataset.key];
    if (!d) return;
    pKey.value = el.dataset.key;
    pLabel.value = d.label;
    pPh.value = d.ph;
  }
  fields.forEach(function (f) {
    f.addEventListener('click', function () { selectField(f); });
    f.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectField(f); }
    });
  });

  // 物料点击态
  var mats = document.querySelectorAll('.ck-mat');
  mats.forEach(function (m) {
    m.addEventListener('click', function () {
      mats.forEach(function (x) { x.classList.remove('is-on'); });
      m.classList.add('is-on');
    });
  });

  /* ────────────────────────────────────────────────────────────────
     3. ★ 迷你表达式引擎
     词法 → 递归下降 → AST → 依赖收集 → 依赖图 → 拓扑排序 → 脏值传播
     ──────────────────────────────────────────────────────────────── */

  var OPERATORS = ['===', '!==', '==', '!=', '>=', '<=', '&&', '||', '>', '<', '!', '?', ':', '(', ')', '+', '-', '*', '/'];

  /** 词法分析 */
  function lex(src) {
    var toks = [], i = 0;
    while (i < src.length) {
      var c = src[i];
      if (/\s/.test(c)) { i++; continue; }

      if (c === "'" || c === '"') {                       // 字符串
        var j = i + 1, s = '';
        while (j < src.length && src[j] !== c) s += src[j++];
        toks.push({ t: 'str', v: s }); i = j + 1; continue;
      }
      if (/[0-9]/.test(c)) {                              // 数字
        var k = i;
        while (k < src.length && /[0-9.]/.test(src[k])) k++;
        toks.push({ t: 'num', v: parseFloat(src.slice(i, k)) }); i = k; continue;
      }
      if (c === '$') {                                    // 路径 $form.a.b
        var m = i + 1;
        while (m < src.length && /[\w$.]/.test(src[m])) m++;
        toks.push({ t: 'path', v: src.slice(i, m) }); i = m; continue;
      }
      if (/[A-Za-z_]/.test(c)) {                          // 标识符 / 关键字
        var n = i;
        while (n < src.length && /[\w$]/.test(src[n])) n++;
        var w = src.slice(i, n); i = n;
        if (w === 'true' || w === 'false') toks.push({ t: 'bool', v: w === 'true' });
        else if (w === 'null') toks.push({ t: 'null', v: null });
        else toks.push({ t: 'ident', v: w });
        continue;
      }
      var op = null;
      for (var o = 0; o < OPERATORS.length; o++) {
        if (src.startsWith(OPERATORS[o], i)) { op = OPERATORS[o]; break; }
      }
      if (op) { toks.push({ t: 'op', v: op }); i += op.length; continue; }

      throw new Error('非法字符 "' + c + '" @ ' + i);
    }
    return toks;
  }

  /** 递归下降 parser：or → and → eq → rel → add → mul → unary → primary */
  function parse(toks) {
    var p = 0;
    function peek() { return toks[p]; }
    function eat(v) { if (peek() && peek().v === v) { p++; return true; } return false; }

    function primary() {
      var t = peek();
      if (!t) throw new Error('表达式意外结束');
      if (t.t === 'str' || t.t === 'num' || t.t === 'bool') { p++; return { type: 'Lit', value: t.v }; }
      if (t.t === 'null') { p++; return { type: 'Lit', value: null }; }
      if (t.t === 'path') { p++; return { type: 'Path', raw: t.v }; }
      if (t.t === 'op' && t.v === '(') { p++; var e = orExpr(); if (!eat(')')) throw new Error('缺少 )'); return e; }
      if (t.t === 'ident') {                                   // 白名单函数调用
        p++;
        var args = [];
        if (eat('(')) {
          if (!peek() || peek().v !== ')') { args.push(orExpr()); while (eat(',')) args.push(orExpr()); }
          if (!eat(')')) throw new Error('缺少 )');
        }
        return { type: 'Call', name: t.v, args: args };
      }
      throw new Error('无法解析 token: ' + JSON.stringify(t));
    }

    function unary() {
      if (peek() && peek().t === 'op' && peek().v === '!') { p++; return { type: 'Not', arg: unary() }; }
      return primary();
    }
    function mkBin(name, sub, ops) {
      return function () {
        var left = sub();
        while (peek() && peek().t === 'op' && ops.indexOf(peek().v) >= 0) {
          var op = peek().v; p++;
          left = { type: 'Bin', op: op, left: left, right: sub() };
        }
        return left;
      };
    }
    var mulExpr = mkBin('mul', unary, ['*', '/']);
    var addExpr = mkBin('add', mulExpr, ['+', '-']);
    var relExpr = mkBin('rel', addExpr, ['>', '>=', '<', '<=']);
    var eqExpr  = mkBin('eq',  relExpr, ['===', '!==', '==', '!=']);
    var andExpr = mkBin('and', eqExpr,  ['&&']);
    function orExpr() {
      var left = andExpr();
      while (peek() && peek().t === 'op' && peek().v === '||') { p++; left = { type: 'Bin', op: '||', left: left, right: andExpr() }; }
      return left;
    }
    function ternExpr() {
      var c = orExpr();
      if (peek() && peek().v === '?') {
        p++; var a = ternExpr();
        if (!eat(':')) throw new Error('三元缺少 :');
        return { type: 'Cond', test: c, yes: a, no: ternExpr() };
      }
      return c;
    }

    var ast = ternExpr();
    if (p < toks.length) throw new Error('尾部多余 token: ' + toks[p].v);
    return ast;
  }

  /** 从 AST 精确抽取依赖路径（这是 new Function 做不到的事） */
  function collectDeps(node, out) {
    out = out || [];
    if (!node) return out;
    if (node.type === 'Path') {
      var path = node.raw.replace(/^\$(form|values)\./, '').replace(/^\$self$/, '@self');
      if (path !== '@self' && out.indexOf(path) < 0) out.push(path);
    }
    ['arg', 'test', 'yes', 'no', 'left', 'right'].forEach(function (k) { collectDeps(node[k], out); });
    (node.args || []).forEach(function (a) { collectDeps(a, out); });
    return out;
  }

  var FUNCS = {
    len: function (v) { return (v || '').length; },
    empty: function (v) { return v === '' || v == null || (Array.isArray(v) && !v.length); },
    upper: function (v) { return String(v == null ? '' : v).toUpperCase(); },
    includes: function (arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }
  };

  /** 取值：先按扁平 key 命中（'invoice.type'），再退化到嵌套对象（a.b） */
  function getPath(obj, path) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
    return path.split('.').reduce(function (o, k) { return (o == null ? o : o[k]); }, obj);
  }

  function evalAst(node, scope) {
    switch (node.type) {
      case 'Lit':  return node.value;
      case 'Path':
        if (node.raw === '$self') return scope.self;
        return getPath(scope.form, node.raw.replace(/^\$(form|values)\./, ''));
      case 'Not':  return !evalAst(node.arg, scope);
      case 'Cond': return evalAst(node.test, scope) ? evalAst(node.yes, scope) : evalAst(node.no, scope);
      case 'Call':
        if (!Object.prototype.hasOwnProperty.call(FUNCS, node.name)) throw new Error('未授权函数: ' + node.name);
        return FUNCS[node.name].apply(null, node.args.map(function (a) { return evalAst(a, scope); }));
      case 'Bin': {
        var l = evalAst(node.left, scope), r = evalAst(node.right, scope);
        switch (node.op) {
          case '===': return l === r;   case '!==': return l !== r;
          case '==':  return l == r;    case '!=':  return l != r;
          case '>':   return l > r;     case '>=':  return l >= r;
          case '<':   return l < r;     case '<=':  return l <= r;
          case '+':   return l + r;     case '-':   return l - r;
          case '*':   return l * r;     case '/':   return l / r;
          case '&&':  return l && r;    case '||':  return l || r;
        }
      }
    }
    throw new Error('未知节点 ' + node.type);
  }

  /* ── 依赖图：建图 / Kahn 拓扑 / 环检测 ── */
  function buildGraph(effects) {
    var nodes = Object.keys(effects);
    var adj = {}, rev = {}, indeg = {};
    nodes.forEach(function (n) { adj[n] = []; rev[n] = []; indeg[n] = 0; });
    nodes.forEach(function (target) {
      effects[target].deps.forEach(function (dep) {
        if (!adj[dep]) { adj[dep] = []; rev[dep] = []; indeg[dep] = 0; if (nodes.indexOf(dep) < 0) nodes.push(dep); }
        adj[dep].push(target);
        rev[target].push(dep);
        indeg[target] += 1;
      });
    });
    return { nodes: nodes, adj: adj, rev: rev, indeg: indeg };
  }

  function toposort(g) {
    var indeg = Object.assign({}, g.indeg);
    var q = g.nodes.filter(function (n) { return !indeg[n]; });
    var order = [];
    for (var i = 0; i < q.length; i++) {
      var n = q[i]; order.push(n);
      g.adj[n].forEach(function (t) { if (--indeg[t] === 0) q.push(t); });
    }
    return { order: order, cyclic: g.nodes.filter(function (n) { return order.indexOf(n) < 0; }) };
  }

  /** ★ 脏值传播：沿正向边求下游闭包，再按拓扑序只重算闭包内节点 */
  function propagate(g, order, changed) {
    var down = {}, stack = [changed], touched = [];
    down[changed] = true;
    while (stack.length) {
      var cur = stack.pop();
      (g.adj[cur] || []).forEach(function (t) { if (!down[t]) { down[t] = true; stack.push(t); } });
    }
    order.forEach(function (n) { if (down[n]) touched.push(n); });
    return touched;
  }

  /* ───────────────────────── 4. 运行时效果图接线 ───────────────────────── */
  var logEl = document.getElementById('rt-log');
  var clockEl = document.getElementById('rt-clock');
  var costEl = document.getElementById('rt-cost');
  var barEl = document.getElementById('rt-bar');
  var touchedEl = document.getElementById('rt-touched');

  if (!logEl) return;

  var SCHEMA_EFFECTS = {
    'company.taxNo.visible': { src: "$form.invoice.type === 'COMPANY'" },
    'bank.name.visible':     { src: "$form.invoice.type === 'COMPANY' && $form.amount > 0" }
  };

  var values = {};
  var compiled = {};
  var graph, order, cyclic;

  document.querySelectorAll('[data-bind]').forEach(function (el) {
    if (el.tagName === 'INPUT') values[el.dataset.bind] = el.value;
  });
  var typeSel = document.querySelector('[data-bind="invoice.type"]');
  values['invoice.type'] = typeSel ? typeSel.value : 'PERSONAL';

  function log(html) {
    var li = document.createElement('li');
    li.innerHTML = html;
    logEl.appendChild(li);
    while (logEl.children.length > 40) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function clearLog() { logEl.innerHTML = ''; }

  /** 编译期：只在初始化跑一次 */
  function compile() {
    var t0 = performance.now();
    var total = 0;
    Object.keys(SCHEMA_EFFECTS).forEach(function (k) {
      var ast = parse(lex(SCHEMA_EFFECTS[k].src));
      compiled[k] = { ast: ast, deps: collectDeps(ast) };
      total++;
    });
    graph = buildGraph(compiled);
    var sorted = toposort(graph);
    order = sorted.order;
    cyclic = sorted.cyclic;
    var ms = performance.now() - t0;

    log('<span class="t">compile</span> lex+parse <span class="p">' + total + '</span> exprs · <span class="g">' + ms.toFixed(2) + ' ms</span>');
    Object.keys(compiled).forEach(function (k) {
      log('&nbsp;&nbsp;<span class="t">deps</span> ' + k + ' <span class="p">←</span> {' + compiled[k].deps.join(', ') + '}');
    });
    log('<span class="t">toposort</span> order=<span class="g">[' + order.join(' → ') + ']</span>');
    log('<span class="t">cycle</span> <span class="g">' + cyclic.length + ' cycle</span> · <span class="t">nodes</span> ' + graph.nodes.length);
    applyAll(true);
  }

  function applyAll(silent) {
    Object.keys(compiled).forEach(function (k) {
      var v = evalAst(compiled[k].ast, { form: values, self: values });
      var key = k.replace('.visible', '');
      var wrap = document.querySelector('.rt-f[data-f="' + key + '"]');
      if (!wrap) return;
      var wasHidden = wrap.classList.contains('is-hidden');
      wrap.classList.toggle('is-hidden', !v);
      if (!silent && wasHidden && v) {
        wrap.classList.remove('is-linked');
        void wrap.offsetWidth;
        wrap.classList.add('is-linked');
      }
    });
  }

  /** 运行期：一次 setValue 走完整条链路 */
  function setValue(path, raw) {
    var t0 = performance.now();
    values[path] = raw;

    var touched = propagate(graph, order, path);
    var evaluated = [];
    touched.forEach(function (n) {
      if (!compiled[n]) return;
      var v = evalAst(compiled[n].ast, { form: values, self: values });
      evaluated.push({ n: n, v: v });
      var key = n.replace('.visible', '');
      var wrap = document.querySelector('.rt-f[data-f="' + key + '"]');
      if (!wrap) return;
      var wasHidden = wrap.classList.contains('is-hidden');
      wrap.classList.toggle('is-hidden', !v);
      if (wasHidden && v) {
        wrap.classList.remove('is-linked');
        void wrap.offsetWidth;
        wrap.classList.add('is-linked');
      }
    });

    var ms = performance.now() - t0;
    clockEl.textContent = ms.toFixed(2) + ' ms';
    costEl.textContent = ms.toFixed(2) + ' ms';
    barEl.style.width = Math.max(1.4, (ms / 480) * 100).toFixed(2) + '%';
    touchedEl.textContent = touched.length;

    log('<span class="t">setValue</span> <span class="p">' + path + '</span> = ' + JSON.stringify(raw));
    log(touched.length > 1
      ? '<span class="t">propagate</span> down = <span class="y">' + touched.length + '</span> nodes · <span class="t">order-safe</span>'
      : '<span class="t">propagate</span> <span class="g">无下游依赖</span> · 本次跳过重算');
    evaluated.forEach(function (e) {
      log('&nbsp;&nbsp;<span class="t">eval</span> ' + e.n + ' = <span class="' + (e.v ? 'g' : 'y') + '">' + e.v + '</span>');
    });
    log('<span class="t">cost</span> <span class="g">' + ms.toFixed(2) + ' ms</span> · <span class="t">vs 全量 480 ms</span>');
  }

  document.querySelectorAll('[data-bind]').forEach(function (el) {
    var evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, function () {
      var v = el.value;
      if (el.dataset.bind === 'amount') v = parseFloat(v) || 0;
      setValue(el.dataset.bind, v);
    });
  });

  /* 提交：全量校验 */
  document.getElementById('rt-submit').addEventListener('click', function () {
    var errs = [];
    document.querySelectorAll('.rt-f').forEach(function (w) {
      var key = w.dataset.f, ok = true;
      if (w.classList.contains('is-hidden')) { w.classList.remove('is-err'); return; }
      if (key === 'company.name' && !String(values[key] || '').trim()) ok = false;
      if (key === 'company.taxNo' && !/^[0-9A-Z]{15,20}$/.test(String(values[key] || ''))) ok = false;
      if (key === 'amount' && !(parseFloat(values[key]) > 0)) ok = false;
      w.classList.toggle('is-err', !ok);
      if (!ok) errs.push(key);
    });
    if (errs.length) {
      log('<span class="t">validate</span> <span class="y">FAIL</span> · ' + errs.join(', '));
    } else {
      log('<span class="t">validate</span> <span class="g">PASS</span> · serialize() → POST /api/invoice');
    }
  });

  document.getElementById('rt-reset').addEventListener('click', function () {
    clearLog();
    document.querySelectorAll('.rt-f').forEach(function (w) {
      w.classList.remove('is-err', 'is-linked');
    });
    document.querySelectorAll('[data-bind]').forEach(function (el) {
      if (el.dataset.bind === 'invoice.type') { el.value = 'PERSONAL'; values['invoice.type'] = 'PERSONAL'; }
      if (el.dataset.bind === 'amount') { el.value = '0'; values.amount = 0; }
      if (el.dataset.bind === 'company.name') { el.value = '成都某某科技有限公司'; values['company.name'] = el.value; }
    });
    applyAll(true);
    touchedEl.textContent = '0';
    costEl.textContent = '— ms';
    clockEl.textContent = '0.0 ms';
    barEl.style.width = '2%';
    compile();
  });

  compile();
})();
