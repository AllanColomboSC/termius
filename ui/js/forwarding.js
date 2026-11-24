// Port Forwarding screen: Local, Remote and Dynamic rules that can be switched on and off.
(function () {
  const F = App.forms;
  const P = (App.forwarding = { running: {}, query: "" });

  const KIND = { local: "Local", remote: "Remote", dynamic: "Dynamic" };
  const describe = (r) => {
    const host = App.byId("hosts", r.hostId);
    const hl = host ? App.hostLabel(host) : "no host";
    if (r.kind === "dynamic") return `SOCKS on ${r.bindAddress || "127.0.0.1"}:${r.bindPort || "?"} through ${hl}`;
    if (r.kind === "remote") return `${hl}:${r.bindPort || "?"} → ${r.destHost || "127.0.0.1"}:${r.destPort || "?"}`;
    return `${r.bindAddress || "127.0.0.1"}:${r.bindPort || "?"} → ${r.destHost || "?"}:${r.destPort || "?"} via ${hl}`;
  };

  P.render = (page) => {
    page.innerHTML = "";
    const input = h("input", { placeholder: "Search", value: P.query });
    input.oninput = () => { P.query = input.value; draw(); };
    page.append(h("div", { class: "searchbar" }, h("div", { class: "search" }, App.icon("search", 16), input)));
    const add = h("button", { class: "btn" }, App.icon("plus", 14), " New Forwarding");
    add.onclick = () => P.edit(null, "local");
    const chev = h("button", { class: "btn chev", html: Icon("chevron", 12) });
    chev.onclick = (e) => App.menu(e, [
      { name: "Local Forwarding", icon: "forward", handler: () => P.edit(null, "local") },
      { name: "Remote Forwarding", icon: "forward", handler: () => P.edit(null, "remote") },
      { name: "Dynamic Forwarding", icon: "forward", handler: () => P.edit(null, "dynamic") },
    ]);
    page.append(h("div", { class: "toolbar" }, h("div", { class: "split" }, add, chev), h("div", { class: "grow" })));
    const content = h("div", { class: "content" });
    page.append(content);
    const draw = () => {
      content.innerHTML = "";
      const rules = App.data.rules.filter((r) => ((r.label || "") + describe(r)).toLowerCase().includes(P.query.toLowerCase()));
      if (!App.data.rules.length) {
        const b = h("button", { class: "btn primary" }, "New Forwarding");
        b.onclick = () => P.edit(null, "local");
        content.append(h("div", { class: "empty" }, h("div", { class: "empty-art", html: Icon("forward", 48) }),
          h("h2", {}, "Set up port forwarding"),
          h("p", {}, "Reach a service on a server as if it ran on this computer, share a local service with a server, or browse through a server."), b));
        return;
      }
      content.append(h("div", { class: "section-title" }, "Port Forwarding", h("span", { class: "count" }, String(rules.length))));
      const grid = h("div", { class: "grid" });
      for (const r of App.sortItems(rules, (x) => x.label || "")) {
        const on = !!P.running[r.id];
        const tg = h("button", { class: "toggle" + (on ? " on" : ""), title: on ? "Stop" : "Start" });
        tg.onclick = (e) => { e.stopPropagation(); on ? P.stop(r) : P.start(r); };
        const c = h("div", { class: "card" },
          h("div", { class: "avatar", style: `background:${on ? "var(--green)" : "var(--dark-grey-6)"}`, html: Icon("forward", 20) }),
          h("div", { class: "info" }, h("div", { class: "title" }, r.label || KIND[r.kind] + " rule"), h("div", { class: "subtitle" }, describe(r))), tg);
        c.onclick = () => P.edit(r);
        c.oncontextmenu = (e) => { e.preventDefault(); App.menu(e, [
          { name: on ? "Stop" : "Start", icon: on ? "stop" : "play", handler: () => (on ? P.stop(r) : P.start(r)) },
          { name: "Edit", icon: "edit", handler: () => P.edit(r) },
          { name: "Duplicate", icon: "copy", handler: () => { const c2 = Object.assign({}, r, { id: App.uid(), label: (r.label || "") + " copy" }); App.data.rules.push(c2); App.save(); App.refresh(); } },
          "-", { name: "Remove", icon: "trash", danger: true, handler: () => P.remove(r) }]); };
        grid.append(c);
      }
      content.append(grid);
    };
    draw();
  };

  P.edit = (r, kind) => {
    const isNew = !r;
    if (isNew) {
      r = { id: App.uid(), label: "", kind: kind || "local", hostId: null, bindAddress: "127.0.0.1", bindPort: "", destHost: kind === "remote" ? "127.0.0.1" : "", destPort: "", createdAt: Date.now() };
      App.data.rules.push(r); App.save();
    }
    const body = h("div", {});
    const draw = () => {
      body.innerHTML = "";
      const typeSel = F.select(r, "kind", [{ value: "local", label: "Local" }, { value: "remote", label: "Remote" }, { value: "dynamic", label: "Dynamic" }], { onChange: () => { draw(); App.refreshSoft(); } });
      body.append(F.card(null, F.field("Type", typeSel), F.field(null, F.input(r, "label", { placeholder: "Label", lead: "edit", onChange: App.refreshSoft }))));
      body.append(F.card(r.kind === "remote" ? "Server (where the port opens)" : "Host to tunnel through",
        F.field(null, F.select(r, "hostId", F.hostOptions(), { placeholder: "Select a host", onChange: App.refreshSoft }))));
      const bindTitle = r.kind === "remote" ? "Port on the server" : "Port on this computer";
      body.append(F.card(bindTitle,
        F.field("Bind address", F.input(r, "bindAddress", { placeholder: r.kind === "remote" ? "0.0.0.0" : "127.0.0.1", onChange: App.refreshSoft })),
        F.field("Port", F.input(r, "bindPort", { type: "number", placeholder: "Port", onChange: App.refreshSoft }))));
      if (r.kind !== "dynamic") {
        body.append(F.card(r.kind === "remote" ? "Send connections to (from this computer)" : "Destination (seen from the server)",
          F.field("Host", F.input(r, "destHost", { placeholder: r.kind === "remote" ? "127.0.0.1" : "Destination address", onChange: App.refreshSoft })),
          F.field("Port", F.input(r, "destPort", { type: "number", placeholder: "Port", onChange: App.refreshSoft }))));
      } else {
        body.append(h("div", { class: "hint", style: "padding:0 4px" }, "Point a browser or app at this SOCKS5 proxy to reach anything the server can reach."));
      }
    };
    draw();
    const on = !!P.running[r.id];
    const btn = h("button", { class: "btn big " + (on ? "danger" : "green") }, on ? "Stop" : "Start");
    btn.onclick = () => { (P.running[r.id] ? P.stop(r) : P.start(r)); };
    App.slider.open(isNew ? "New Port Forwarding" : "Port Forwarding Rule", body, {
      foot: btn,
      menu: [{ name: "Remove", icon: "trash", danger: true, handler: () => P.remove(r) }],
      onClose: () => { if (!r.bindPort && !r.label && !r.hostId) { App.data.rules = App.data.rules.filter((y) => y.id !== r.id); App.save(); } App.refreshSoft(); },
    });
    App.refreshSoft();
  };

  P.start = async (r) => {
    const host = App.byId("hosts", r.hostId);
    if (!host) { App.toast("Choose a host for this rule first", true); P.edit(r); return; }
    if (!r.bindPort) { App.toast("Set the port first", true); P.edit(r); return; }
    const rule = { kind: r.kind, bind_address: r.bindAddress || (r.kind === "remote" ? "0.0.0.0" : "127.0.0.1"), bind_port: Number(r.bindPort) || 0,
      dest_host: r.destHost || "127.0.0.1", dest_port: Number(r.destPort) || 0 };
    const attempt = async (target) => {
      try {
        await App.invoke("pf_start", { id: r.id, target, rule });
        P.running[r.id] = true;
        App.logs.add({ hostId: host.id, label: r.label || KIND[r.kind] + " forwarding", address: host.address, user: target.username, kind: "Port forwarding", status: "Started" });
        App.toast(`${r.label || KIND[r.kind] + " forwarding"} started`);
      } catch (e) {
        const handled = await App.terminal.handleConnectError(String(e), host, target, (t2) => attempt(t2));
        if (!handled) App.toast("Port forwarding failed: " + App.errText(e), true);
      }
      App.refreshSoft();
      if (App.slider.isOpen()) P.edit(r);
    };
    await attempt(App.targetFor(host));
  };

  P.stop = async (r) => {
    await App.invoke("pf_stop", { id: r.id }).catch(() => {});
    delete P.running[r.id];
    App.refreshSoft();
    if (App.slider.isOpen()) P.edit(r);
  };

  P.remove = async (r) => {
    if (!(await App.confirm("Remove rule", `Remove "${r.label || describe(r)}"?`, "Remove"))) return;
    if (P.running[r.id]) await P.stop(r);
    App.data.rules = App.data.rules.filter((y) => y.id !== r.id);
    App.save(); App.slider.close(); App.refresh();
  };
})();
