// Logs screen: history of connections, newest first.
(function () {
  const L = (App.logs = { query: "" });

  L.add = (entry) => {
    if (!App.data.settings.logsEnabled) return null;
    const e = Object.assign({ id: App.uid(), start: Date.now(), end: null }, entry);
    App.data.logs.unshift(e);
    if (App.data.logs.length > 1000) App.data.logs.length = 1000;
    App.save();
    return e;
  };
  L.finish = (id, status) => {
    const e = App.data.logs.find((x) => x.id === id);
    if (!e) return;
    e.end = Date.now();
    if (status) e.status = status;
    App.save();
  };

  L.render = (page) => {
    page.innerHTML = "";
    const input = h("input", { placeholder: "Search", value: L.query });
    input.oninput = () => { L.query = input.value; draw(); };
    page.append(h("div", { class: "searchbar" }, h("div", { class: "search" }, App.icon("search", 16), input)));
    const clear = h("button", { class: "btn ghost" }, App.icon("trash", 14), "Clear logs");
    clear.onclick = async () => { if (await App.confirm("Delete existing logs", "Delete the whole connection history?", "Delete")) { App.data.logs = []; App.save(); App.refresh(); } };
    page.append(h("div", { class: "toolbar" }, h("div", { class: "grow" }), clear));
    const content = h("div", { class: "content" });
    page.append(content);
    const draw = () => {
      content.innerHTML = "";
      if (!App.data.logs.length) {
        content.append(h("div", { class: "empty" }, h("div", { class: "empty-art", html: Icon("logs", 48) }),
          h("h2", {}, "No logs yet"), h("p", {}, App.data.settings.logsEnabled ? "Each connection you open is listed here." : "Logs are turned off in Settings.")));
        return;
      }
      const q = L.query.toLowerCase();
      const list = App.data.logs.filter((e) => [e.label, e.address, e.user, e.kind].join(" ").toLowerCase().includes(q));
      content.append(h("div", { class: "section-title" }, "Logs", h("span", { class: "count" }, String(list.length))));
      const g = h("div", { class: "grid list" });
      for (const e of list.slice(0, 400)) {
        const host = e.hostId && App.byId("hosts", e.hostId);
        const dur = e.end ? Math.max(1, Math.round((e.end - e.start) / 1000)) : null;
        const c = h("div", { class: "card" }, App.avatar(host ? host.os : e.kind === "Local terminal" ? "local" : null, e.label, "avatar"),
          h("div", { class: "info" }, h("div", { class: "title" }, e.label || e.address),
            h("div", { class: "subtitle" }, [e.kind, e.user ? e.user + "@" + (e.address || "") : e.address, e.status].filter(Boolean).join(" · "))),
          h("div", { class: "subtitle", style: "white-space:nowrap" }, App.formatDate(e.start) + (dur ? ` · ${dur < 60 ? dur + "s" : Math.round(dur / 60) + " min"}` : "")));
        c.ondblclick = () => { if (host) App.terminal.connectHost(host); };
        c.oncontextmenu = (ev) => { ev.preventDefault(); App.menu(ev, [
          { name: "Connect again", icon: "terminal", disabled: !host, handler: () => App.terminal.connectHost(host) },
          { name: "Remove", icon: "trash", danger: true, handler: () => { App.data.logs = App.data.logs.filter((x) => x.id !== e.id); App.save(); draw(); } }]); };
        g.append(c);
      }
      content.append(g);
    };
    draw();
  };
})();
