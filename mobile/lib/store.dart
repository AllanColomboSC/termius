// Saved data. Same JSON shape as the desktop app, so a backup moves between them.
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

String uid() =>
    DateTime.now().millisecondsSinceEpoch.toRadixString(36) + Random().nextInt(1 << 30).toRadixString(36);

typedef Json = Map<String, dynamic>;

/// Defaults read from the original: text size 14 (4..40), scrollback 40000,
/// theme "default dark", keepalive 0 (off), terminal type xterm-256color.
Json defaultSettings() => {
      'fontSize': 14,
      'fontFamily': 'Source Code Pro',
      'theme': 'default dark',
      'copyOnSelect': false,
      'rightClickPaste': false,
      'bell': false,
      'brightBold': true,
      'keepalive': 0,
      'scrollback': 40000,
      'termType': 'xterm-256color',
      'autoReconnect': false,
      'logsEnabled': true,
      'hostUsage': true,
      'layout': 'grid',
      'sort': 'az',
      'uiTheme': 'dark',
    };

class Store extends ChangeNotifier {
  static final Store I = Store._();
  Store._();

  Json data = _empty();

  static Json _empty() => {
        'version': 1,
        'groups': <dynamic>[],
        'hosts': <dynamic>[],
        'keys': <dynamic>[],
        'identities': <dynamic>[],
        'snippets': <dynamic>[],
        'packages': <dynamic>[],
        'rules': <dynamic>[],
        'knownHosts': <dynamic>[],
        'logs': <dynamic>[],
        'settings': defaultSettings(),
      };

  List<Json> list(String name) => (data[name] as List).cast<Json>();
  Json get settings => data['settings'] as Json;

  Json? byId(String name, String? id) {
    if (id == null) return null;
    for (final x in list(name)) {
      if (x['id'] == id) return x;
    }
    return null;
  }

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString('vault');
    if (raw != null && raw.isNotEmpty) importJson(raw, notify: false);
  }

  void importJson(String raw, {bool notify = true}) {
    final d = _empty();
    try {
      final parsed = jsonDecode(raw) as Json;
      d.addAll(parsed);
    } catch (_) {}
    for (final k in ['groups', 'hosts', 'keys', 'identities', 'snippets', 'packages', 'rules', 'knownHosts', 'logs']) {
      d[k] = ((d[k] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }
    d['settings'] = {...defaultSettings(), ...((d['settings'] as Map?)?.cast<String, dynamic>() ?? {})};
    data = d;
    if (notify) save();
  }

  String exportJson() => const JsonEncoder.withIndent('  ').convert(data);

  Future<void> save() async {
    notifyListeners();
    final p = await SharedPreferences.getInstance();
    await p.setString('vault', jsonEncode(data));
  }

  void remove(String name, String id) {
    list(name).removeWhere((x) => x['id'] == id);
    save();
  }

  String hostLabel(Json h) {
    final l = (h['label'] ?? '') as String;
    return l.isNotEmpty ? l : ((h['address'] ?? 'Host') as String);
  }

  List<Json> groupPath(String? groupId) {
    final out = <Json>[];
    var g = byId('groups', groupId);
    var guard = 0;
    while (g != null && guard++ < 20) {
      out.insert(0, g);
      g = byId('groups', g['parentId'] as String?);
    }
    return out;
  }

  /// Credentials of a host, filling blanks from its identity and parent groups.
  Json resolveHost(Json h) {
    final r = <String, dynamic>{'username': '', 'password': '', 'keyId': null};
    for (final l in [...groupPath(h['groupId'] as String?), h]) {
      final ident = byId('identities', l['identityId'] as String?);
      String? pick(String k) {
        final v = l[k] ?? ident?[k];
        return (v is String && v.isNotEmpty) ? v : null;
      }

      r['username'] = pick('username') ?? r['username'];
      r['password'] = pick('password') ?? r['password'];
      r['keyId'] = pick('keyId') ?? r['keyId'];
    }
    r['port'] = (h['port'] is int && h['port'] > 0) ? h['port'] : int.tryParse('${h['port']}') ?? 22;
    return r;
  }

  List<String> trustedFor(String host, int port) => list('knownHosts')
      .where((k) => k['host'] == host && (k['port'] ?? 22) == port)
      .map((k) => k['fingerprint'] as String)
      .toList();

  void addKnownHost(String host, int port, String fp, String type) {
    list('knownHosts').removeWhere((k) => k['host'] == host && (k['port'] ?? 22) == port);
    list('knownHosts').add({'id': uid(), 'host': host, 'port': port, 'fingerprint': fp, 'keyType': type, 'added': DateTime.now().millisecondsSinceEpoch});
    save();
  }

  String? addLog(Json entry) {
    if (settings['logsEnabled'] != true) return null;
    final e = {'id': uid(), 'start': DateTime.now().millisecondsSinceEpoch, 'end': null, ...entry};
    list('logs').insert(0, e);
    if (list('logs').length > 1000) list('logs').removeRange(1000, list('logs').length);
    save();
    return e['id'] as String;
  }

  void finishLog(String? id, String status) {
    if (id == null) return;
    final e = byId('logs', id);
    if (e == null) return;
    e['end'] = DateTime.now().millisecondsSinceEpoch;
    e['status'] = status;
    save();
  }

  List<Json> sorted(List<Json> items, String Function(Json) label) {
    final s = settings['sort'];
    final a = [...items];
    int created(Json x) => (x['createdAt'] ?? 0) as int;
    if (s == 'za') {
      a.sort((x, y) => label(y).toLowerCase().compareTo(label(x).toLowerCase()));
    } else if (s == 'newest') {
      a.sort((x, y) => created(y).compareTo(created(x)));
    } else if (s == 'oldest') {
      a.sort((x, y) => created(x).compareTo(created(y)));
    } else {
      a.sort((x, y) => label(x).toLowerCase().compareTo(label(y).toLowerCase()));
    }
    return a;
  }
}

/// "ssh user@host -p 2222", "user@host:2222" or "host".
Json? parseSsh(String text) {
  var t = text.trim();
  if (t.isEmpty) return null;
  t = t.replaceFirst(RegExp(r'^ssh\s+'), '');
  var port = 22;
  final pm = RegExp(r'\s-p\s*(\d+)').firstMatch(t);
  if (pm != null) {
    port = int.parse(pm.group(1)!);
    t = t.replaceFirst(pm.group(0)!, '');
  }
  t = t.trim().split(RegExp(r'\s+')).first;
  var user = '';
  final at = t.lastIndexOf('@');
  if (at >= 0) {
    user = t.substring(0, at);
    t = t.substring(at + 1);
  }
  final cm = RegExp(r'^([^:\[\]]+):(\d+)$').firstMatch(t);
  if (cm != null) {
    t = cm.group(1)!;
    port = int.parse(cm.group(2)!);
  }
  if (t.isEmpty) return null;
  return {'username': user, 'address': t, 'port': port};
}
