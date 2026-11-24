// SFTP tab: two file panes (this computer or a host on each side), drag files across to copy them.
(function () {
  const S = (App.sftp = { panes: [], transfers: [], el: null });

  const newPane = (side) => ({ side, kind: side === 0 ? "local" : "none", hostId: null, sessionId: null, path: "", entries: [], selected: new Set(), status: "", sortBy: "name", asc: true, history: [] });
  S.panes = [newPane(0), newPane(1)];

  const isWin = () => navigator.userAgent.includes("Windows");
  const joinPath = (p, kind, name) => {
    if (kind === "remote") return p.endsWith("/") ? p + name : p + "/" + name;
    const sep = p.includes("\\") || (isWin() && /^[a-zA-Z]:/.test(p)) ? "\\" : "/";
    return p.endsWith(sep) ? p + name : p + sep + name;
  };
  const parentPath = (p, kind) => {
    if (kind === "remote") { if (p === "/" || !p) return "/"; const q = p.replace(/\/+$/, ""); const i = q.lastIndexOf("/"); return i <= 0 ? "/" : q.slice(0, i); }
    const q = p.replace(/[\\/]+$/, "");
    const i = Math.max(q.lastIndexOf("\\"), q.lastIndexOf("/"));
    if (i < 0) return p;
    const up = q.slice(0, i);
    return /^[a-zA-Z]:$/.test(up) ? up + "\\" : up || "/";
  };

  S.render = (page) => {
    S.el = page;
    page.innerHTML = "";
    page.classList.add("sftp");
    for (const p of S.panes) page.append(paneView(p));
    if (S.panes[0].kind === "local" && !S.panes[0].path) S.goLocalHome(S.panes[0]);
  };
  const redraw = () => { if (S.el) S.render(S.el); };

  S.goLocalHome = async (p) => { p.path = await App.invoke("local_home").catch(() => "C:\\"); S.load(p); };

  S.load = async (p) => {
    p.status = "loading";
    try {
      p.entries = p.kind === "local" ? await App.invoke("local_list", { path: p.path }) : await App.invoke("sftp_list", { id: p.sessionId, path: p.path });
      p.status = "";
    } catch (e) { p.entries = []; p.status = "error: " + e; }
    p.selected.clear();
    redraw();
  };

  S.openHost = (host) => {
    App.openTab("sftp");
    const p = S.panes[1].kind === "none" || S.panes[1].kind === "remote" ? S.panes[1] : S.panes[0];
    S.connect(p, host);
  };

  S.connect = async (p, host, target) => {
    if (p.sessionId) App.invoke("sftp_close", { id: p.sessionId }).catch(() => {});
    p.kind = "remote"; p.hostId = host.id; p.sessionId = "s" + App.uid(); p.status = "connecting"; p.entries = [];
    redraw();
    target = target || App.targetFor(host);
    try {
      const home = await App.invoke("sftp_connect", { id: p.sessionId, target });
      p.path = home || "/";
      App.logs.add({ hostId: host.id, label: App.hostLabel(host), address: host.address, user: target.username, kind: "SFTP", status: "Connected" });
      S.load(p);
    } catch (e) {
      const r = await App.terminal.handleConnectError(String(e), host, target, (t2) => S.connect(p, host, t2));
      if (r === "cancelled") { p.kind = "none"; p.status = ""; redraw(); return; }
      if (r) return;
      p.status = "error: " + App.errText(e);
      redraw();
    }
  };

  const chooseSide = (p, e) => {
    const items = [{ name: "Local", icon: "hosts", handler: () => { if (p.sessionId) App.invoke("sftp_close", { id: p.sessionId }); p.kind = "local"; p.sessionId = null; p.hostId = null; S.goLocalHome(p); } }, "-"];
    for (const x of App.sortItems(App.data.hosts, App.hostLabel)) items.push({ name: App.hostLabel(x), icon: "hosts", handler: () => S.connect(p, x) });
    if (!App.data.hosts.length) items.push({ name: "No saved hosts yet", disabled: true });
    App.menu(e, items);
  };

  const paneView = (p) => {
    const other = S.panes[1 - p.side];
    const el = h("div", { class: "pane" });
    const host = p.hostId && App.byId("hosts", p.hostId);
    const title = p.kind === "local" ? "Local" : p.kind === "remote" ? (host ? App.hostLabel(host) : "Host") : "Select host";
    const pickBtn = h("div", { class: "host-pick" }, p.kind === "local" ? App.avatar("local", "L", "small-av") : host ? App.avatar(host.os, title, "small-av") : App.icon("hosts", 16), title, App.icon("chevron", 12));
    pickBtn.querySelectorAll(".small-av").forEach((a) => (a.style.cssText += ";width:22px;height:22px;border-radius:5px;display:grid;place-items:center;font-size:10px;color:#fff"));
    pickBtn.onclick = (e) => chooseSide(p, e);
    const head = h("div", { class: "pane-head" }, pickBtn, h("div", { style: "flex:1" }));
    if (p.kind !== "none") {
      const mk = (icon, title, fn) => { const b = h("button", { class: "icon-btn", title, html: Icon(icon, 15) }); b.onclick = fn; return b; };
      head.append(
        mk("up", "Up", () => { p.path = parentPath(p.path, p.kind); S.load(p); }),
        mk("refresh", "Refresh", () => S.load(p)),
        mk("plus", "New folder", async () => {
          const n = await App.prompt("New folder", "Name", "", "Create");
          if (!n) return;
          const path = joinPath(p.path, p.kind, n);
          try { p.kind === "local" ? await App.invoke("local_mkdir", { path }) : await App.invoke("sftp_mkdir", { id: p.sessionId, path }); } catch (e) { App.toast(String(e), true); }
          S.load(p);
        }),
        mk("dots", "Actions", (e) => App.menu(e, actions(p, other))));
    }
    el.append(head);
    if (p.kind === "none") {
      const list = h("div", { class: "content" });
      const hosts = App.sortItems(App.data.hosts, App.hostLabel);
      list.append(h("div", { class: "section-title" }, "Hosts"));
      if (!hosts.length) list.append(h("div", { class: "hint", style: "color:var(--text-2)" }, "Add a host in the Hosts screen to browse its files here."));
      const g = h("div", { class: "grid list" });
      for (const x of hosts) {
        const c = h("div", { class: "card" }, App.avatar(x.os, App.hostLabel(x)), h("div", { class: "info" }, h("div", { class: "title" }, App.hostLabel(x)), h("div", { class: "subtitle" }, "sftp, " + (App.resolveHost(x).username || x.address))));
        c.onclick = () => S.connect(p, x);
        g.append(c);
      }
      const loc = h("div", { class: "card" }, App.avatar("local", "L"), h("div", { class: "info" }, h("div", { class: "title" }, "Local"), h("div", { class: "subtitle" }, "Files on this computer")));
      loc.onclick = () => { p.kind = "local"; S.goLocalHome(p); };
      g.prepend(loc);
      list.append(g);
      el.append(list);
      return el;
    }
    const pathInput = h("input", { class: "input", value: p.path, spellcheck: "false" });
    pathInput.onkeydown = (e) => { if (e.key === "Enter") { p.path = pathInput.value; S.load(p); } };
    el.append(h("div", { class: "pane-path" }, pathInput));

    const table = h("div", { class: "ftable" });
    const headRow = h("div", { class: "frow head" });
    for (const [key, label] of [["name", "Name"], ["modified", "Date Modified"], ["size", "Size"], ["kind", "Kind"]]) {
      const c = h("div", { style: "cursor:default" }, label + (p.sortBy === key ? (p.asc ? " ▲" : " ▼") : ""));
      c.onclick = () => { if (p.sortBy === key) p.asc = !p.asc; else { p.sortBy = key; p.asc = true; } redraw(); };
      headRow.append(c);
    }
    table.append(headRow);
    if (p.status === "connecting" || p.status === "loading") table.append(h("div", { class: "hint", style: "padding:14px;color:var(--text-2)" }, p.status === "connecting" ? "Connecting..." : "Loading..."));
    else if (p.status.startsWith("error")) table.append(h("div", { style: "padding:14px;color:var(--red);user-select:text" }, p.status.slice(7)));
    const sorted = [...p.entries].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      const k = p.sortBy;
      const r = k === "name" || k === "kind" ? String(a[k]).localeCompare(String(b[k]), undefined, { numeric: true }) : a[k] - b[k];
      return p.asc ? r : -r;
    });
    if (p.path && parentPath(p.path, p.kind) !== p.path) {
      const up = h("div", { class: "frow" }, h("div", { class: "fname" }, App.icon("folder", 16), h("span", {}, "..")), h("div"), h("div"), h("div"));
      up.ondblclick = () => { p.path = parentPath(p.path, p.kind); S.load(p); };
      table.append(up);
    }
    for (const f of sorted) {
      const full = joinPath(p.path, p.kind, f.name);
      const row = h("div", { class: "frow" + (p.selected.has(f.name) ? " sel" : ""), draggable: "true" },
        h("div", { class: "fname" }, h("span", { html: Icon(f.is_dir ? "folder" : "file", 16), style: `color:${f.is_dir ? "var(--blue)" : "var(--text-2)"};flex:0 0 16px` }), h("span", {}, f.name)),
        h("div", { class: "muted" }, App.formatDate(f.modified)), h("div", { class: "muted" }, f.is_dir ? "--" : App.formatSize(f.size)), h("div", { class: "muted" }, f.kind));
      row.onclick = (e) => {
        if (!e.ctrlKey && !e.metaKey) p.selected.clear();
        p.selected.has(f.name) ? p.selected.delete(f.name) : p.selected.add(f.name);
        table.querySelectorAll(".frow.sel").forEach((r) => r.classList.remove("sel"));
        table.querySelectorAll(".frow").forEach((r) => { const n = r.querySelector(".fname span:last-child"); if (n && p.selected.has(n.textContent)) r.classList.add("sel"); });
      };
      row.ondblclick = () => { if (f.is_dir) { p.path = full; S.load(p); } };
      row.oncontextmenu = (e) => { e.preventDefault(); if (!p.selected.has(f.name)) { p.selected.clear(); p.selected.add(f.name); } App.menu(e, actions(p, other)); };
      row.ondragstart = (e) => { if (!p.selected.has(f.name)) { p.selected.clear(); p.selected.add(f.name); } e.dataTransfer.setData("text/plain", JSON.stringify({ side: p.side })); };
      table.append(row);
    }
    el.append(table);
    el.ondragover = (e) => { e.preventDefault(); el.classList.add("drop"); };
    el.ondragleave = () => el.classList.remove("drop");
    el.ondrop = (e) => {
      e.preventDefault(); el.classList.remove("drop");
      try { const d = JSON.parse(e.dataTransfer.getData("text/plain")); if (d.side !== p.side) S.copy(S.panes[d.side], p); } catch (err) { /* not ours */ }
    };
    if (S.transfers.length) {
      const tr = h("div", { class: "transfers" });
      for (const t of S.transfers.slice(-6)) {
        const pct = t.total ? Math.round((t.done / t.total) * 100) : t.finished ? 100 : 0;
        tr.append(h("div", { class: "transfer" }, App.icon(t.up ? "upload" : "download", 14), h("span", { style: "width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, t.name),
          h("div", { class: "bar" }, h("div", { style: `width:${pct}%;background:${t.error ? "var(--red)" : "var(--blue)"}` })), h("span", { class: "muted" }, t.error ? "failed" : t.finished ? "done" : pct + "%")));
      }
      if (p.side === 1) el.append(tr);
    }
    return el;
  };

  const actions = (p, other) => {
    const sel = [...p.selected];
    const one = sel.length === 1;
    const canCopy = sel.length && other.kind !== "none" && !(p.kind === "remote" && other.kind === "remote");
    return [
      { name: "Copy to target directory", icon: "copy", disabled: !canCopy, handler: () => S.copy(p, other) },
      { name: "Rename", icon: "edit", disabled: !one, handler: async () => {
        const n = await App.prompt("Rename", "New name", sel[0], "Rename");
        if (!n || n === sel[0]) return;
        const from = joinPath(p.path, p.kind, sel[0]), to = joinPath(p.path, p.kind, n);
        try { p.kind === "local" ? await App.invoke("local_rename", { from, to }) : await App.invoke("sftp_rename", { id: p.sessionId, from, to }); } catch (e) { App.toast(String(e), true); }
        S.load(p);
      } },
      { name: "Copy path", icon: "copy", disabled: !one, handler: () => navigator.clipboard.writeText(joinPath(p.path, p.kind, sel[0])) },
      { name: "Refresh", icon: "refresh", handler: () => S.load(p) },
      "-",
      { name: "Delete", icon: "trash", danger: true, disabled: !sel.length, handler: async () => {
        if (!(await App.confirm("Delete", `Delete ${sel.length === 1 ? '"' + sel[0] + '"' : sel.length + " items"}? Folders are deleted with everything inside.`))) return;
        for (const n of sel) {
          const path = joinPath(p.path, p.kind, n);
          try { p.kind === "local" ? await App.invoke("local_remove", { path }) : await App.invoke("sftp_remove", { id: p.sessionId, path }); } catch (e) { App.toast(String(e), true); }
        }
        S.load(p);
      } },
    ];
  };

  S.copy = async (from, to) => {
    const names = [...from.selected];
    if (!names.length || to.kind === "none") return;
    if (from.kind === "remote" && to.kind === "remote") { App.toast("Copy between two servers through this computer: download first, then upload.", true); return; }
    for (const n of names) {
      const src = joinPath(from.path, from.kind, n);
      const t = { name: n, done: 0, total: 0, up: from.kind === "local", finished: false, error: null };
      S.transfers.push(t);
      redraw();
      try {
        if (from.kind === "local" && to.kind === "remote") await App.invoke("sftp_upload", { id: to.sessionId, local: src, remoteDir: to.path });
        else if (from.kind === "remote" && to.kind === "local") await App.invoke("sftp_download", { id: from.sessionId, remote: src, localDir: to.path });
        else await App.invoke("local_copy", { from: src, toDir: to.path });
        t.finished = true;
      } catch (e) { t.error = String(e); t.finished = true; App.toast("Transfer failed: " + e, true); }
    }
    S.load(to);
  };

  App.listen("sftp-progress", (pr) => {
    const t = [...S.transfers].reverse().find((x) => !x.finished);
    if (!t) return;
    if (!pr.finished) { t.done = pr.done; t.total = pr.total; t.name = pr.name || t.name; }
    clearTimeout(S._rt);
    S._rt = setTimeout(redraw, 120);
  });
})();
