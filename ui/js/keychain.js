// Keychain screen: keys (generate, import, paste) and identities (saved username/password/key sets).
(function () {
  const F = App.forms;
  const K = (App.keychain = { query: "" });

  K.render = (page) => {
    page.innerHTML = "";
    const d = App.data;
    const input = h("input", { placeholder: "Search", value: K.query });
    input.oninput = () => { K.query = input.value; draw(); };
    page.append(h("div", { class: "searchbar" }, h("div", { class: "search" }, App.icon("search", 16), input)));

    const keyBtn = h("button", { class: "btn" }, App.icon("plus", 14), " Key");
    keyBtn.onclick = () => K.editKey(null);
    const chev = h("button", { class: "btn chev", html: Icon("chevron", 12) });
    chev.onclick = (e) => App.menu(e, [
      { name: "Generate key", icon: "bolt", handler: () => K.generateForm() },
      { name: "New Identity", icon: "user", handler: () => K.editIdentity(null) },
      { name: "Import key file", icon: "import", handler: () => K.importFile() },
      { name: "Import from this computer", icon: "import", handler: () => K.localKeysDialog() },
    ]);
    const certBtn = h("button", { class: "btn ghost" }, App.icon("cert", 14), "Certificate");
    certBtn.onclick = () => K.editKey(null, true);
    const fidoBtn = h("button", { class: "btn ghost" }, App.icon("fido", 14), "FIDO2");
    fidoBtn.onclick = () => App.toast("Hardware security keys (FIDO2) are not supported in this version.", true);
    const sortBtn = h("button", { class: "icon-btn", title: "Sort", html: Icon("sort") });
    sortBtn.onclick = (e) => App.sortMenu(e, () => K.render(page));
    page.append(h("div", { class: "toolbar" }, h("div", { class: "split" }, keyBtn, chev), certBtn, fidoBtn, h("div", { class: "grow" }), sortBtn));

    const content = h("div", { class: "content" });
    page.append(content);
    const draw = () => {
      content.innerHTML = "";
      const q = K.query.toLowerCase();
      const keys = App.sortItems(d.keys.filter((k) => (k.label || "").toLowerCase().includes(q)), (k) => k.label || "");
      const ids = App.sortItems(d.identities.filter((i) => ((i.label || "") + (i.username || "")).toLowerCase().includes(q)), (i) => i.label || i.username || "");
      if (!d.keys.length && !d.identities.length) {
        const gen = h("button", { class: "btn primary" }, "Generate key");
        gen.onclick = () => K.generateForm();
        const imp = h("button", { class: "btn" }, "Import");
        imp.onclick = () => K.importFile();
        const local = h("button", { class: "btn" }, "Keys on this computer");
        local.onclick = () => K.localKeysDialog();
        content.append(h("div", { class: "empty" }, h("div", { class: "empty-art", html: Icon("keychain", 48) }),
          h("h2", {}, "Your keychain is empty"),
          h("p", {}, "Keys and identities saved here can be attached to any host."),
          h("div", { style: "display:flex;gap:8px" }, gen, imp, local)));
        return;
      }
      content.append(h("div", { class: "section-title" }, "Keys", h("span", { class: "count" }, String(keys.length))));
      const g1 = h("div", { class: "grid" });
      for (const k of keys) {
        const c = h("div", { class: "card" }, h("div", { class: "avatar", style: "background:#eca855", html: Icon("key", 20) }),
          h("div", { class: "info" }, h("div", { class: "title" }, k.label || "Key"),
            h("div", { class: "subtitle" }, (k.keyType || "Key") + (k.certificate ? ", certificate" : "") + (k.sourcePath ? ", from this computer" : ""))));
        c.onclick = () => K.editKey(k);
        c.oncontextmenu = (e) => { e.preventDefault(); App.menu(e, [
          { name: "Edit", icon: "edit", handler: () => K.editKey(k) },
          { name: "Copy public key", icon: "copy", handler: () => navigator.clipboard.writeText(k.publicKey || "") },
          "-", { name: "Remove", icon: "trash", danger: true, handler: () => K.removeKey(k) }]); };
        g1.append(c);
      }
      content.append(g1);
      if (ids.length) {
        content.append(h("div", { class: "section-title" }, "Identities", h("span", { class: "count" }, String(ids.length))));
        const g2 = h("div", { class: "grid" });
        for (const i of ids) {
          const c = h("div", { class: "card" }, h("div", { class: "avatar", style: "background:var(--blue)", html: Icon("user", 20) }),
            h("div", { class: "info" }, h("div", { class: "title" }, i.label || i.username || "Identity"),
              h("div", { class: "subtitle" }, [i.username, i.password ? "password" : "", i.keyId ? "key" : ""].filter(Boolean).join(", "))));
          c.onclick = () => K.editIdentity(i);
          c.oncontextmenu = (e) => { e.preventDefault(); App.menu(e, [
            { name: "Edit", icon: "edit", handler: () => K.editIdentity(i) },
            "-", { name: "Remove", icon: "trash", danger: true, handler: () => K.removeIdentity(i) }]); };
          g2.append(c);
        }
        content.append(g2);
      }
    };
    draw();
  };

  K.addKey = (fields) => {
    const k = Object.assign({ id: App.uid(), label: "", privateKey: "", publicKey: "", passphrase: "", fingerprint: "", keyType: "", certificate: "", createdAt: Date.now() }, fields);
    App.data.keys.push(k);
    App.save();
    return k;
  };

  K.editKey = (k, focusCert) => {
    const isNew = !k;
    if (isNew) k = K.addKey({});
    const info = h("div", { class: "hint", style: "margin-top:6px;word-break:break-all" });
    const showInfo = () => { info.textContent = k.fingerprint ? `${k.keyType}  ${k.fingerprint}` : ""; };
    const refresh = async () => {
      if (!k.privateKey.trim()) { k.publicKey = ""; k.fingerprint = ""; k.keyType = ""; showInfo(); App.save(); return; }
      try {
        const r = await App.invoke("key_inspect", { privateKey: k.privateKey, passphrase: k.passphrase || "" });
        k.publicKey = r.public_key; k.fingerprint = r.fingerprint; k.keyType = r.key_type;
        pub.value = k.publicKey;
      } catch (e) { info.textContent = "Could not read this key: " + e; return; }
      showInfo(); App.save(); App.refreshSoft();
    };
    const pub = h("textarea", { class: "textarea", readonly: true, style: "height:80px" });
    pub.value = k.publicKey || "";
    const copyPub = h("button", { class: "btn ghost lower" }, App.icon("copy", 14), "Copy public key");
    copyPub.onclick = () => { navigator.clipboard.writeText(k.publicKey || ""); App.toast("Public key copied"); };
    const loadFile = h("button", { class: "btn ghost lower" }, App.icon("import", 14), "Import from file");
    loadFile.onclick = async () => {
      const f = await App.invoke("pick_files", { title: "Private key", folder: false, multiple: false });
      if (!f[0]) return;
      k.privateKey = await App.invoke("read_text_file", { path: f[0] });
      if (!k.label) k.label = f[0].split(/[\\/]/).pop();
      App.keychain.editKey(k);
      refresh();
    };
    const body = h("div", {},
      F.card(null, F.field(null, F.input(k, "label", { placeholder: "Label", lead: "edit", onChange: App.refreshSoft }))),
      F.card("Private key", F.textarea(k, "privateKey", { placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----", onChange: () => { clearTimeout(K._t); K._t = setTimeout(refresh, 400); } }),
        h("div", { style: "display:flex;gap:6px;margin-top:6px" }, loadFile), info),
      F.card(null, F.field("Passphrase", F.input(k, "passphrase", { type: "password", placeholder: "Passphrase", onChange: () => { clearTimeout(K._t); K._t = setTimeout(refresh, 400); } }))),
      F.card("Public key", pub, h("div", { style: "margin-top:6px" }, copyPub)),
      F.card("Certificate", F.textarea(k, "certificate", { placeholder: "ssh-ed25519-cert-v01@openssh.com AAAA...", rows: 3 }),
        h("div", { class: "hint", style: "margin-top:6px" }, "Saved with the key. Certificate login is not used yet by this version.")));
    showInfo();
    App.slider.open(isNew ? "New Key" : "Key Details", body, {
      menu: [{ name: "Remove", icon: "trash", danger: true, handler: () => K.removeKey(k) }],
      onClose: () => { if (!k.privateKey && !k.label) { App.data.keys = App.data.keys.filter((y) => y.id !== k.id); App.save(); } App.refreshSoft(); },
    });
    if (focusCert) setTimeout(() => body.querySelectorAll("textarea")[2]?.focus(), 220);
    App.refreshSoft();
  };

  K.generateForm = (onDone) => {
    const opts = { label: "", kind: "ed25519", passphrase: "" };
    const kinds = [
      { value: "ed25519", label: "ED25519" }, { value: "ecdsa-256", label: "ECDSA 256" }, { value: "ecdsa-384", label: "ECDSA 384" },
      { value: "ecdsa-521", label: "ECDSA 521" }, { value: "rsa-2048", label: "RSA 2048" }, { value: "rsa-4096", label: "RSA 4096" },
    ];
    const status = h("div", { class: "hint" });
    const go = h("button", { class: "btn primary big" }, "Generate & save");
    go.onclick = async () => {
      go.disabled = true; status.textContent = "Generating...";
      try {
        const r = await App.invoke("key_generate", { kind: opts.kind, passphrase: opts.passphrase, comment: opts.label || "shellbox" });
        const k = K.addKey({ label: opts.label || `Generated ${kinds.find((x) => x.value === opts.kind).label}`, privateKey: r.private_key,
          publicKey: r.public_key, fingerprint: r.fingerprint, keyType: r.key_type, passphrase: opts.passphrase });
        App.toast("Key generated");
        App.slider.close();
        App.refresh();
        if (onDone) onDone(k); else K.editKey(k);
      } catch (e) { status.textContent = "Failed: " + e; go.disabled = false; }
    };
    const plainForms = { input: (o, key, a) => { const i = h("input", Object.assign({ class: "input", value: o[key] }, a)); i.oninput = () => (o[key] = i.value); return i; } };
    const sel = h("select", { class: "select" }, ...kinds.map((x) => h("option", { value: x.value }, x.label)));
    sel.onchange = () => (opts.kind = sel.value);
    App.slider.open("Generate Key", h("div", {},
      F.card(null, F.field("Label", plainForms.input(opts, "label", { placeholder: "Label" })), F.field("Key type", sel),
        F.field("Passphrase", plainForms.input(opts, "passphrase", { type: "password", placeholder: "Optional" }))), status), { foot: go });
  };

  K.importFile = async (onDone) => {
    const f = await App.invoke("pick_files", { title: "Private key file", folder: false, multiple: false });
    if (!f[0]) return;
    let pem;
    try { pem = await App.invoke("read_text_file", { path: f[0] }); } catch (e) { App.toast(String(e), true); return; }
    let r = null;
    try { r = await App.invoke("key_inspect", { privateKey: pem, passphrase: "" }); } catch (e) { /* encrypted: passphrase asked in the panel */ }
    const k = K.addKey({ label: f[0].split(/[\\/]/).pop(), privateKey: pem, publicKey: r ? r.public_key : "", fingerprint: r ? r.fingerprint : "", keyType: r ? r.key_type : "" });
    App.toast("Key imported");
    App.refresh();
    if (onDone) onDone(k); else K.editKey(k);
  };

  // ---------- keys in this computer's ~/.ssh folder ----------
  // Like the original's "Import from SSH": every private key file in ~/.ssh is listed and can be added to
  // the keychain. A key already there (same fingerprint or same text) is reused, never copied twice.
  K.findSame = (item) => App.data.keys.find((k) => (item.fingerprint && k.fingerprint === item.fingerprint) || (k.privateKey || "").trim() === (item.private_key || "").trim());

  K.importLocal = (item) => K.findSame(item) || K.addKey({ label: item.name, privateKey: item.private_key, publicKey: item.public_key,
    fingerprint: item.fingerprint, keyType: item.key_type, sourcePath: item.path });

  K.localKeysDialog = async (onPick) => {
    let found;
    try { found = await App.invoke("local_ssh_keys"); } catch (e) { App.toast("Could not read the .ssh folder: " + e, true); return; }
    const home = await App.invoke("local_home").catch(() => "~");
    const where = home + (home.includes("\\") ? "\\.ssh" : "/.ssh");
    const chosen = new Set(found.filter((x) => !x.unsupported && !K.findSame(x)).map((x) => x.path));
    const list = h("div", { class: "local-keys" });
    if (!found.length) list.append(h("p", { class: "hint" }, "No private keys were found in " + where + "."));
    for (const x of found) {
      const have = K.findSame(x);
      const status = x.unsupported ? "Not supported" : have ? "In keychain" : x.encrypted ? "Needs passphrase" : "Ready";
      const box = h("input", { type: "checkbox", disabled: !!x.unsupported || !!have });
      box.checked = chosen.has(x.path);
      box.onchange = () => (box.checked ? chosen.add(x.path) : chosen.delete(x.path));
      const fp = x.fingerprint ? x.fingerprint.slice(0, 26) + "..." : "";
      const row = h("label", { class: "local-key" + (x.unsupported ? " off" : "") },
        onPick ? null : box,
        h("div", { class: "avatar", style: "background:#eca855", html: Icon("key", 16) }),
        h("div", { class: "info" },
          h("div", { class: "title" }, x.name),
          h("div", { class: "subtitle", title: x.path + (x.fingerprint ? "\n" + x.fingerprint : "") }, [x.key_type || "Key", fp].filter(Boolean).join("  "))),
        h("span", { class: "pill" + (have ? " ok" : x.unsupported ? " off" : x.encrypted ? " warn" : "") }, status));
      if (onPick && !x.unsupported) row.onclick = (e) => { e.preventDefault(); App.closeOverlay(); finish([x], onPick); };
      list.append(row);
    }
    App.dialog({
      title: "Keys on this computer",
      width: 520,
      body: h("div", {}, h("p", { class: "hint", style: "margin:0 0 10px" }, onPick
        ? "Choose a key from " + where + " to use with this host."
        : "Private keys found in " + where + ". Imported keys are copied into your keychain so any host can use them."), list),
      actions: onPick ? [{ name: "Cancel", kind: "ghost" }] : [
        { name: "Cancel", kind: "ghost" },
        { name: "Import selected", kind: "primary", handler: () => finish(found.filter((x) => chosen.has(x.path)), null) },
      ],
    });
  };

  const finish = (items, onPick) => {
    if (!items.length) return;
    const before = App.data.keys.length;
    const keys = items.map(K.importLocal);
    App.save();
    App.refresh();
    const added = App.data.keys.length - before;
    const locked = keys.filter((k) => !k.fingerprint || (items.find((x) => x.name === k.label) || {}).encrypted && !k.passphrase).length;
    App.toast(added ? `Imported ${added} key${added === 1 ? "" : "s"}` + (locked ? ". Open a locked key to type its passphrase." : "") : "Already in your keychain");
    if (onPick) onPick(keys[0]);
  };

  K.removeKey = async (k) => {
    if (!(await App.confirm("Remove key", `Remove "${k.label || "Key"}"? Hosts using it will lose it.`, "Remove"))) return;
    App.data.keys = App.data.keys.filter((y) => y.id !== k.id);
    for (const list of ["hosts", "groups", "identities"]) for (const x of App.data[list]) if (x.keyId === k.id) x.keyId = null;
    App.save(); App.slider.close(); App.refresh();
  };

  K.editIdentity = (i) => {
    const isNew = !i;
    if (isNew) { i = { id: App.uid(), label: "", username: "", password: "", keyId: null, createdAt: Date.now() }; App.data.identities.push(i); App.save(); }
    const body = h("div", {},
      F.card(null, F.field(null, F.input(i, "label", { placeholder: "Label", lead: "edit", onChange: App.refreshSoft }))),
      F.card("Credentials", F.credentials(i, { allowIdentity: false })));
    App.slider.open(isNew ? "New Identity" : "Identity Details", body, {
      menu: [{ name: "Remove", icon: "trash", danger: true, handler: () => K.removeIdentity(i) }],
      onClose: () => { if (!i.label && !i.username) { App.data.identities = App.data.identities.filter((y) => y.id !== i.id); App.save(); } App.refreshSoft(); },
    });
    App.refreshSoft();
  };

  K.removeIdentity = async (i) => {
    if (!(await App.confirm("Remove identity", `Remove "${i.label || i.username || "Identity"}"?`, "Remove"))) return;
    App.data.identities = App.data.identities.filter((y) => y.id !== i.id);
    for (const list of ["hosts", "groups"]) for (const x of App.data[list]) if (x.identityId === i.id) x.identityId = null;
    App.save(); App.slider.close(); App.refresh();
  };
})();
