// Cloudflare screen: domains, traffic (requests, visitors, bandwidth, cache), errors, threats and bots,
// firewall events and the account's tunnels / Workers / Pages / R2, read from the Cloudflare API with the
// person's own API token (kept with the other settings on this computer). The calls go through the Rust side
// (cloudflare.rs) because the web view can't reach api.cloudflare.com directly.
(function () {
  const CF = (App.cloudflare = { zones: [], info: {}, traffic: {}, trafficErr: null, fw: null, fwErr: null, fwRange: "", account: null, loadedAt: 0, period: "7d", zone: "all", busy: false, err: null });
  const C1 = "#2091f6", C2 = "#e0682e", CR = "#f25e61", CY = "#e8a33d";
  const REFRESH_MS = 5 * 60 * 1000;
  let page = null, content = null;

  const token = () => String(App.data.settings.cloudflareToken || "").trim();
  const demoMode = () => App.screenshotMode && !token();
  const onPage = () => App.current === "vaults" && App.vaultPage === "cloudflare" && !document.hidden;

  // ---------- API ----------
  const errText = (body) => (body && body.errors && body.errors[0] && body.errors[0].message) || "Request failed";
  const api = async (path) => {
    const r = await App.invoke("cf_get", { token: token(), path });
    if (!r.body || r.body.success === false) { const e = new Error(errText(r.body)); e.status = r.status; throw e; }
    return r.body;
  };
  const gql = async (query, variables) => {
    const r = await App.invoke("cf_graphql", { token: token(), query, variables });
    const b = r.body || {};
    if (b.errors && b.errors.length && !(b.data && b.data.viewer)) { const e = new Error(errText(b)); e.status = r.status; throw e; }
    return b.data.viewer;
  };
  const pool = async (items, n, fn) => {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k).catch((e) => ({ error: String(e.message || e) })); } }));
    return out;
  };

  // ---------- period ----------
  const range = () => {
    const now = new Date();
    if (CF.period === "24h") return { hourly: true, from: new Date(now - 24 * 3600e3).toISOString(), to: now.toISOString() };
    const days = CF.period === "30d" ? 30 : 7;
    const day = (d) => d.toISOString().slice(0, 10);
    return { hourly: false, from: day(new Date(now - (days - 1) * 86400e3)), to: day(now), fromT: new Date(now - days * 86400e3).toISOString(), to_t: now.toISOString() };
  };

  const SUM = `requests cachedRequests bytes cachedBytes threats pageViews
    responseStatusMap { edgeResponseStatus requests }
    countryMap { clientCountryName requests threats bytes }
    browserMap { uaBrowserFamily pageViews }
    clientSSLMap { clientSSLProtocol requests }
    contentTypeMap { edgeResponseContentTypeName requests bytes }`;
  const trafficQuery = (hourly) => hourly
    ? `query($z:[String!],$f:Time!,$t:Time!){viewer{zones(filter:{zoneTag_in:$z}){zoneTag d:httpRequests1hGroups(limit:100,filter:{datetime_geq:$f,datetime_leq:$t},orderBy:[datetime_ASC]){dimensions{key:datetime} sum{${SUM}} uniq{uniques}}}}}`
    : `query($z:[String!],$f:Date!,$t:Date!){viewer{zones(filter:{zoneTag_in:$z}){zoneTag d:httpRequests1dGroups(limit:100,filter:{date_geq:$f,date_leq:$t},orderBy:[date_ASC]){dimensions{key:date} sum{${SUM}} uniq{uniques}}}}}`;
  const fwQuery = `query($z:[String!],$f:Time!,$t:Time!){viewer{zones(filter:{zoneTag_in:$z}){zoneTag
    a:firewallEventsAdaptiveGroups(limit:30,filter:{datetime_geq:$f,datetime_leq:$t},orderBy:[count_DESC]){count dimensions{action source}}
    p:firewallEventsAdaptiveGroups(limit:10,filter:{datetime_geq:$f,datetime_leq:$t},orderBy:[count_DESC]){count dimensions{clientRequestPath}}
    i:firewallEventsAdaptiveGroups(limit:10,filter:{datetime_geq:$f,datetime_leq:$t},orderBy:[count_DESC]){count dimensions{clientIP clientCountryName}}}}}`;

  // ---------- loading ----------
  CF.load = async (force) => {
    if (demoMode()) { if (!CF.zones.length) CF.demo(); paint(); return; }
    if (!token() || CF.busy) return;
    if (!force && CF.loadedAt && Date.now() - CF.loadedAt < REFRESH_MS) return;
    CF.busy = true; CF.err = null; paint();
    try {
      const zones = [];
      for (let pg = 1; pg <= 10; pg++) {
        const r = await api(`/zones?per_page=50&page=${pg}`);
        zones.push(...r.result);
        if (!r.result_info || pg >= r.result_info.total_pages) break;
      }
      CF.zones = zones.sort((a, b) => a.name.localeCompare(b.name));
      if (CF.zone !== "all" && !zones.some((z) => z.id === CF.zone)) CF.zone = "all";
      CF.loadedAt = Date.now();
      CF.busy = false; paint();
      CF.busy = true;
      await Promise.all([loadTraffic(), loadFirewall(), loadInfo(), loadAccount()]);
    } catch (e) {
      CF.err = e;
      CF.zones = [];
    } finally { CF.busy = false; paint(); }
  };

  const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  const loadTraffic = async () => {
    const r = range(); CF.trafficErr = null;
    try {
      const out = {};
      const parts = await pool(chunks(CF.zones.map((z) => z.id), 10), 3, (ids) => gql(trafficQuery(r.hourly), { z: ids, f: r.hourly ? r.from : r.from, t: r.hourly ? r.to : r.to }));
      for (const p of parts) { if (p.error) throw new Error(p.error); for (const z of p.zones) out[z.zoneTag] = z.d; }
      CF.traffic = out;
    } catch (e) { CF.traffic = {}; CF.trafficErr = String(e.message || e); }
    paint();
  };
  const loadFirewall = async () => {
    CF.fwErr = null; CF.fw = null;
    const r = range();
    const tryRange = async (from, to, label) => {
      const out = {};
      const parts = await pool(chunks(CF.zones.map((z) => z.id), 10), 3, (ids) => gql(fwQuery, { z: ids, f: from, t: to }));
      for (const p of parts) { if (p.error) throw new Error(p.error); for (const z of p.zones) out[z.zoneTag] = z; }
      CF.fw = out; CF.fwRange = label;
    };
    try { await tryRange(r.hourly ? r.from : r.fromT, r.hourly ? r.to : r.to_t, CF.period); }
    catch (e) {
      try { await tryRange(new Date(Date.now() - 24 * 3600e3).toISOString(), new Date().toISOString(), "24h"); }
      catch (e2) { CF.fwErr = String(e2.message || e2); }
    }
    paint();
  };
  const loadInfo = async () => {
    const res = await pool(CF.zones, 6, async (z) => {
      const [s, d] = await Promise.all([
        api(`/zones/${z.id}/settings`).catch(() => null),
        api(`/zones/${z.id}/dns_records?per_page=1`).catch(() => null),
      ]);
      const set = {};
      if (s) for (const x of s.result) set[x.id] = x.value;
      return { dns: d && d.result_info ? d.result_info.total_count : null, ssl: set.ssl, sec: set.security_level, dev: set.development_mode === "on", https: set.always_use_https === "on", tls: set.min_tls_version, ok: !!s };
    });
    CF.zones.forEach((z, i) => { CF.info[z.id] = res[i]; });
    paint();
  };
  const loadAccount = async () => {
    const accs = [];
    try { accs.push(...(await api("/accounts?per_page=50")).result); } catch (e) { CF.account = { error: String(e.message || e), list: [] }; paint(); return; }
    const list = await pool(accs, 2, async (a) => {
      const get = async (path, pick) => { try { const r = await api(path); return pick(r); } catch (e) { return null; } };
      const [tunnels, workers, pages, r2] = await Promise.all([
        get(`/accounts/${a.id}/cfd_tunnel?is_deleted=false&per_page=100`, (r) => r.result),
        get(`/accounts/${a.id}/workers/scripts`, (r) => r.result),
        get(`/accounts/${a.id}/pages/projects`, (r) => r.result),
        get(`/accounts/${a.id}/r2/buckets`, (r) => (r.result && r.result.buckets) || []),
      ]);
      return { name: a.name, tunnels, workers, pages, r2 };
    });
    CF.account = { list };
    paint();
  };

  // ---------- numbers ----------
  const selected = () => (CF.zone === "all" ? CF.zones.map((z) => z.id) : [CF.zone]);
  const addMap = (into, arr, key, fields) => {
    for (const x of arr || []) { const k = x[key] || "?"; const o = (into[k] = into[k] || {}); for (const f of fields) o[f] = (o[f] || 0) + (x[f] || 0); }
  };
  const aggregate = (ids) => {
    const series = new Map();
    const T = { requests: 0, cached: 0, bytes: 0, cachedBytes: 0, threats: 0, pageViews: 0, uniques: 0, e4: 0, e5: 0 };
    const maps = { status: {}, country: {}, browser: {}, content: {}, ssl: {} };
    for (const id of ids) {
      for (const g of CF.traffic[id] || []) {
        const s = g.sum, key = g.dimensions.key;
        const b = series.get(key) || { key, requests: 0, cached: 0, e4: 0, e5: 0, uniques: 0, threats: 0 };
        b.requests += s.requests; b.cached += s.cachedRequests; b.threats += s.threats; b.uniques += g.uniq.uniques;
        for (const x of s.responseStatusMap) { if (x.edgeResponseStatus >= 500) { b.e5 += x.requests; T.e5 += x.requests; } else if (x.edgeResponseStatus >= 400) { b.e4 += x.requests; T.e4 += x.requests; } }
        series.set(key, b);
        T.requests += s.requests; T.cached += s.cachedRequests; T.bytes += s.bytes; T.cachedBytes += s.cachedBytes; T.threats += s.threats; T.pageViews += s.pageViews; T.uniques += g.uniq.uniques;
        addMap(maps.status, s.responseStatusMap, "edgeResponseStatus", ["requests"]);
        addMap(maps.country, s.countryMap, "clientCountryName", ["requests", "threats", "bytes"]);
        addMap(maps.browser, s.browserMap, "uaBrowserFamily", ["pageViews"]);
        addMap(maps.content, s.contentTypeMap, "edgeResponseContentTypeName", ["requests", "bytes"]);
        addMap(maps.ssl, s.clientSSLMap, "clientSSLProtocol", ["requests"]);
      }
    }
    return { series: [...series.values()].sort((a, b) => (a.key < b.key ? -1 : 1)), T, maps };
  };
  const perZone = (id) => aggregate([id]).T;

  const SOURCES = {
    botFight: "Bot Fight Mode", bm: "Bot Management", botManagement: "Bot Management", uablock: "User-agent rules", bic: "Browser integrity check",
    hot: "Hotlink protection", l7ddos: "HTTP DDoS protection", ratelimit: "Rate limiting", securitylevel: "Security level", waf: "WAF managed rules",
    firewallrules: "Firewall rules", firewallManaged: "Managed rules", firewallCustom: "Custom rules", firewallRateLimit: "Rate limit rules", zonelockdown: "Zone lockdown",
    apiShield: "API Shield", sslfixup: "SSL fix-up", validation: "Validation", redirect: "Redirect rules", dlp: "Data loss prevention",
  };
  const BOT_SOURCES = ["botFight", "bm", "botManagement", "uablock", "bic"];
  const ACTIONS = { block: "Block", challenge: "Challenge", jschallenge: "JS challenge", managed_challenge: "Managed challenge", allow: "Allow", log: "Log", skip: "Skip", bypass: "Bypass", rewrite: "Rewrite", connection_close: "Connection close", challenge_solved: "Challenge solved", challenge_failed: "Challenge failed", challenge_bypassed: "Challenge bypassed", jschallenge_solved: "JS challenge solved", managed_challenge_non_interactive_solved: "Managed challenge solved" };
  const fwAgg = (ids) => {
    if (!CF.fw) return null;
    const src = {}, act = {}, paths = {}, ips = {};
    for (const id of ids) {
      const z = CF.fw[id]; if (!z) continue;
      for (const g of z.a || []) { src[g.dimensions.source] = (src[g.dimensions.source] || 0) + g.count; act[g.dimensions.action] = (act[g.dimensions.action] || 0) + g.count; }
      for (const g of z.p || []) paths[g.dimensions.clientRequestPath] = (paths[g.dimensions.clientRequestPath] || 0) + g.count;
      for (const g of z.i || []) { const k = g.dimensions.clientIP; ips[k] = ips[k] || { n: 0, c: g.dimensions.clientCountryName }; ips[k].n += g.count; }
    }
    const total = Object.values(src).reduce((a, b) => a + b, 0);
    const bots = BOT_SOURCES.reduce((a, k) => a + (src[k] || 0), 0);
    return { src, act, paths, ips, total, bots };
  };

  // ---------- formatting ----------
  const num = (v) => (v == null ? "—" : v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M" : v >= 1e4 ? Math.round(v / 1e3) + "K" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(Math.round(v)));
  const bytes = (b) => (b >= 1e12 ? (b / 1e12).toFixed(2) + " TB" : b >= 1e9 ? (b / 1e9).toFixed(b >= 1e10 ? 0 : 1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(b >= 1e8 ? 0 : 1) + " MB" : b >= 1e3 ? Math.round(b / 1e3) + " KB" : Math.round(b) + " B");
  const pct = (a, b) => (b ? (a / b * 100 < 10 ? (a / b * 100).toFixed(1) : Math.round(a / b * 100)) + "%" : "—");
  const full = (v) => Number(v).toLocaleString();
  const label = (k) => (CF.period === "24h" ? new Date(k).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : new Date(k + "T12:00:00").toLocaleDateString([], { day: "2-digit", month: "short" }));
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m + " min ago"; };

  // ---------- pieces ----------
  const tile = (name, value, sub, cls = "") => h("div", { class: "s-stat" }, h("div", { class: "s-stat-label" }, name), h("div", { class: "s-stat-value" + (cls ? " " + cls : "") }, value), h("div", { class: "s-stat-sub" }, sub || " "));

  // Stacked bars with a hover tooltip. layers: [{ name, color, key }]; rows have label + the keys.
  const bars = (title, rows, layers) => {
    const W = 600, H = 110, ns = "http://www.w3.org/2000/svg";
    const max = Math.max(1, ...rows.map((r) => layers.reduce((a, l) => a + (r[l.key] || 0), 0)));
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("class", "s-svg");
    const bw = W / Math.max(1, rows.length);
    rows.forEach((r, i) => {
      let y = H;
      for (const l of layers) {
        const hh = (r[l.key] || 0) / max * (H - 4);
        if (hh <= 0) continue;
        y -= hh;
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", i * bw + bw * 0.12); rect.setAttribute("width", bw * 0.76); rect.setAttribute("y", y); rect.setAttribute("height", hh); rect.setAttribute("fill", l.color);
        svg.append(rect);
      }
    });
    const yl = h("div", { class: "s-ylabels" }, h("span", { style: "top:6px" }, num(max)), h("span", { style: "top:50%" }, num(max / 2)), h("span", { style: "top:calc(100% - 6px)" }, "0"));
    const hair = h("div", { class: "s-hair" }), tip = h("div", { class: "s-tip" });
    const plot = h("div", { class: "s-plot" }, svg, hair, tip);
    plot.onmousemove = (e) => {
      const box = plot.getBoundingClientRect();
      const i = Math.min(rows.length - 1, Math.max(0, Math.floor((e.clientX - box.left) / box.width * rows.length)));
      const r = rows[i]; if (!r) return;
      const x = (i + 0.5) / rows.length * box.width;
      hair.style.display = "block"; hair.style.left = x + "px";
      tip.replaceChildren(h("div", { class: "s-tip-time" }, r.label), ...layers.map((l) => h("div", { class: "s-tip-row" }, h("i", { style: `background:${l.color}` }), h("span", {}, l.name), h("b", {}, full(r[l.key] || 0)))));
      tip.style.display = "block"; tip.style.left = Math.min(x + 10, box.width - 150) + "px";
    };
    plot.onmouseleave = () => { hair.style.display = "none"; tip.style.display = "none"; };
    const tot = layers.map((l) => rows.reduce((a, r) => a + (r[l.key] || 0), 0));
    const legend = h("div", { class: "s-legend" }, ...layers.map((l, i) => h("span", {}, h("i", { style: `background:${l.color};height:8px;width:8px;border-radius:2px` }), h("span", {}, l.name), h("b", {}, num(tot[i])))));
    return h("div", { class: "s-chart" }, h("div", { class: "s-chart-head" }, h("div", { class: "s-chart-title" }, title), legend), h("div", { class: "s-chart-body" }, yl, plot),
      h("div", { class: "s-xlabels" }, h("span", {}, rows.length ? rows[0].label : ""), h("span", {}, rows.length ? rows[rows.length - 1].label : "")));
  };

  const list = (title, rows, opts = {}) => {
    const top = rows.slice(0, opts.n || 8), max = Math.max(1, ...top.map((r) => r.v));
    const body = top.length ? top.map((r) => h("div", { class: "s-line" }, h("span", { class: "s-line-name", title: r.name, style: r.color ? `color:${r.color}` : "" }, r.name),
      h("span", { class: "bar" }, h("i", { style: `width:${Math.max(2, r.v / max * 100)}%;${r.color ? "background:" + r.color : ""}` })), h("span", { class: "s-line-val" }, r.text != null ? r.text : num(r.v))))
      : [h("div", { class: "s-hint" }, opts.empty || "Nothing in this period")];
    return h("div", { class: "s-card cf-card" }, h("div", { class: "s-sec-title" }, title, opts.count ? h("span", { class: "count" }, opts.count) : null), ...body);
  };

  const statusColor = (c) => (c >= 500 ? CR : c >= 400 ? CY : c >= 300 ? "#8a98a3" : "#26b36b");

  // ---------- paint ----------
  const setup = () => {
    const inp = h("input", { class: "input", type: "password", placeholder: "Cloudflare API token", style: "flex:1" });
    const go = h("button", { class: "btn primary" }, "Connect");
    const save = () => { const v = inp.value.trim(); if (!v) return; App.data.settings.cloudflareToken = v; App.save(); CF.loadedAt = 0; CF.load(true); };
    go.onclick = save; inp.onkeydown = (e) => { if (e.key === "Enter") save(); };
    const need = ["Zone → Zone: Read", "Zone → Analytics: Read", "Zone → DNS: Read", "Zone → Zone Settings: Read", "Account → Cloudflare Tunnel: Read, Workers Scripts: Read, Cloudflare Pages: Read, Workers R2 Storage: Read (optional)"];
    return h("div", { class: "empty cf-setup" }, h("div", { class: "empty-art", html: Icon("cloud", 48) }), h("h2", {}, "Connect your Cloudflare"),
      h("p", {}, "Create an API token in the Cloudflare dashboard (My Profile → API Tokens → Create Token → Custom token) with read-only permissions, then paste it here. It stays on this computer."),
      h("div", { class: "cf-need" }, h("b", {}, "Permissions (read only)"), ...need.map((t) => h("div", {}, "• " + t))),
      h("div", { class: "cf-token" }, inp, go));
  };

  const paint = () => {
    if (!page || !content) return;
    const keep = content.scrollTop;
    content.replaceChildren();
    if (!token() && !demoMode()) { content.append(setup()); return; }
    if (CF.err) {
      const e = CF.err;
      content.append(h("div", { class: "empty" }, h("div", { class: "empty-art", html: Icon("cloud", 48) }), h("h2", {}, "Couldn't read Cloudflare"),
        h("p", {}, String(e.message || e)), h("p", { class: "s-hint" }, e.status === 401 || e.status === 403 ? "Check that the token is active and has the read permissions listed when connecting." : "Check your internet connection and try again.")));
      return;
    }
    if (!CF.zones.length) {
      content.append(h("div", { class: "empty" }, h("div", { class: "empty-art", html: Icon("cloud", 48) }), h("h2", {}, CF.busy ? "Reading Cloudflare..." : "No domains found"),
        CF.busy ? null : h("p", {}, "This token can't see any domain. Give it Zone → Zone: Read for the domains you want here.")));
      return;
    }
    const ids = selected(), A = aggregate(ids), T = A.T, F = fwAgg(ids);
    const rows = A.series.map((s) => Object.assign({ label: label(s.key) }, s, { uncached: s.requests - s.cached }));
    const hasData = rows.length > 0;
    if (CF.trafficErr) content.append(h("div", { class: "s-card cf-warn" }, h("b", {}, "Traffic numbers unavailable: "), CF.trafficErr, h("div", { class: "s-hint" }, "The token needs Zone → Analytics: Read.")));

    content.append(h("div", { class: "s-stats cf-stats" },
      tile("Requests", hasData ? num(T.requests) : "—", hasData ? full(T.requests) : ""),
      tile("Visitors", hasData ? num(T.uniques) : "—", "sum of " + (CF.period === "24h" ? "hourly" : "daily") + " unique visitors"),
      tile("Page views", hasData ? num(T.pageViews) : "—", ""),
      tile("Bandwidth", hasData ? bytes(T.bytes) : "—", hasData ? bytes(T.cachedBytes) + " cached" : ""),
      tile("Cache hit rate", hasData ? pct(T.cached, T.requests) : "—", hasData ? num(T.cached) + " of " + num(T.requests) + " requests" : ""),
      tile("Errors 5xx", hasData ? num(T.e5) : "—", hasData ? pct(T.e5, T.requests) + " of requests" : "", T.e5 ? "s-red" : ""),
      tile("Errors 4xx", hasData ? num(T.e4) : "—", hasData ? pct(T.e4, T.requests) + " of requests" : ""),
      tile("Threats", hasData ? num(T.threats) : "—", F ? `${num(F.bots)} bot events · ${num(F.total)} firewall events` : "")));

    if (hasData) {
      content.append(h("div", { class: "s-card" }, h("div", { class: "s-charts" },
        bars("Requests", rows, [{ name: "Cached", color: C1, key: "cached" }, { name: "Not cached", color: C2, key: "uncached" }]),
        bars("Errors and threats", rows, [{ name: "5xx", color: CR, key: "e5" }, { name: "4xx", color: CY, key: "e4" }, { name: "Threats", color: "#8a5cf6", key: "threats" }]))));
    }

    // domains
    const cols = "minmax(170px,2fr) 70px repeat(5,minmax(60px,1fr)) 54px 84px 84px";
    const head = h("div", { class: "d-row d-head", style: `--cols:${cols}` }, ...["Domain", "Plan", "Requests", "Visitors", "Errors 5xx", "Threats", "Bandwidth", "DNS", "SSL", "Security"].map((t, i) => h("div", { class: i > 1 && i < 8 ? "num" : "" }, t)));
    const zrows = CF.zones.map((z) => {
      const t = perZone(z.id), inf = CF.info[z.id] || {};
      const dot = h("i", { class: "cf-dot " + (z.status === "active" && !z.paused ? "ok" : "wait"), title: z.paused ? "Paused" : z.status });
      const r = h("div", { class: "d-row click" + (CF.zone === z.id ? " cf-sel" : ""), style: `--cols:${cols}`, title: (z.name_servers || []).join(", ") },
        h("div", { class: "d-main" }, dot, z.name, inf.dev ? h("span", { class: "c-kind", style: "margin-left:6px" }, "Dev mode") : null),
        h("div", { class: "d-main" }, (z.plan && z.plan.name || "").replace(" Website", "")),
        h("div", { class: "num" }, num(t.requests)), h("div", { class: "num" }, num(t.uniques)), h("div", { class: "num" + (t.e5 ? " s-red" : "") }, num(t.e5)), h("div", { class: "num" }, num(t.threats)), h("div", { class: "num" }, bytes(t.bytes)),
        h("div", {}, inf.dns == null ? "—" : String(inf.dns)), h("div", { class: "d-main" }, inf.ssl || "—"), h("div", { class: "d-main" }, inf.sec || "—"));
      r.onclick = () => { CF.zone = CF.zone === z.id ? "all" : z.id; if (App.current === "vaults") toolbar(); paint(); };
      return r;
    });
    content.append(h("div", { class: "s-card" }, h("div", { class: "s-sec-title" }, "Domains", h("span", { class: "count" }, `${CF.zones.length} · click one to filter`)), h("div", { class: "d-table" }, head, ...zrows)));

    // breakdowns
    const grid = h("div", { class: "cf-grid" });
    const sc = Object.entries(A.maps.status).map(([k, v]) => ({ name: k, v: v.requests, color: statusColor(Number(k)), text: `${num(v.requests)} · ${pct(v.requests, T.requests)}` })).sort((a, b) => b.v - a.v);
    grid.append(list("Status codes", sc, { n: 10 }));
    grid.append(list("Countries", Object.entries(A.maps.country).map(([k, v]) => ({ name: k, v: v.requests, text: `${num(v.requests)}${v.threats ? " · " + num(v.threats) + " threats" : ""}` })).sort((a, b) => b.v - a.v), { n: 10 }));
    grid.append(list("Browsers", Object.entries(A.maps.browser).map(([k, v]) => ({ name: k, v: v.pageViews })).sort((a, b) => b.v - a.v), { count: "page views" }));
    grid.append(list("Content types", Object.entries(A.maps.content).map(([k, v]) => ({ name: k, v: v.requests, text: `${num(v.requests)} · ${bytes(v.bytes)}` })).sort((a, b) => b.v - a.v)));
    grid.append(list("TLS versions", Object.entries(A.maps.ssl).map(([k, v]) => ({ name: k === "none" ? "Not encrypted" : k, v: v.requests })).sort((a, b) => b.v - a.v)));
    content.append(grid);

    // security: firewall and bots
    const fwHead = h("div", { class: "s-sec-title", style: "margin:4px 0 -2px" }, "Security: firewall and bots", F ? h("span", { class: "count" }, "last " + (CF.fwRange === "24h" ? "24 hours" : CF.period === "30d" ? "30 days" : "7 days")) : null);
    content.append(fwHead);
    if (CF.fwErr) content.append(h("div", { class: "s-card cf-warn" }, h("b", {}, "Firewall events unavailable: "), CF.fwErr, h("div", { class: "s-hint" }, "The token needs Zone → Analytics: Read, and some plans keep only a short history.")));
    else if (!F) content.append(h("div", { class: "s-hint" }, "Reading..."));
    else {
      const g2 = h("div", { class: "cf-grid" });
      g2.append(list("Stopped by", Object.entries(F.src).map(([k, v]) => ({ name: SOURCES[k] || k, v, color: BOT_SOURCES.includes(k) ? "#8a5cf6" : null })).sort((a, b) => b.v - a.v), { n: 10, count: `${num(F.bots)} from bots`, empty: "No firewall events" }));
      g2.append(list("Action taken", Object.entries(F.act).map(([k, v]) => ({ name: ACTIONS[k] || k, v })).sort((a, b) => b.v - a.v), { empty: "No firewall events" }));
      g2.append(list("Top paths hit", Object.entries(F.paths).map(([k, v]) => ({ name: k, v })).sort((a, b) => b.v - a.v), { empty: "No firewall events" }));
      g2.append(list("Top IP addresses", Object.entries(F.ips).map(([k, v]) => ({ name: k, v: v.n, text: `${num(v.n)}${v.c ? " · " + v.c : ""}` })).sort((a, b) => b.v - a.v), { empty: "No firewall events" }));
      content.append(g2);
    }

    // account
    if (CF.account && !CF.account.error && CF.account.list.length) {
      const g3 = h("div", { class: "cf-grid" });
      for (const a of CF.account.list) {
        const tun = a.tunnels, lines = [];
        const none = (v) => v == null;
        const bad = tun ? tun.filter((t) => t.status === "down" || t.status === "degraded").length : 0;
        if (tun) for (const t of tun.slice(0, 8)) lines.push(h("div", { class: "s-line cf-line" }, h("span", { class: "s-line-name" }, h("i", { class: "cf-dot " + (t.status === "healthy" ? "ok" : t.status === "inactive" ? "off" : "bad") }), t.name), h("span", {}), h("span", { class: "s-line-val" }, t.status)));
        const stat = (name, v) => h("div", { class: "s-line cf-line" }, h("span", { class: "s-line-name" }, name), h("span", {}), h("span", { class: "s-line-val" }, none(v) ? "no access" : String(v.length)));
        g3.append(h("div", { class: "s-card cf-card" }, h("div", { class: "s-sec-title" }, "Account: " + a.name, bad ? h("span", { class: "s-tr-alert" }, bad + " tunnel down") : null),
          stat("Tunnels", tun), ...lines, stat("Workers", a.workers), stat("Pages projects", a.pages), stat("R2 buckets", a.r2)));
      }
      content.append(g3);
    }
    content.scrollTop = keep;
  };

  // ---------- toolbar and render ----------
  let toolbarEl = null;
  const toolbar = () => {
    if (!page) return;
    const bar = h("div", { class: "toolbar" }, h("div", { class: "section-title", style: "margin:0" }, "Cloudflare"));
    if (token() || demoMode()) {
      const per = h("select", { class: "select", style: "width:150px" }, ...[["24h", "Last 24 hours"], ["7d", "Last 7 days"], ["30d", "Last 30 days"]].map(([v, l]) => { const o = h("option", { value: v }, l); if (v === CF.period) o.selected = true; return o; }));
      per.onchange = () => { CF.period = per.value; if (demoMode()) { CF.demo(); paint(); return; } CF.busy = true; paint(); Promise.all([loadTraffic(), loadFirewall()]).finally(() => { CF.busy = false; CF.loadedAt = Date.now(); paint(); toolbar(); }); };
      const zs = h("select", { class: "select", style: "width:190px" }, h("option", { value: "all" }, "All domains"), ...CF.zones.map((z) => { const o = h("option", { value: z.id }, z.name); if (z.id === CF.zone) o.selected = true; return o; }));
      zs.onchange = () => { CF.zone = zs.value; paint(); };
      const rf = h("button", { class: "icon-btn", title: "Refresh now", html: Icon("refresh", 16) });
      rf.onclick = () => { if (demoMode()) return; CF.loadedAt = 0; CF.load(true).then(toolbar); };
      const more = h("button", { class: "icon-btn", title: "More", html: Icon("dots", 16) });
      more.onclick = (e) => App.menu(e, [
        { name: "Change API token", icon: "edit", handler: async () => { const v = await App.prompt("Cloudflare API token", "Token", ""); if (v && v.trim()) { App.data.settings.cloudflareToken = v.trim(); App.save(); CF.zones = []; CF.loadedAt = 0; CF.load(true).then(toolbar); } } },
        { name: "Disconnect Cloudflare", icon: "trash", danger: true, handler: () => { App.data.settings.cloudflareToken = ""; App.save(); CF.zones = []; CF.traffic = {}; CF.fw = null; CF.account = null; CF.loadedAt = 0; CF.err = null; toolbar(); paint(); } },
      ]);
      bar.append(h("div", { class: "s-hint", id: "cf-updated" }, CF.loadedAt ? "Updated " + ago(CF.loadedAt) : ""), h("div", { class: "grow" }), zs, per, rf, more);
    }
    if (toolbarEl && toolbarEl.parentNode === page) page.replaceChild(bar, toolbarEl); else page.prepend(bar);
    toolbarEl = bar;
  };

  CF.render = (p) => {
    page = p; p.innerHTML = ""; toolbarEl = null;
    toolbar();
    content = h("div", { class: "content" });
    p.append(content);
    paint();
    CF.load(false).then(toolbar);
  };

  CF.start = () => setInterval(() => { if (onPage() && token() && !CF.busy) CF.load(true).then(toolbar); }, REFRESH_MS);

  // Made-up numbers for the check pictures only (no token).
  CF.demo = () => {
    const names = ["goopedir.com.br", "pedidos.example.com", "loja.example.net"];
    CF.zones = names.map((n, i) => ({ id: "z" + i, name: n, status: i === 2 ? "pending" : "active", paused: false, plan: { name: i === 0 ? "Pro Website" : "Free Website" }, name_servers: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"] }));
    CF.info = { z0: { dns: 24, ssl: "full", sec: "medium" }, z1: { dns: 9, ssl: "flexible", sec: "high", dev: true }, z2: { dns: 3, ssl: "full", sec: "medium" } };
    const n = CF.period === "24h" ? 24 : CF.period === "30d" ? 30 : 7;
    CF.traffic = {};
    CF.zones.forEach((z, zi) => {
      CF.traffic[z.id] = Array.from({ length: n }, (_, i) => {
        const d = new Date(Date.now() - (n - 1 - i) * (CF.period === "24h" ? 3600e3 : 86400e3));
        const base = (12000 / (zi + 1)) * (1 + Math.sin(i / 2) * 0.3), r = Math.round(base);
        return { dimensions: { key: CF.period === "24h" ? d.toISOString() : d.toISOString().slice(0, 10) }, uniq: { uniques: Math.round(r / 9) },
          sum: { requests: r, cachedRequests: Math.round(r * 0.7), bytes: r * 52000, cachedBytes: r * 36000, threats: Math.round(r * 0.01), pageViews: Math.round(r / 3),
            responseStatusMap: [{ edgeResponseStatus: 200, requests: Math.round(r * 0.88) }, { edgeResponseStatus: 304, requests: Math.round(r * 0.06) }, { edgeResponseStatus: 404, requests: Math.round(r * 0.04) }, { edgeResponseStatus: 502, requests: i % 4 === 0 ? Math.round(r * 0.015) : 3 }],
            countryMap: [{ clientCountryName: "BR", requests: Math.round(r * 0.8), threats: 4, bytes: 1 }, { clientCountryName: "US", requests: Math.round(r * 0.12), threats: 20, bytes: 1 }, { clientCountryName: "PT", requests: Math.round(r * 0.05), threats: 0, bytes: 1 }],
            browserMap: [{ uaBrowserFamily: "Chrome", pageViews: Math.round(r * 0.2) }, { uaBrowserFamily: "Safari", pageViews: Math.round(r * 0.1) }, { uaBrowserFamily: "Firefox", pageViews: Math.round(r * 0.02) }],
            clientSSLMap: [{ clientSSLProtocol: "TLSv1.3", requests: Math.round(r * 0.9) }, { clientSSLProtocol: "TLSv1.2", requests: Math.round(r * 0.1) }],
            contentTypeMap: [{ edgeResponseContentTypeName: "html", requests: Math.round(r * 0.3), bytes: r * 9000 }, { edgeResponseContentTypeName: "json", requests: Math.round(r * 0.4), bytes: r * 4000 }, { edgeResponseContentTypeName: "js", requests: Math.round(r * 0.2), bytes: r * 30000 }] } };
      });
    });
    CF.fw = { z0: { a: [{ count: 420, dimensions: { action: "managed_challenge", source: "botFight" } }, { count: 190, dimensions: { action: "block", source: "firewallCustom" } }, { count: 80, dimensions: { action: "block", source: "l7ddos" } }],
      p: [{ count: 300, dimensions: { clientRequestPath: "/wp-login.php" } }, { count: 140, dimensions: { clientRequestPath: "/.env" } }], i: [{ count: 210, dimensions: { clientIP: "203.0.113.50", clientCountryName: "US" } }] } };
    CF.fwRange = CF.period;
    CF.account = { list: [{ name: "Goopedir", tunnels: [{ name: "easypanel", status: "healthy" }, { name: "backup", status: "down" }], workers: [1, 2], pages: [1], r2: [1, 2, 3] }] };
    CF.loadedAt = Date.now();
  };
})();
