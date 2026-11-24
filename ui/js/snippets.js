// Snippets screen: saved commands, grouped in packages, run on one or more hosts.
(function () {
  const F = App.forms;
  const S = (App.snippets = { query: "", pkg: null });

  S.render = (page) => {
    page.innerHTML = "";
    const input = h("input", { placeholder: "Search", value: S.query });
    input.oninput = () => { S.query = input.value; draw(); };
    page.append(h("div", { class: "searchbar" }, h("div", { class: "search" }, App.icon("search", 16), input)));
    const add = h("button", { class: "btn" }, App.icon("plus", 14), " Snippet");
    add.onclick = () => S.edit(null);
    const chev = h("button", { class: "btn chev", html: Icon("chevron", 12) });
    chev.onclick = (e) => App.menu(e, [{ name: "New Package", icon: "group", handler: S.newPackage }]);
    page.append(h("div", { class: "toolbar" }, h("div", { class: "split" }, add, chev), h("div", { class: "grow" })));
    const content = h("div", { class: "content" });
    page.append(content);

    const draw = () => {
      content.innerHTML = "";
      const d = App.data;
      const q = S.query.toLowerCase();
      if (!d.snippets.length && !d.packages.length) {
        const b = h("button", { class: "btn primary" }, "New Snippet");
        b.onclick = () => S.edit(null);
        content.append(h("div", { class: "empty" }, h("div", { class: "empty-art", html: Icon("snippets", 48) }),
          h("h2", {}, "Save commands you use often"),
          h("p", {}, "Run a snippet in an open terminal, or on several hosts at once."), b));
        return;
      }
      if (S.pkg) {
        const crumbs = h("div", { class: "breadcrumbs" });
        const all = h("a", {}, "All snippets");
        all.onclick = () => { S.pkg = null; draw(); };
        const p = App.byId("packages", S.pkg);
        crumbs.append(all, App.icon("right", 12), h("span", {}, p ? p.label : "Package"));
        content.append(crumbs);
      } else if (d.packages.length) {
        content.append(h("div", { class: "section-title" }, "Packages"));
        const g = h("div", { class: "grid" });
        for (const p of App.sortItems(d.packages, (x) => x.label || "")) {
          const n = d.snippets.filter((s) => s.packageId === p.id).length;
          const c = h("div", { class: "card" }, h("div", { class: "avatar", style: "background:var(--blueberry)", html: Icon("group", 20) }),
            h("div", { class: "info" }, h("div", { class: "title" }, p.label || "Package"), h("div", { class: "subtitle" }, `${n} snippet${n === 1 ? "" : "s"}`)));
          c.onclick = () => { S.pkg = p.id; draw(); };
          c.oncontextmenu = (e) => { e.preventDefault(); App.menu(e, [
            { name: "Rename", icon: "edit", handler: async () => { const v = await App.prompt("Rename package", "Name", p.label); if (v != null) { p.label = v; App.save(); draw(); } } },
            { name: "Remove", icon: "trash", danger: true, handler: async () => {
              if (!(await App.confirm("Remove package", `Remove "${p.label}"? Its snippets are kept.`, "Remove"))) return;
              for (const s of d.snippets) if (s.packageId === p.id) s.packageId = null;
              d.packages = d.packages.filter((x) => x.id !== p.id); App.save(); draw(); } }]); };
          g.append(c);
        }
        content.append(g);
      }
      const list = d.snippets.filter((s) => (S.pkg ? s.packageId === S.pkg : !s.packageId || q) && ((s.label || "") + (s.script || "")).toLowerCase().includes(q));
      content.append(h("div", { class: "section-title" }, "Snippets", h("span", { class: "count" }, String(list.length))));
      const g = h("div", { class: "grid" });
      for (const s of App.sortItems(list, (x) => x.label || "")) {
        const run = h("button", { class: "icon-btn", title: "Run", html: Icon("play", 14) });
        run.onclick = (e) => { e.stopPropagation(); S.runDialog(s); };
        const c = h("div", { class: "card" }, h("div", { class: "avatar", style: "background:#08639f", html: Icon("snippets", 20) }),
          h("div", { class: "info" }, h("div", { class: "title" }, s.label || "Snippet"), h("div", { class: "subtitle", style: "font-family:Consolas,monospace" }, (s.script || "").split("\n")[0])),
          h("div", { class: "card-actions" }, run));
        c.onclick = () => S.edit(s);
        c.ondblclick = () => S.runDialog(s);
        c.oncontextmenu = (e) => { e.preventDefault(); App.menu(e, [
          { name: "Run", icon: "play", handler: () => S.runDialog(s) },
          { name: "Paste into current terminal", icon: "terminal", disabled: !App.terminal.lastTerminal(), handler: () => App.terminal.sendToLast(s.script, false) },
          { name: "Edit", icon: "edit", handler: () => S.edit(s) },
          "-", { name: "Remove", icon: "trash", danger: true, handler: () => S.remove(s) }]); };
        g.append(c);
      }
      content.append(g);
    };
    draw();
  };

  S.newPackage = async () => {
    const v = await App.prompt("New Package", "Name", "", "Create");
    if (!v) return;
    App.data.packages.push({ id: App.uid(), label: v, createdAt: Date.now() });
    App.save(); App.refresh();
  };

  S.edit = (s) => {
    const isNew = !s;
    if (isNew) { s = { id: App.uid(), label: "", script: "", packageId: S.pkg, createdAt: Date.now() }; App.data.snippets.push(s); App.save(); }
    const run = h("button", { class: "btn green big" }, "Run");
    run.onclick = () => S.runDialog(s);
    App.slider.open(isNew ? "New Snippet" : "Snippet Details", h("div", {},
      F.card(null, F.field(null, F.input(s, "label", { placeholder: "Example: check network load", lead: "edit", onChange: App.refreshSoft })),
        F.field("Package", F.select(s, "packageId", App.data.packages.map((p) => ({ value: p.id, label: p.label })), { placeholder: "No package", onChange: App.refreshSoft }))),
      F.card("Script", F.textarea(s, "script", { placeholder: "ifconfig\nnetstat -an | grep LISTEN", rows: 8, onChange: App.refreshSoft }))), {
      foot: run,
      menu: [{ name: "Remove", icon: "trash", danger: true, handler: () => S.remove(s) }],
      onClose: () => { if (!s.label && !s.script) { App.data.snippets = App.data.snippets.filter((y) => y.id !== s.id); App.save(); } App.refreshSoft(); },
    });
    App.refreshSoft();
  };

  S.remove = async (s) => {
    if (!(await App.confirm("Remove snippet", `Remove "${s.label || "Snippet"}"?`, "Remove"))) return;
    App.data.snippets = App.data.snippets.filter((y) => y.id !== s.id);
    App.save(); App.slider.close(); App.refresh();
  };

  // Pick where to run: open terminals and/or saved hosts (new tabs).
  S.runDialog = (s) => {
    if (!s.script) { App.toast("This snippet is empty", true); return; }
    const chosen = new Set();
    const list = h("div", { style: "max-height:320px;overflow-y:auto" });
    const add = (key, label, sub) => {
      const cb = h("input", { type: "checkbox" });
      cb.onchange = () => (cb.checked ? chosen.add(key) : chosen.delete(key));
      list.append(h("label", { class: "row-between", style: "cursor:default" }, h("div", {}, h("div", {}, label), h("div", { class: "hint" }, sub)), cb));
    };
    for (const t of App.terminal.openTerminals()) add("tab:" + t.id, t.title, "Open tab");
    for (const x of App.sortItems(App.data.hosts, App.hostLabel)) add("host:" + x.id, App.hostLabel(x), "New tab: " + x.address);
    App.dialog({
      title: "Run “" + (s.label || "Snippet") + "”",
      body: list,
      actions: [{ name: "Cancel", kind: "ghost" }, { name: "Run", kind: "green", handler: () => {
        for (const k of chosen) {
          const [kind, id] = k.split(":");
          if (kind === "tab") App.terminal.sendTo(id, s.script, true);
          else { const x = App.byId("hosts", id); if (x) App.terminal.connectHost(x, { startup: s.script }); }
        }
      } }],
    });
  };
})();
