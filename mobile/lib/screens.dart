// Keychain, Port Forwarding, Snippets, Known Hosts, Logs, Settings and open terminals.
import 'dart:convert';
import 'dart:typed_data';

import 'package:dartssh2/dartssh2.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'ssh_service.dart';
import 'store.dart';
import 'terminal.dart';
import 'themes.dart';
import 'ui.dart';

Store get st => Store.I;

Widget emptyView(IconData icon, String title, String text, [Widget? action]) => Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 110, height: 84, decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), gradient: const LinearGradient(colors: [C.g4, C.g5])), child: Icon(icon, size: 44, color: C.g7)),
          const SizedBox(height: 16),
          Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(text, textAlign: TextAlign.center, style: const TextStyle(color: C.g7)),
          if (action != null) Padding(padding: const EdgeInsets.only(top: 16), child: action),
        ]),
      ),
    );

Widget simpleEditor(BuildContext context, String title, List<Widget> body, {VoidCallback? onDelete, Widget? bottom, VoidCallback? onLeave}) => Scaffold(
      appBar: AppBar(title: Text(title), actions: [
        if (onDelete != null) IconButton(icon: const Icon(Icons.delete_outline), onPressed: onDelete),
      ]),
      body: PopScope(
        onPopInvokedWithResult: (_, _) => onLeave?.call(),
        child: ListView(padding: const EdgeInsets.all(14), children: [...body, if (bottom != null) bottom]),
      ),
    );

// ---------- Keychain ----------
class KeychainScreen extends StatelessWidget {
  const KeychainScreen({super.key});

  Future<void> _importKey(BuildContext context) async {
    final f = await FilePicker.pickFile(dialogTitle: 'Private key file');
    if (f == null) return;
    final text = utf8.decode(await f.readAsBytes(), allowMalformed: true);
    final k = {'id': uid(), 'label': f.name, 'privateKey': text, 'publicKey': '', 'passphrase': '', 'keyType': _keyType(text, ''), 'createdAt': DateTime.now().millisecondsSinceEpoch};
    st.list('keys').add(k);
    st.save();
    if (context.mounted) _editKey(context, k);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: st,
      builder: (context, _) {
        final keys = st.sorted(st.list('keys'), (k) => '${k['label'] ?? ''}');
        final ids = st.sorted(st.list('identities'), (i) => '${i['label'] ?? i['username'] ?? ''}');
        return Scaffold(
          floatingActionButton: FloatingActionButton(
            onPressed: () => showModalBottomSheet(context: context, backgroundColor: C.g2, builder: (c) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  ListTile(leading: const Icon(Icons.vpn_key_outlined), title: const Text('Paste key'), onTap: () {
                    Navigator.pop(c);
                    final k = {'id': uid(), 'label': '', 'privateKey': '', 'passphrase': '', 'createdAt': DateTime.now().millisecondsSinceEpoch};
                    st.list('keys').add(k); st.save(); _editKey(context, k);
                  }),
                  ListTile(leading: const Icon(Icons.file_open_outlined), title: const Text('Import key file'), onTap: () { Navigator.pop(c); _importKey(context); }),
                  ListTile(leading: const Icon(Icons.person_outline), title: const Text('New Identity'), onTap: () {
                    Navigator.pop(c);
                    final i = {'id': uid(), 'label': '', 'username': '', 'password': '', 'keyId': null, 'createdAt': DateTime.now().millisecondsSinceEpoch};
                    st.list('identities').add(i); st.save(); _editIdentity(context, i);
                  }),
                ]))),
            child: const Icon(Icons.add),
          ),
          body: keys.isEmpty && ids.isEmpty
              ? emptyView(Icons.vpn_key_outlined, 'Your keychain is empty', 'Keys and identities saved here can be attached to any host. Generate keys in the desktop app and bring them over with a backup, or import a key file.')
              : ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 90), children: [
                  sectionTitle('Keys', keys.length),
                  for (final k in keys)
                    card(leading: avatar(icon: Icons.vpn_key_outlined, color: C.orange), title: '${k['label'] ?? 'Key'}', subtitle: '${k['keyType'] ?? ''}', onTap: () => _editKey(context, k)),
                  if (ids.isNotEmpty) sectionTitle('Identities', ids.length),
                  for (final i in ids)
                    card(leading: avatar(icon: Icons.person_outline, color: C.blue), title: '${i['label'] ?? i['username'] ?? 'Identity'}', subtitle: '${i['username'] ?? ''}', onTap: () => _editIdentity(context, i)),
                ]),
        );
      },
    );
  }
}

String _keyType(String pem, String pass) {
  try {
    final pairs = SSHKeyPair.fromPem(pem, pass.isEmpty ? null : pass);
    return pairs.isEmpty ? '' : pairs.first.type;
  } catch (_) {
    return pem.trim().isEmpty ? '' : 'Could not read (passphrase?)';
  }
}

void _editKey(BuildContext context, Json k) {
  Navigator.push(context, MaterialPageRoute(builder: (_) => StatefulBuilder(builder: (context, set) => simpleEditor(context, 'Key Details', [
        formCard(null, [BoundField(k, 'label', 'Label', icon: Icons.edit_outlined)]),
        formCard('Private key', [
          BoundField(k, 'privateKey', '-----BEGIN OPENSSH PRIVATE KEY-----', maxLines: 8, onChanged: (_) => set(() { k['keyType'] = _keyType('${k['privateKey']}', '${k['passphrase'] ?? ''}'); st.save(); })),
          Text('${k['keyType'] ?? ''}', style: const TextStyle(color: C.g7, fontSize: 12)),
        ]),
        formCard(null, [BoundField(k, 'passphrase', 'Passphrase', password: true, onChanged: (_) => set(() { k['keyType'] = _keyType('${k['privateKey']}', '${k['passphrase'] ?? ''}'); st.save(); }))]),
      ], onDelete: () async {
        if (await confirm(context, 'Remove key', 'Remove "${k['label'] ?? 'Key'}"?', ok: 'Remove')) {
          for (final l in ['hosts', 'groups', 'identities']) { for (final x in st.list(l)) { if (x['keyId'] == k['id']) x['keyId'] = null; } }
          st.remove('keys', k['id'] as String);
          if (context.mounted) Navigator.pop(context);
        }
      }, onLeave: () { if ('${k['privateKey'] ?? ''}'.isEmpty && '${k['label'] ?? ''}'.isEmpty) st.remove('keys', k['id'] as String); }))));
}

void _editIdentity(BuildContext context, Json i) {
  Navigator.push(context, MaterialPageRoute(builder: (_) => StatefulBuilder(builder: (context, set) => simpleEditor(context, 'Identity Details', [
        formCard(null, [BoundField(i, 'label', 'Label', icon: Icons.edit_outlined)]),
        formCard('Credentials', [
          BoundField(i, 'username', 'Username', icon: Icons.person_outline),
          BoundField(i, 'password', 'Password', icon: Icons.lock_outline, password: true),
          DropdownButtonFormField<String?>(
            initialValue: st.byId('keys', i['keyId'] as String?) == null ? null : i['keyId'] as String?,
            dropdownColor: C.g3,
            items: [const DropdownMenuItem(value: null, child: Text('No key')), for (final k in st.list('keys')) DropdownMenuItem(value: k['id'] as String, child: Text('${k['label'] ?? 'Key'}'))],
            onChanged: (v) => set(() { i['keyId'] = v; st.save(); }),
          ),
        ]),
      ], onDelete: () async {
        if (await confirm(context, 'Remove identity', 'Remove "${i['label'] ?? i['username'] ?? 'Identity'}"?', ok: 'Remove')) {
          st.remove('identities', i['id'] as String);
          if (context.mounted) Navigator.pop(context);
        }
      }, onLeave: () { if ('${i['label'] ?? ''}'.isEmpty && '${i['username'] ?? ''}'.isEmpty) st.remove('identities', i['id'] as String); }))));
}

// ---------- Port Forwarding ----------
final Map<String, Forward> runningForwards = {};

class ForwardingScreen extends StatefulWidget {
  const ForwardingScreen({super.key});
  @override
  State<ForwardingScreen> createState() => _ForwardingScreenState();
}

class _ForwardingScreenState extends State<ForwardingScreen> {
  String _describe(Json r) {
    final h = st.byId('hosts', r['hostId'] as String?);
    final hl = h == null ? 'no host' : st.hostLabel(h);
    switch (r['kind']) {
      case 'dynamic':
        return 'SOCKS on ${r['bindAddress'] ?? '127.0.0.1'}:${r['bindPort'] ?? '?'} through $hl';
      case 'remote':
        return '$hl:${r['bindPort'] ?? '?'} → ${r['destHost'] ?? '127.0.0.1'}:${r['destPort'] ?? '?'}';
      default:
        return '${r['bindAddress'] ?? '127.0.0.1'}:${r['bindPort'] ?? '?'} → ${r['destHost'] ?? '?'}:${r['destPort'] ?? '?'} via $hl';
    }
  }

  Future<void> _toggle(Json r) async {
    final id = r['id'] as String;
    if (runningForwards.containsKey(id)) {
      runningForwards.remove(id)!.stop();
      setState(() {});
      return;
    }
    final host = st.byId('hosts', r['hostId'] as String?);
    if (host == null) { toast(context, 'Choose a host for this rule first', error: true); return; }
    try {
      runningForwards[id] = await startForward(r, host, askerFor(context));
      st.addLog({'hostId': host['id'], 'label': '${r['label'] ?? 'Port forwarding'}', 'address': host['address'], 'kind': 'Port forwarding', 'status': 'Started'});
    } catch (e) {
      if (mounted) toast(context, 'Port forwarding failed: $e', error: true);
    }
    if (mounted) setState(() {});
  }

  void _edit(Json r) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => StatefulBuilder(builder: (context, set) => simpleEditor(context, 'Port Forwarding Rule', [
          formCard(null, [
            DropdownButtonFormField<String>(
              initialValue: (r['kind'] ?? 'local') as String,
              dropdownColor: C.g3,
              decoration: const InputDecoration(labelText: 'Type'),
              items: const [DropdownMenuItem(value: 'local', child: Text('Local')), DropdownMenuItem(value: 'remote', child: Text('Remote')), DropdownMenuItem(value: 'dynamic', child: Text('Dynamic'))],
              onChanged: (v) => set(() { r['kind'] = v; st.save(); }),
            ),
            const SizedBox(height: 10),
            BoundField(r, 'label', 'Label', icon: Icons.edit_outlined),
          ]),
          formCard(r['kind'] == 'remote' ? 'Server (where the port opens)' : 'Host to tunnel through', [
            DropdownButtonFormField<String?>(
              initialValue: st.byId('hosts', r['hostId'] as String?) == null ? null : r['hostId'] as String?,
              dropdownColor: C.g3,
              items: [const DropdownMenuItem(value: null, child: Text('Select a host')), for (final h in st.list('hosts')) DropdownMenuItem(value: h['id'] as String, child: Text(st.hostLabel(h)))],
              onChanged: (v) => set(() { r['hostId'] = v; st.save(); }),
            ),
          ]),
          formCard(r['kind'] == 'remote' ? 'Port on the server' : 'Port on this phone', [
            BoundField(r, 'bindAddress', r['kind'] == 'remote' ? '0.0.0.0' : '127.0.0.1'),
            BoundField(r, 'bindPort', 'Port', number: true),
          ]),
          if (r['kind'] != 'dynamic')
            formCard(r['kind'] == 'remote' ? 'Send connections to (from this phone)' : 'Destination (seen from the server)', [
              BoundField(r, 'destHost', 'Host'),
              BoundField(r, 'destPort', 'Port', number: true),
            ]),
        ], onDelete: () async {
          if (await confirm(context, 'Remove rule', 'Remove "${r['label'] ?? 'rule'}"?', ok: 'Remove')) {
            runningForwards.remove(r['id'])?.stop();
            st.remove('rules', r['id'] as String);
            if (context.mounted) Navigator.pop(context);
          }
        })))).then((_) => setState(() {}));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: st,
      builder: (context, _) {
        final rules = st.sorted(st.list('rules'), (r) => '${r['label'] ?? ''}');
        return Scaffold(
          floatingActionButton: FloatingActionButton(onPressed: () {
            final r = {'id': uid(), 'label': '', 'kind': 'local', 'hostId': null, 'bindAddress': '127.0.0.1', 'bindPort': '', 'destHost': '', 'destPort': '', 'createdAt': DateTime.now().millisecondsSinceEpoch};
            st.list('rules').add(r); st.save(); _edit(r);
          }, child: const Icon(Icons.add)),
          body: rules.isEmpty
              ? emptyView(Icons.swap_horiz, 'Set up port forwarding', 'Reach a service on a server as if it ran on this phone, share a service with a server, or browse through a server.')
              : ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 90), children: [
                  sectionTitle('Port Forwarding', rules.length),
                  for (final r in rules)
                    card(
                      leading: avatar(icon: Icons.swap_horiz, color: runningForwards.containsKey(r['id']) ? C.green : C.g6),
                      title: '${(r['label'] ?? '').toString().isEmpty ? '${r['kind']} rule' : r['label']}',
                      subtitle: _describe(r),
                      onTap: () => _edit(r),
                      trailing: Switch(value: runningForwards.containsKey(r['id']), onChanged: (_) => _toggle(r)),
                    ),
                ]),
        );
      },
    );
  }
}

// ---------- Snippets ----------
class SnippetsScreen extends StatelessWidget {
  const SnippetsScreen({super.key});

  void _edit(BuildContext context, Json s) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => simpleEditor(context, 'Snippet Details', [
          formCard(null, [BoundField(s, 'label', 'Example: check network load', icon: Icons.edit_outlined)]),
          formCard('Script', [BoundField(s, 'script', 'ifconfig', maxLines: 8)]),
        ], bottom: FilledButton(style: FilledButton.styleFrom(backgroundColor: C.green, minimumSize: const Size.fromHeight(46)), onPressed: () => _run(context, s), child: const Text('RUN')),
        onDelete: () async {
          if (await confirm(context, 'Remove snippet', 'Remove "${s['label'] ?? 'Snippet'}"?', ok: 'Remove')) {
            st.remove('snippets', s['id'] as String);
            if (context.mounted) Navigator.pop(context);
          }
        }, onLeave: () { if ('${s['label'] ?? ''}'.isEmpty && '${s['script'] ?? ''}'.isEmpty) st.remove('snippets', s['id'] as String); })));
  }

  void _run(BuildContext context, Json s) {
    showModalBottomSheet(context: context, backgroundColor: C.g2, builder: (c) => ListView(children: [
          const Padding(padding: EdgeInsets.all(14), child: Text('Run on', style: TextStyle(fontWeight: FontWeight.w600))),
          for (final ses in Sessions.I.list.where((x) => x.status == 'connected'))
            ListTile(leading: const Icon(Icons.terminal), title: Text(ses.title), subtitle: const Text('Open session'), onTap: () {
              Navigator.pop(c);
              ses.sendText('${s['script'] ?? ''}', run: true);
              Navigator.push(context, MaterialPageRoute(builder: (_) => TerminalScreen(session: ses)));
            }),
          for (final h in st.sorted(st.list('hosts'), st.hostLabel))
            ListTile(leading: avatar(os: h['os'] as String?, size: 28), title: Text(st.hostLabel(h)), subtitle: const Text('New session'), onTap: () {
              Navigator.pop(c);
              connectAndShow(context, h, startup: '${s['script'] ?? ''}');
            }),
        ]));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: st,
      builder: (context, _) {
        final list = st.sorted(st.list('snippets'), (s) => '${s['label'] ?? ''}');
        return Scaffold(
          floatingActionButton: FloatingActionButton(onPressed: () {
            final s = {'id': uid(), 'label': '', 'script': '', 'packageId': null, 'createdAt': DateTime.now().millisecondsSinceEpoch};
            st.list('snippets').add(s); st.save(); _edit(context, s);
          }, child: const Icon(Icons.add)),
          body: list.isEmpty
              ? emptyView(Icons.code, 'Save commands you use often', 'Run a snippet in an open session, or on a host in a new session.')
              : ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 90), children: [
                  sectionTitle('Snippets', list.length),
                  for (final s in list)
                    card(
                      leading: avatar(icon: Icons.code, color: const Color(0xFF08639F)),
                      title: '${s['label'] ?? 'Snippet'}',
                      subtitle: '${s['script'] ?? ''}'.split('\n').first,
                      onTap: () => _edit(context, s),
                      trailing: IconButton(icon: const Icon(Icons.play_arrow, color: C.green), onPressed: () => _run(context, s)),
                    ),
                ]),
        );
      },
    );
  }
}

// ---------- Known Hosts ----------
class KnownHostsScreen extends StatelessWidget {
  const KnownHostsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: st,
      builder: (context, _) {
        final list = [...st.list('knownHosts')]..sort((a, b) => '${a['host']}'.compareTo('${b['host']}'));
        if (list.isEmpty) {
          return emptyView(Icons.verified_user_outlined, 'No known hosts yet', 'When you connect to a server for the first time and trust its key, it is remembered here.');
        }
        return ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 30), children: [
          sectionTitle('Known Hosts', list.length),
          for (final k in list)
            card(
              leading: avatar(icon: Icons.verified_user_outlined, color: const Color(0xFF198C51), size: 34),
              title: '${k['host']}${(k['port'] ?? 22) != 22 ? ':${k['port']}' : ''}',
              subtitle: '${k['keyType'] ?? ''}  ${k['fingerprint'] ?? ''}',
              trailing: IconButton(icon: const Icon(Icons.delete_outline, color: C.g7), onPressed: () async {
                if (await confirm(context, 'Remove known host', 'Forget the key of ${k['host']}?', ok: 'Remove')) st.remove('knownHosts', k['id'] as String);
              }),
            ),
        ]);
      },
    );
  }
}

// ---------- Logs ----------
class LogsScreen extends StatelessWidget {
  const LogsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: st,
      builder: (context, _) {
        final list = st.list('logs');
        if (list.isEmpty) return emptyView(Icons.history, 'No logs yet', 'Each connection you open is listed here.');
        return ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 30), children: [
          Row(children: [
            Expanded(child: sectionTitle('Logs', list.length)),
            TextButton(onPressed: () async {
              if (await confirm(context, 'Delete existing logs', 'Delete the whole connection history?')) { list.clear(); st.save(); }
            }, child: const Text('Clear')),
          ]),
          for (final e in list.take(300))
            card(
              leading: avatar(os: st.byId('hosts', e['hostId'] as String?)?['os'] as String?, size: 34),
              title: '${e['label'] ?? e['address'] ?? ''}',
              subtitle: [e['kind'], e['user'] != null && '${e['user']}'.isNotEmpty ? '${e['user']}@${e['address']}' : e['address'], _date(e['start'] as int?), e['status']].where((x) => x != null && '$x'.isNotEmpty).join(' · '),
              onTap: () {
                final h = st.byId('hosts', e['hostId'] as String?);
                if (h != null) connectAndShow(context, h);
              },
            ),
        ]);
      },
    );
  }
}

String _date(int? ms) {
  if (ms == null) return '';
  final d = DateTime.fromMillisecondsSinceEpoch(ms);
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)}/${d.year} ${two(d.hour)}:${two(d.minute)}';
}

// ---------- Settings ----------
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Json get s => st.settings;
  void _set(String k, dynamic v) => setState(() { s[k] = v; st.save(); });

  Widget _group(List<Widget> rows) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        decoration: BoxDecoration(color: C.g3, borderRadius: BorderRadius.circular(10)),
        child: Column(children: rows),
      );

  @override
  Widget build(BuildContext context) {
    final size = (s['fontSize'] ?? 14) as int;
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(padding: const EdgeInsets.all(14), children: [
        sectionTitle('Account'),
        _group([
          const ListTile(title: Text('Local account'), subtitle: Text('Free, no sign-in. Everything stays on this phone.')),
          ListTile(title: const Text('Export everything'), subtitle: const Text('A backup file the desktop app can import too'), trailing: const Icon(Icons.upload_file), onTap: () async {
            final bytes = Uint8List.fromList(utf8.encode(st.exportJson()));
            final r = await FilePicker.saveFile(fileName: 'shellbox-backup.json', bytes: bytes, mimeType: 'application/json');
            if (context.mounted && r != null) toast(context, 'Exported');
          }),
          ListTile(title: const Text('Import a backup'), subtitle: const Text('Replaces what is saved now'), trailing: const Icon(Icons.download), onTap: () async {
            final f = await FilePicker.pickFile(dialogTitle: 'Backup file');
            if (f == null) return;
            final raw = utf8.decode(await f.readAsBytes(), allowMalformed: true);
            try {
              final parsed = jsonDecode(raw) as Map;
              if (parsed['hosts'] is! List) throw 'not a backup file';
              st.importJson(raw);
              if (context.mounted) toast(context, 'Imported');
            } catch (e) {
              if (context.mounted) toast(context, 'Import failed: $e', error: true);
            }
          }),
        ]),
        sectionTitle('Terminal'),
        _group([
          ListTile(
            title: const Text('Text Size'),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              IconButton(onPressed: size <= 4 ? null : () => _set('fontSize', size - 1), icon: const Icon(Icons.remove)),
              Text('$size', style: const TextStyle(fontSize: 16)),
              IconButton(onPressed: size >= 40 ? null : () => _set('fontSize', size + 1), icon: const Icon(Icons.add)),
            ]),
          ),
          ListTile(
            title: const Text('Terminal theme'),
            subtitle: Text(themeNamed(s['theme'] as String?).name),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              final picked = await showModalBottomSheet<String>(context: context, backgroundColor: C.g2, builder: (c) => ListView(children: [
                    for (final t in kThemes)
                      ListTile(
                        leading: Container(width: 28, height: 28, decoration: BoxDecoration(color: Color(t.bg), borderRadius: BorderRadius.circular(5), border: Border.all(color: Color(t.fg)))),
                        title: Text(t.name),
                        trailing: t.name.toLowerCase() == s['theme'] ? const Icon(Icons.check, color: C.blue) : null,
                        onTap: () => Navigator.pop(c, t.name.toLowerCase()),
                      ),
                  ]));
              if (picked != null) _set('theme', picked);
            },
          ),
          SwitchListTile(title: const Text('Autoreconnect'), value: s['autoReconnect'] == true, onChanged: (v) => _set('autoReconnect', v)),
          SwitchListTile(title: const Text('Bell sound'), value: s['bell'] == true, onChanged: (v) => _set('bell', v)),
          SwitchListTile(
            title: const Text('Show host usage on host cards'),
            subtitle: const Text('CPU, memory and battery of hosts whose saved login works, every 10 seconds (Linux hosts).'),
            value: s['hostUsage'] != false,
            onChanged: (v) => _set('hostUsage', v),
          ),
          ListTile(
            title: const Text('Keepalive Interval'),
            subtitle: const Text('How often (in seconds) to send SSH-level keepalive packets to the server. Set to 0 to disable.'),
            trailing: Text('${s['keepalive'] ?? 0}s'),
            onTap: () async {
              final v = await promptText(context, 'Keepalive Interval', 'Seconds', '${s['keepalive'] ?? 0}');
              if (v != null) _set('keepalive', (int.tryParse(v) ?? 0).clamp(0, 2147483647));
            },
          ),
          ListTile(
            title: const Text('Scrollback'),
            subtitle: const Text('Limit number of terminal rows. Set to 0 to maximum limit size.'),
            trailing: Text('${s['scrollback'] ?? 40000}'),
            onTap: () async {
              final v = await promptText(context, 'Scrollback', 'Number of rows', '${s['scrollback'] ?? 40000}');
              if (v == null) return;
              final n = (int.tryParse(v) ?? 0).abs();
              _set('scrollback', n == 0 || n > 40000 ? 40000 : n);
            },
          ),
          ListTile(
            title: const Text('Terminal emulation type'),
            trailing: DropdownButton<String>(
              value: (s['termType'] ?? 'xterm-256color') as String,
              dropdownColor: C.g3,
              underline: const SizedBox(),
              items: const ['xterm-256color', 'xterm', 'linux', 'vt100'].map((v) => DropdownMenuItem(value: v, child: Text(v))).toList(),
              onChanged: (v) => _set('termType', v),
            ),
          ),
        ]),
        sectionTitle('Logs'),
        _group([
          SwitchListTile(title: const Text('Keep connection logs'), value: s['logsEnabled'] != false, onChanged: (v) => _set('logsEnabled', v)),
        ]),
      ]),
    );
  }
}

// ---------- open terminals ----------
class SessionsSheet extends StatelessWidget {
  const SessionsSheet({super.key});
  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Sessions.I,
      builder: (context, _) {
        final list = Sessions.I.list;
        return SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Padding(padding: EdgeInsets.all(14), child: Text('Open sessions', style: TextStyle(fontWeight: FontWeight.w600))),
            if (list.isEmpty) const Padding(padding: EdgeInsets.fromLTRB(14, 0, 14, 24), child: Text('No sessions open. Tap a host to connect.', style: TextStyle(color: C.g7))),
            for (final s in list)
              ListTile(
                leading: Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, color: s.status == 'connected' ? C.green : s.status == 'connecting' ? C.orange : C.g6)),
                title: Text(s.title),
                subtitle: Text(s.status),
                trailing: IconButton(icon: const Icon(Icons.close), onPressed: () => Sessions.I.remove(s)),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(context, MaterialPageRoute(builder: (_) => TerminalScreen(session: s)));
                },
              ),
          ]),
        );
      },
    );
  }
}
