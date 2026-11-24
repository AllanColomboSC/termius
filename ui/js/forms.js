// Form helpers used by the edit panels. Every change is saved straight away, like the original.
(function () {
  const F = (App.forms = {});

  F.input = (obj, key, { placeholder = "", type = "text", lead, onChange, cls = "" } = {}) => {
    const inp = h("input", { class: "input " + cls, type, placeholder, value: obj[key] ?? "" });
    inp.oninput = () => {
      obj[key] = type === "number" ? (inp.value === "" ? "" : Number(inp.value)) : inp.value;
      App.save();
      onChange && onChange(obj[key]);
    };
    if (!lead) return inp;
    return h("div", { class: "with-icon" }, h("span", { class: "lead", html: Icon(lead, 14) }), inp);
  };

  F.textarea = (obj, key, { placeholder = "", onChange, rows } = {}) => {
    const t = h("textarea", { class: "textarea", placeholder, spellcheck: "false" });
    t.value = obj[key] ?? "";
    if (rows) t.style.height = rows * 18 + 16 + "px";
    t.oninput = () => { obj[key] = t.value; App.save(); onChange && onChange(t.value); };
    return t;
  };

  F.field = (label, control) => h("div", { class: "field" }, label ? h("label", {}, label) : null, control);

  F.select = (obj, key, options, { onChange, placeholder } = {}) => {
    const sel = h("select", { class: "select" });
    if (placeholder != null) sel.append(h("option", { value: "" }, placeholder));
    for (const o of options) {
      const opt = h("option", { value: o.value }, o.label);
      if (String(obj[key] ?? "") === String(o.value)) opt.selected = true;
      sel.append(opt);
    }
    sel.onchange = () => { obj[key] = sel.value || null; App.save(); onChange && onChange(obj[key]); };
    return sel;
  };

  F.toggle = (obj, key, { onChange } = {}) => {
    const b = h("button", { class: "toggle" + (obj[key] ? " on" : ""), type: "button" });
    b.onclick = () => { obj[key] = !obj[key]; b.classList.toggle("on", !!obj[key]); App.save(); onChange && onChange(obj[key]); };
    return b;
  };

  F.row = (label, control, desc) =>
    h("div", { class: "row-between" }, h("div", {}, h("div", {}, label), desc ? h("div", { class: "hint" }, desc) : null), control);

  F.card = (title, ...kids) => h("div", { class: "form-card" }, title ? h("h4", {}, title) : null, ...kids);

  F.groupOptions = (excludeId) => {
    const out = [];
    const walk = (parent, depth) => {
      for (const g of App.sortItems(App.data.groups.filter((g) => (g.parentId || null) === parent), (x) => x.label || "")) {
        if (g.id === excludeId) continue;
        out.push({ value: g.id, label: " ".repeat(depth) + (g.label || "Group") });
        walk(g.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  };

  F.keyOptions = () => App.data.keys.map((k) => ({ value: k.id, label: k.label || "Key" }));
  F.identityOptions = () => App.data.identities.map((i) => ({ value: i.id, label: i.label || i.username || "Identity" }));
  F.hostOptions = (excludeId) =>
    App.sortItems(App.data.hosts.filter((x) => x.id !== excludeId), App.hostLabel).map((x) => ({ value: x.id, label: App.hostLabel(x) }));

  // Tag editor: chips plus an input; Enter adds a tag.
  F.tags = (obj, key = "tags") => {
    if (!Array.isArray(obj[key])) obj[key] = [];
    const wrap = h("div", { class: "chips" });
    const draw = () => {
      wrap.innerHTML = "";
      for (const t of obj[key]) {
        const x = h("button", { html: Icon("close", 10) });
        x.onclick = () => { obj[key] = obj[key].filter((y) => y !== t); App.save(); draw(); };
        wrap.append(h("span", { class: "chip" }, t, x));
      }
      const inp = h("input", { class: "input", placeholder: "Tags", style: "width:120px;height:26px" });
      inp.onkeydown = (e) => {
        if ((e.key === "Enter" || e.key === ",") && inp.value.trim()) {
          e.preventDefault();
          if (!obj[key].includes(inp.value.trim())) obj[key].push(inp.value.trim());
          App.save(); draw();
          wrap.querySelector("input").focus();
        }
      };
      wrap.append(inp);
    };
    draw();
    return wrap;
  };

  // Credentials block shared by hosts, groups and identities.
  F.credentials = (obj, { allowIdentity = true } = {}) => {
    const box = h("div", {});
    const draw = () => {
      box.innerHTML = "";
      if (allowIdentity && App.data.identities.length) {
        box.append(F.field("Identity", F.select(obj, "identityId", F.identityOptions(), { placeholder: "None", onChange: draw })));
      }
      box.append(F.field(null, F.input(obj, "username", { placeholder: "Username", lead: "user" })));
      box.append(F.field(null, F.input(obj, "password", { placeholder: "Password", type: "password", lead: "lock" })));
      const keyRow = h("div", { class: "chips", style: "margin-top:4px" });
      if (obj.keyId && App.byId("keys", obj.keyId)) {
        const k = App.byId("keys", obj.keyId);
        const x = h("button", { html: Icon("close", 10), title: "Remove key" });
        x.onclick = () => { obj.keyId = null; App.save(); draw(); };
        keyRow.append(h("span", { class: "chip" }, App.icon("key", 12), k.label || "Key", x));
      } else {
        const add = (label, icon, fn) => {
          const b = h("button", { class: "btn ghost lower", type: "button" }, App.icon(icon, 14), label);
          b.onclick = fn;
          keyRow.append(b);
        };
        add("Key", "key", (e) => {
          const items = App.data.keys.map((k) => ({ name: k.label || "Key", icon: "key", handler: () => { obj.keyId = k.id; App.save(); draw(); } }));
          items.push("-", { name: "Generate key", icon: "plus", handler: () => App.keychain.generateForm((k) => { obj.keyId = k.id; App.save(); draw(); }) });
          items.push({ name: "Import key file", icon: "import", handler: () => App.keychain.importFile((k) => { obj.keyId = k.id; App.save(); draw(); }) });
          items.push({ name: "From this computer (.ssh)", icon: "import", handler: () => App.keychain.localKeysDialog((k) => { obj.keyId = k.id; App.save(); draw(); }) });
          App.menu(e, items);
        });
        add("Certificate", "cert", () => App.toast("Certificates are added inside a key: open the key in Keychain and paste its certificate."));
        add("FIDO2", "fido", () => App.toast("Hardware security keys are not supported in this version.", true));
      }
      box.append(keyRow);
    };
    draw();
    return box;
  };
})();
