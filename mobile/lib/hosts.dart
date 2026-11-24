// Hosts screen, host and group edit pages.
import 'package:flutter/material.dart';

import 'sftp.dart';
import 'store.dart';
import 'terminal.dart';
import 'ui.dart';
import 'usage.dart';

class HostsScreen extends StatefulWidget {
  const HostsScreen({super.key});
  @override
  State<HostsScreen> createState() => _HostsScreenState();
}

class _HostsScreenState extends State<HostsScreen> with WidgetsBindingObserver {
  String query = '';
  String? groupId;
  final search = TextEditingController();

  // Host usage refreshes only while this screen shows and the app is in front.
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    HostUsage.I.start();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      HostUsage.I.start();
    } else {
      HostUsage.I.stop();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    HostUsage.I.stop();
    super.dispose();
  }

  Store get st => Store.I;

  void _quick() {
    final p = parseSsh(query);
    if (p == null) return;
    connectAndShow(context, {'id': 'quick-${uid()}', 'label': '${p['username'] == '' ? '' : '${p['username']}@'}${p['address']}', ...p, 'quick': true});
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: st,
      builder: (context, _) {
        final q = query.trim().toLowerCase().replaceFirst(RegExp(r'^ssh\s+'), '');
        final hosts = st.sorted(
          q.isNotEmpty
              ? st.list('hosts').where((h) => [h['label'], h['address'], st.resolveHost(h)['username'], ...((h['tags'] as List?) ?? [])].any((v) => '${v ?? ''}'.toLowerCase().contains(q))).toList()
              : st.list('hosts').where((h) => h['groupId'] == groupId).toList(),
          st.hostLabel,
        );
        final groups = st.sorted(
          q.isNotEmpty ? st.list('groups').where((g) => '${g['label']}'.toLowerCase().contains(q)).toList() : st.list('groups').where((g) => g['parentId'] == groupId).toList(),
          (g) => '${g['label'] ?? ''}',
        );
        final empty = st.list('hosts').isEmpty && st.list('groups').isEmpty && q.isEmpty;
        return Scaffold(
          floatingActionButton: FloatingActionButton(
            onPressed: () => showModalBottomSheet(
              context: context,
              backgroundColor: C.g2,
              builder: (c) => SafeArea(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  ListTile(leading: const Icon(Icons.dns_outlined), title: const Text('New Host'), onTap: () { Navigator.pop(c); openHostEditor(context, null, groupId: groupId); }),
                  ListTile(leading: const Icon(Icons.folder_outlined), title: const Text('New Group'), onTap: () { Navigator.pop(c); openGroupEditor(context, null, parentId: groupId); }),
                ]),
              ),
            ),
            child: const Icon(Icons.add),
          ),
          body: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: search,
                    autocorrect: false,
                    decoration: const InputDecoration(hintText: 'Find a host or ssh user@hostname...', prefixIcon: Icon(Icons.search, size: 20)),
                    onChanged: (v) => setState(() => query = v),
                    onSubmitted: (_) => hosts.length == 1 && !query.contains('@') ? connectAndShow(context, hosts.first) : _quick(),
                  ),
                ),
                if (parseSsh(query) != null) ...[
                  const SizedBox(width: 8),
                  FilledButton(style: FilledButton.styleFrom(backgroundColor: C.green), onPressed: _quick, child: const Text('CONNECT')),
                ],
              ]),
            ),
            Expanded(
              child: empty
                  ? _emptyState(context)
                  : ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 90), children: [
                      if (groupId != null && q.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
                            TextButton(onPressed: () => setState(() => groupId = null), child: const Text('All hosts')),
                            for (final g in st.groupPath(groupId)) ...[
                              const Icon(Icons.chevron_right, size: 16, color: C.g7),
                              TextButton(onPressed: () => setState(() => groupId = g['id'] as String), child: Text('${g['label'] ?? 'Group'}')),
                            ],
                          ]),
                        ),
                      if (groups.isNotEmpty) sectionTitle('Groups'),
                      for (final g in groups)
                        card(
                          leading: avatar(icon: Icons.folder_outlined, color: C.blueberry),
                          title: '${g['label'] ?? 'Group'}',
                          subtitle: '${st.list('hosts').where((h) => h['groupId'] == g['id']).length} hosts',
                          onTap: () => setState(() { groupId = g['id'] as String; query = ''; search.clear(); }),
                          onLongPress: () => openGroupEditor(context, g),
                          trailing: IconButton(icon: const Icon(Icons.edit_outlined, size: 18, color: C.g7), onPressed: () => openGroupEditor(context, g)),
                        ),
                      sectionTitle('Hosts', hosts.length),
                      if (hosts.isEmpty) Text(q.isNotEmpty ? 'No hosts match. Tap CONNECT to connect directly.' : 'No hosts in this group yet.', style: const TextStyle(color: C.g7)),
                      for (final h in hosts)
                        card(
                          leading: avatar(os: h['os'] as String?),
                          title: st.hostLabel(h),
                          subtitle: 'ssh${(st.resolveHost(h)['username'] as String).isEmpty ? '' : ', ${st.resolveHost(h)['username']}'}',
                          below: UsageLine(h['id'] as String),
                          onTap: () => connectAndShow(context, h),
                          onLongPress: () => _hostMenu(context, h),
                          trailing: IconButton(icon: const Icon(Icons.edit_outlined, size: 18, color: C.g7), onPressed: () => openHostEditor(context, h)),
                        ),
                    ]),
            ),
          ]),
        );
      },
    );
  }

  Widget _emptyState(BuildContext context) {
    final c = TextEditingController();
    void create() {
      final p = parseSsh(c.text);
      if (p == null) return;
      openHostEditor(context, null, initial: p);
    }

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 110, height: 84, decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), gradient: const LinearGradient(colors: [C.g4, C.g5])), child: const Icon(Icons.dns_outlined, size: 44, color: C.g7)),
          const SizedBox(height: 16),
          const Text('Create host', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          const Text('Save a server to connect with one tap. Type its IP address or name to start.', textAlign: TextAlign.center, style: TextStyle(color: C.g7)),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: TextField(controller: c, decoration: const InputDecoration(hintText: 'Type IP or Hostname'), onSubmitted: (_) => create())),
            const SizedBox(width: 8),
            FilledButton(onPressed: create, child: const Text('Continue')),
          ]),
        ]),
      ),
    );
  }

  void _hostMenu(BuildContext context, Json h) {
    showModalBottomSheet(
      context: context,
      backgroundColor: C.g2,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.terminal), title: const Text('Connect'), onTap: () { Navigator.pop(c); connectAndShow(context, h); }),
          ListTile(leading: const Icon(Icons.folder_open_outlined), title: const Text('Open in SFTP'), onTap: () { Navigator.pop(c); Navigator.push(context, MaterialPageRoute(builder: (_) => SftpScreen(host: h))); }),
          ListTile(leading: const Icon(Icons.edit_outlined), title: const Text('Edit'), onTap: () { Navigator.pop(c); openHostEditor(context, h); }),
          ListTile(
            leading: const Icon(Icons.copy),
            title: const Text('Duplicate'),
            onTap: () {
              Navigator.pop(c);
              final copy = Map<String, dynamic>.from(h)..['id'] = uid()..['label'] = '${st.hostLabel(h)} copy'..['createdAt'] = DateTime.now().millisecondsSinceEpoch;
              st.list('hosts').add(copy);
              st.save();
            },
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline, color: C.red),
            title: const Text('Remove', style: TextStyle(color: C.red)),
            onTap: () async {
              Navigator.pop(c);
              if (await confirm(context, 'Remove host', 'Remove "${st.hostLabel(h)}"?', ok: 'Remove')) st.remove('hosts', h['id'] as String);
            },
          ),
        ]),
      ),
    );
  }
}

void openHostEditor(BuildContext context, Json? host, {String? groupId, Json? initial}) {
  final st = Store.I;
  final isNew = host == null;
  final h = host ??
      {
        'id': uid(), 'label': '', 'address': '', 'port': 22, 'groupId': groupId, 'tags': <dynamic>[], 'username': '', 'password': '',
        'keyId': null, 'identityId': null, 'chain': <dynamic>[], 'env': <dynamic>[], 'startupSnippetId': null, 'createdAt': DateTime.now().millisecondsSinceEpoch,
        ...?initial,
      };
  if (isNew) {
    st.list('hosts').add(h);
    st.save();
  }
  Navigator.push(context, MaterialPageRoute(builder: (_) => HostEditor(host: h, isNew: isNew)));
}

class HostEditor extends StatefulWidget {
  final Json host;
  final bool isNew;
  const HostEditor({super.key, required this.host, required this.isNew});
  @override
  State<HostEditor> createState() => _HostEditorState();
}

class _HostEditorState extends State<HostEditor> {
  Json get h => widget.host;
  Store get st => Store.I;

  @override
  void dispose() {
    if ('${h['address'] ?? ''}'.isEmpty && '${h['label'] ?? ''}'.isEmpty) st.remove('hosts', h['id'] as String);
    super.dispose();
  }

  Widget _dropdown(String field, List<DropdownMenuItem<String?>> items, String hint) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: DropdownButtonFormField<String?>(
          initialValue: items.any((i) => i.value == h[field]) ? h[field] as String? : null,
          items: [DropdownMenuItem(value: null, child: Text(hint)), ...items],
          dropdownColor: C.g3,
          decoration: const InputDecoration(),
          onChanged: (v) => setState(() { h[field] = v; st.save(); }),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final tags = ((h['tags'] as List?) ?? []).cast<dynamic>();
    final List chain = (h['chain'] as List?) ?? (h['chain'] = <dynamic>[]);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isNew ? 'New Host' : 'Host Details'),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: () async {
              if (await confirm(context, 'Remove host', 'Remove "${st.hostLabel(h)}"?', ok: 'Remove')) {
                st.remove('hosts', h['id'] as String);
                if (context.mounted) Navigator.pop(context);
              }
            },
          ),
        ],
      ),
      body: ListView(padding: const EdgeInsets.all(14), children: [
        formCard('Address', [BoundField(h, 'address', 'IP or Hostname', icon: Icons.public)]),
        formCard('General', [
          BoundField(h, 'label', 'Label', icon: Icons.edit_outlined),
          _dropdown('groupId', [for (final g in st.list('groups')) DropdownMenuItem(value: g['id'] as String, child: Text('${g['label'] ?? 'Group'}'))], 'No group'),
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: DropdownButtonFormField<String?>(
              initialValue: kOsNames.containsKey(h['os']) ? h['os'] as String? : null,
              dropdownColor: C.g3,
              decoration: const InputDecoration(labelText: 'Icon'),
              items: [
                const DropdownMenuItem(value: null, child: Text('Detect automatically')),
                for (final e in (kOsNames.entries.toList()..sort((a, b) => a.value.compareTo(b.value))))
                  DropdownMenuItem(value: e.key, child: Row(children: [avatar(os: e.key, size: 22), const SizedBox(width: 10), Text(e.value)])),
              ],
              onChanged: (v) => setState(() { h['os'] = v; h['osManual'] = v != null; st.save(); }),
            ),
          ),
          Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            for (final t in tags) Chip(label: Text('$t'), onDeleted: () => setState(() { tags.remove(t); h['tags'] = tags; st.save(); })),
            ActionChip(label: const Text('+ Tag'), onPressed: () async {
              final v = await promptText(context, 'Add tag', 'Tag');
              if (v != null && v.trim().isNotEmpty) setState(() { tags.add(v.trim()); h['tags'] = tags; st.save(); });
            }),
          ]),
        ]),
        formCard(null, [
          Row(children: [
            const Text('SSH on ', style: TextStyle(fontWeight: FontWeight.w600)),
            SizedBox(width: 80, child: BoundField(h, 'port', '22', number: true)),
            const Text(' port', style: TextStyle(fontWeight: FontWeight.w600)),
          ]),
          if (st.list('identities').isNotEmpty)
            _dropdown('identityId', [for (final i in st.list('identities')) DropdownMenuItem(value: i['id'] as String, child: Text('${i['label'] ?? i['username'] ?? 'Identity'}'))], 'No identity'),
          BoundField(h, 'username', 'Username', icon: Icons.person_outline),
          BoundField(h, 'password', 'Password', icon: Icons.lock_outline, password: true),
          _dropdown('keyId', [for (final k in st.list('keys')) DropdownMenuItem(value: k['id'] as String, child: Text('${k['label'] ?? 'Key'}'))], 'No key'),
        ]),
        formCard('Host Chaining', [
          const Text('Connect through other hosts first (jump hosts).', style: TextStyle(color: C.g7, fontSize: 12)),
          const SizedBox(height: 8),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final id in chain.toList())
              Chip(avatar: const Icon(Icons.link, size: 16), label: Text(st.byId('hosts', id as String) == null ? 'Missing host' : st.hostLabel(st.byId('hosts', id)!)), onDeleted: () => setState(() { chain.remove(id); st.save(); })),
            ActionChip(label: Text(chain.isEmpty ? '+ Add host chain' : '+ Add hop'), onPressed: () async {
              final pick = await showModalBottomSheet<String>(context: context, backgroundColor: C.g2, builder: (c) => ListView(children: [
                    for (final o in st.list('hosts').where((x) => x['id'] != h['id'])) ListTile(title: Text(st.hostLabel(o)), onTap: () => Navigator.pop(c, o['id'] as String)),
                  ]));
              if (pick != null) setState(() { chain.add(pick); st.save(); });
            }),
          ]),
        ]),
        formCard(null, [
          _dropdown('startupSnippetId', [for (final s in st.list('snippets')) DropdownMenuItem(value: s['id'] as String, child: Text('${s['label'] ?? 'Snippet'}'))], 'No startup snippet'),
        ]),
        const SizedBox(height: 4),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: C.green, minimumSize: const Size.fromHeight(46)),
          onPressed: () {
            if ('${h['address'] ?? ''}'.isEmpty) { toast(context, 'Type an address first', error: true); return; }
            connectAndShow(context, h);
          },
          child: const Text('CONNECT'),
        ),
      ]),
    );
  }
}

void openGroupEditor(BuildContext context, Json? group, {String? parentId}) {
  final st = Store.I;
  final isNew = group == null;
  final g = group ?? {'id': uid(), 'label': '', 'parentId': parentId, 'username': '', 'password': '', 'createdAt': DateTime.now().millisecondsSinceEpoch};
  if (isNew) { st.list('groups').add(g); st.save(); }
  Navigator.push(context, MaterialPageRoute(builder: (_) => Scaffold(
        appBar: AppBar(title: Text(isNew ? 'New Group' : 'Group Details'), actions: [
          IconButton(icon: const Icon(Icons.delete_outline), onPressed: () async {
            if (await confirm(context, 'Remove group', 'Remove "${g['label'] ?? 'Group'}"? Its hosts move to the parent group.', ok: 'Remove')) {
              for (final h in st.list('hosts')) { if (h['groupId'] == g['id']) h['groupId'] = g['parentId']; }
              for (final x in st.list('groups')) { if (x['parentId'] == g['id']) x['parentId'] = g['parentId']; }
              st.remove('groups', g['id'] as String);
              if (context.mounted) Navigator.pop(context);
            }
          }),
        ]),
        body: PopScope(
          onPopInvokedWithResult: (_, _) { if ('${g['label'] ?? ''}'.isEmpty) st.remove('groups', g['id'] as String); },
          child: ListView(padding: const EdgeInsets.all(14), children: [
            formCard('General', [BoundField(g, 'label', 'Label', icon: Icons.edit_outlined)]),
            formCard('SSH defaults for hosts in this group', [
              const Text('Hosts in this group use these when their own fields are empty.', style: TextStyle(color: C.g7, fontSize: 12)),
              const SizedBox(height: 10),
              BoundField(g, 'username', 'Username', icon: Icons.person_outline),
              BoundField(g, 'password', 'Password', icon: Icons.lock_outline, password: true),
            ]),
          ]),
        ),
      )));
}
