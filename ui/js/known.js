// Known Hosts screen: server keys the person has accepted.
(function () {
  const K = (App.known = { query: "" });

  K.render = (page) => {
    page.innerHTML = "";
    const input = h("input", { placeholder: "Search", value: K.query });
    input.oninput = () => { K.query = input.value; draw(); };
    page.append(h("div", { class: "searchbar" }, h("div", { class: "search" }, App.icon("search", 16), input)));
    const imp = h("button", { class: "btn" }, App.icon("import", 14), " Import");
    imp.onclick = K.importFile;
    page.append(h("div", { class: "toolbar" }, imp, h("div", { class: "grow" })));
    const content = h("div", { class: "content" });
    page.append(content);
    const draw = () => {
      content.innerHTML = "";
      const list = App.data.knownHosts.filter((k) => (k.host + k.fingerprint).toLowerCase().includes(K.query.toLowerCase()));
      if (!App.data.knownHosts.length) {
        content.append(h("div", { class: "empty" }, h("div", { class: "empty-art", html: Icon("known", 48) }),
          h("h2", {}, "No known hosts yet"),
          h("p", {}, "When you connect to a server for the first time and trust its key, it is remembered here. You can also import a known_hosts file.")));
        return;
      }
      content.append(h("div", { class: "section-title" }, "Known Hosts", h("span", { class: "count" }, String(list.length))));
      const g = h("div", { class: "grid list" });
      for (const k of list.sort((a, b) => a.host.localeCompare(b.host))) {
        const rm = h("button", { class: "icon-btn", title: "Remove", html: Icon("trash", 14) });
        rm.onclick = (e) => { e.stopPropagation(); K.remove(k); };
        const c = h("div", { class: "card" }, h("div", { class: "avatar", style: "background:var(--green-dark)", html: Icon("known", 16) }),
          h("div", { class: "info" }, h("div", { class: "title" }, k.host + (Number(k.port) !== 22 ? ":" + k.port : "")),
            h("div", { class: "subtitle" }, (k.keyType || "") + "  " + (k.fingerprint || ""))),
          h("div", { class: "card-actions" }, rm));
        c.oncontextmenu = (e) => { e.preventDefault(); App.menu(e, [
          { name: "Copy fingerprint", icon: "copy", handler: () => navigator.clipboard.writeText(k.fingerprint) },
          { name: "Remove", icon: "trash", danger: true, handler: () => K.remove(k) }]); };
        g.append(c);
      }
      content.append(g);
    };
    draw();
  };

  K.add = (host, port, fingerprint, keyType) => {
    App.data.knownHosts = App.data.knownHosts.filter((k) => !(k.host === host && Number(k.port) === Number(port)));
    App.data.knownHosts.push({ id: App.uid(), host, port: Number(port) || 22, fingerprint, keyType, added: Date.now() });
    App.save();
  };

  K.remove = async (k) => {
    if (!(await App.confirm("Remove known host", `Forget the key of ${k.host}? You will be asked again on the next connection.`, "Remove"))) return;
    App.data.knownHosts = App.data.knownHosts.filter((y) => y.id !== k.id);
    App.save(); App.refresh();
  };

  // Reads an OpenSSH known_hosts file; each key becomes its SHA256 fingerprint.
  // Hashed host names (|1|...) can't be read back and are skipped.
  K.importFile = async () => {
    const f = await App.invoke("pick_files", { title: "known_hosts file", folder: false, multiple: false });
    if (!f[0]) return;
    let text;
    try { text = await App.invoke("read_text_file", { path: f[0] }); } catch (e) { App.toast(String(e), true); return; }
    let added = 0, skipped = 0;
    for (const line of text.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3 || line.trim().startsWith("#")) continue;
      let [hosts, type, blob] = parts[0].startsWith("@") ? parts.slice(1) : parts;
      if (hosts.startsWith("|")) { skipped++; continue; }
      let bytes;
      try { bytes = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0)); } catch (e) { skipped++; continue; }
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const fp = "SHA256:" + btoa(String.fromCharCode(...digest)).replace(/=+$/, "");
      for (const name of hosts.split(",")) {
        const m = name.match(/^\[(.+)\]:(\d+)$/);
        K.add(m ? m[1] : name, m ? Number(m[2]) : 22, fp, type);
        added++;
      }
    }
    App.refresh();
    App.toast(`Imported ${added} known host${added === 1 ? "" : "s"}` + (skipped ? `, ${skipped} hashed or unreadable skipped` : ""));
  };
})();
