// New tab / Jump to / command palette: search hosts and open tabs, quick connect, local terminal, serial.
(function () {
  App.palette = (mode = "newTab") => {
    App.closeOverlay();
    const o = document.getElementById("overlay");
    o.className = "show dim";
    o.onmousedown = (e) => { if (e.target === o) App.closeOverlay(); };
    const box = h("div", { class: "palette" });
    const input = h("input", { placeholder: "Search hosts or tabs", spellcheck: "false" });
    const groups = h("div", { class: "groups" });
    box.append(input, groups);
    document.body.append(box);
    let items = [];
    let sel = 0;

    const draw = () => {
      const q = input.value.trim().toLowerCase();
      groups.innerHTML = "";
      items = [];
      const section = (title, list) => {
        if (!list.length) return;
        groups.append(h("div", { class: "ghead" }, title));
        for (const it of list) {
          const idx = items.length;
          const row = h("div", { class: "pitem" + (idx === sel ? " sel" : "") }, it.av, h("span", {}, it.title), it.hint ? h("span", { class: "hint" }, it.hint) : null);
          row.onmouseenter = () => { sel = idx; groups.querySelectorAll(".pitem").forEach((r, i) => r.classList.toggle("sel", i === sel)); };
          row.onclick = () => run(idx);
          groups.append(row);
          items.push(it);
        }
      };
      const small = (os, label) => App.avatar(os, label, "small-av");
      const hosts = App.sortItems(App.data.hosts, App.hostLabel).filter((x) => !q || [x.label, x.address, ...(x.tags || [])].some((v) => (v || "").toLowerCase().includes(q)));
      const tabs = App.terminal.tabs.filter((t) => !q || t.title.toLowerCase().includes(q));
      section("Hosts", hosts.slice(0, 30).map((x) => ({ title: App.hostLabel(x), hint: x.address, av: small(x.os, App.hostLabel(x)), run: () => App.terminal.connectHost(x) })));
      section("Tabs", tabs.map((t) => ({ title: t.title, hint: t.status, av: small(t.host && t.host.os, t.title), run: () => App.openTab(t.id) })));
      const quick = [];
      if (App.parseSsh(input.value) && q) quick.push({ title: input.value.trim(), hint: "Connect", av: App.icon("bolt", 16), run: () => App.hosts.quickConnect(input.value) });
      quick.push({ title: "Local Terminal", hint: "Ctrl+L", av: small("local", "L"), run: () => App.terminal.openLocal() });
      quick.push({ title: "Serial", hint: "Ctrl+Alt+S", av: small("serial", "S"), run: () => App.terminal.serialDialog() });
      if (mode === "commands") {
        quick.push({ title: "Open SFTP", av: App.icon("sftp", 16), run: () => App.openTab("sftp") });
        quick.push({ title: "Open Snippets", hint: "Ctrl+Shift+S", av: App.icon("snippets", 16), run: () => App.openVaultPage("snippets") });
        quick.push({ title: "Open Port Forwarding", hint: "Ctrl+P", av: App.icon("forward", 16), run: () => App.openVaultPage("forwarding") });
        quick.push({ title: "Settings", av: App.icon("gear", 16), run: () => App.openSettings() });
      }
      section("Quick connect", quick.filter((x) => !q || x.title.toLowerCase().includes(q) || x.hint === "Connect"));
      if (sel >= items.length) sel = Math.max(0, items.length - 1);
    };
    const run = (i) => { const it = items[i]; App.closeOverlay(); if (it) it.run(); };
    input.oninput = () => { sel = 0; draw(); };
    input.onkeydown = (e) => {
      if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter") run(sel);
      else if (e.key === "Escape") App.closeOverlay();
    };
    draw();
    setTimeout(() => input.focus(), 10);
  };
})();
