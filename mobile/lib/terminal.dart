// Terminal sessions (kept open while you move around the app) and the terminal screen.
import 'dart:async';
import 'dart:convert';

import 'package:dartssh2/dartssh2.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:xterm/xterm.dart';

import 'ssh_service.dart';
import 'store.dart';
import 'themes.dart';
import 'ui.dart';

class Session extends ChangeNotifier {
  final String id = uid();
  String title;
  final Json host;
  late final Terminal terminal;
  Conn? conn;
  SSHSession? shell;
  String status = 'connecting';
  String? error;
  String? logId;
  String? startup;
  bool ctrl = false, alt = false;
  int? fontSize;
  String? themeName;
  StreamSubscription? _out, _err;

  Session(this.host, this.title) {
    terminal = Terminal(maxLines: (Store.I.settings['scrollback'] ?? 40000) as int);
    terminal.onOutput = _send;
    terminal.onResize = (w, h, pw, ph) => shell?.resizeTerminal(w, h, pw, ph);
  }

  void _send(String data) {
    if (shell == null) return;
    var d = data;
    if (ctrl && d.length == 1) {
      final c = d.toUpperCase().codeUnitAt(0);
      if (c >= 64 && c <= 95) d = String.fromCharCode(c - 64);
      ctrl = false;
      notifyListeners();
    }
    if (alt) {
      d = '\x1b$d';
      alt = false;
      notifyListeners();
    }
    shell!.write(Uint8List.fromList(utf8.encode(d)));
  }

  void sendText(String text, {bool run = false}) {
    var t = text.replaceAll('\r\n', '\r').replaceAll('\n', '\r');
    if (run && !t.endsWith('\r')) t += '\r';
    shell?.write(Uint8List.fromList(utf8.encode(t)));
  }

  Future<void> start(Asker ask) async {
    status = 'connecting';
    error = null;
    notifyListeners();
    final c = Store.I.resolveHost(host);
    try {
      conn = await connectHost(host, ask);
      final env = <String, String>{};
      for (final p in ((host['env'] as List?) ?? []).cast<Map>()) {
        if ((p['k'] ?? '').toString().isNotEmpty) env['${p['k']}'] = '${p['v'] ?? ''}';
      }
      shell = await conn!.client.shell(
        pty: SSHPtyConfig(type: (Store.I.settings['termType'] ?? 'xterm-256color') as String, width: terminal.viewWidth, height: terminal.viewHeight),
        environment: env.isEmpty ? null : env,
      );
      status = 'connected';
      logId = Store.I.addLog({'hostId': host['id'], 'label': title, 'address': host['address'], 'user': c['username'], 'kind': 'SSH', 'status': 'Connected'});
      var banner = '';
      _out = shell!.stdout.cast<List<int>>().transform(const Utf8Decoder(allowMalformed: true)).listen((text) {
        terminal.write(text);
        // Guess the operating system from the login banner (shown as the host's icon).
        final saved = Store.I.byId('hosts', host['id'] as String?);
        if (saved != null && saved['osManual'] != true && banner.length < 6000) {
          banner += text;
          final os = detectOs(banner);
          if (os != null && saved['os'] != os && (os != 'linux' || saved['os'] == null)) {
            saved['os'] = os;
            Store.I.save();
          }
        }
      });
      _err = shell!.stderr.cast<List<int>>().transform(const Utf8Decoder(allowMalformed: true)).listen(terminal.write);
      shell!.done.then((_) => _ended('Connection closed'));
      final snippet = Store.I.byId('snippets', host['startupSnippetId'] as String?);
      final script = startup ?? snippet?['script'] as String?;
      if (script != null && script.isNotEmpty) Future.delayed(const Duration(milliseconds: 600), () => sendText(script, run: true));
      notifyListeners();
    } on ConnectCancelled {
      status = 'closed';
      error = 'Cancelled';
      notifyListeners();
    } catch (e) {
      status = 'error';
      error = '$e';
      notifyListeners();
    }
  }

  void _ended(String reason) {
    if (status == 'closed') return;
    status = 'closed';
    error = reason;
    Store.I.finishLog(logId, reason);
    terminal.write('\r\n\x1b[90m$reason.\x1b[0m\r\n');
    notifyListeners();
  }

  void close() {
    _out?.cancel();
    _err?.cancel();
    shell?.close();
    conn?.close();
    _ended('Closed');
  }
}

class Sessions extends ChangeNotifier {
  static final Sessions I = Sessions._();
  Sessions._();
  final List<Session> list = [];

  Session open(BuildContext context, Json host, {String? startup}) {
    final s = Session(host, Store.I.hostLabel(host))..startup = startup;
    list.add(s);
    notifyListeners();
    s.start(askerFor(context));
    if (Store.I.byId('hosts', host['id'] as String?) != null) {
      host['lastUsed'] = DateTime.now().millisecondsSinceEpoch;
      Store.I.save();
    }
    return s;
  }

  void remove(Session s) {
    s.close();
    list.remove(s);
    notifyListeners();
  }
}

TerminalTheme termTheme(TermTheme t) {
  Color c(int v) => Color(v);
  final p = t.palette;
  return TerminalTheme(
    cursor: c(t.cursor), selection: c(t.sel), foreground: c(t.fg), background: c(t.bg),
    black: c(p[0]), red: c(p[1]), green: c(p[2]), yellow: c(p[3]), blue: c(p[4]), magenta: c(p[5]), cyan: c(p[6]), white: c(p[7]),
    brightBlack: c(p[8]), brightRed: c(p[9]), brightGreen: c(p[10]), brightYellow: c(p[11]), brightBlue: c(p[12]),
    brightMagenta: c(p[13]), brightCyan: c(p[14]), brightWhite: c(p[15]),
    searchHitBackground: const Color(0xFFFFFF2B), searchHitBackgroundCurrent: const Color(0xFF31FF26), searchHitForeground: const Color(0xFF000000),
  );
}

TermTheme themeNamed(String? name) {
  final n = (name ?? '').toLowerCase();
  return kThemes.firstWhere((t) => t.name.toLowerCase() == n, orElse: () => kThemes.first);
}

/// Opens a connection to a host and shows its terminal.
void connectAndShow(BuildContext context, Json host, {String? startup}) {
  final s = Sessions.I.open(context, host, startup: startup);
  Navigator.push(context, MaterialPageRoute(builder: (_) => TerminalScreen(session: s)));
}

class TerminalScreen extends StatefulWidget {
  final Session session;
  const TerminalScreen({super.key, required this.session});
  @override
  State<TerminalScreen> createState() => _TerminalScreenState();
}

class _TerminalScreenState extends State<TerminalScreen> {
  final controller = TerminalController();
  Session get s => widget.session;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: s,
      builder: (context, _) {
        final theme = themeNamed(s.themeName ?? s.host['theme'] as String? ?? Store.I.settings['theme'] as String?);
        final size = (s.fontSize ?? Store.I.settings['fontSize'] ?? 14) as int;
        return Scaffold(
          backgroundColor: Color(theme.bg),
          appBar: AppBar(
            title: Row(children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: s.status == 'connected' ? C.green : s.status == 'connecting' ? C.orange : C.g6)),
              const SizedBox(width: 8),
              Expanded(child: Text(s.title, overflow: TextOverflow.ellipsis)),
            ]),
            actions: [
              IconButton(tooltip: 'Snippets', icon: const Icon(Icons.code), onPressed: () => _snippets(context)),
              PopupMenuButton<String>(
                onSelected: (v) => _menu(context, v),
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'paste', child: Text('Paste')),
                  PopupMenuItem(value: 'bigger', child: Text('Increase text size')),
                  PopupMenuItem(value: 'smaller', child: Text('Decrease text size')),
                  PopupMenuItem(value: 'theme', child: Text('Terminal theme')),
                  PopupMenuItem(value: 'reconnect', child: Text('Reconnect')),
                  PopupMenuItem(value: 'close', child: Text('Close session')),
                ],
              ),
            ],
          ),
          body: SafeArea(
            child: Column(children: [
              Expanded(
                child: Stack(children: [
                  TerminalView(
                    s.terminal,
                    controller: controller,
                    theme: termTheme(theme),
                    textStyle: TerminalStyle(fontSize: size.toDouble()),
                    autofocus: true,
                    padding: const EdgeInsets.all(6),
                  ),
                  if (s.status != 'connected') _statusOverlay(context, theme),
                ]),
              ),
              _extraKeys(),
            ]),
          ),
        );
      },
    );
  }

  Widget _statusOverlay(BuildContext context, TermTheme theme) {
    final connecting = s.status == 'connecting';
    final c = Store.I.resolveHost(s.host);
    return Container(
      color: Color(theme.bg),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        avatar(os: s.host['os'] as String?, size: 64),
        const SizedBox(height: 14),
        Text(connecting ? s.title : (s.status == 'error' ? 'Connection failed' : 'Disconnected'),
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Color(theme.fg))),
        const SizedBox(height: 6),
        Text('${c['username']}${(c['username'] as String).isEmpty ? '' : '@'}${s.host['address']}', style: const TextStyle(color: C.g7)),
        const SizedBox(height: 14),
        if (connecting) const SizedBox(width: 240, child: LinearProgressIndicator(color: C.green, backgroundColor: C.g5)),
        if (!connecting && s.error != null)
          Padding(padding: const EdgeInsets.only(top: 6), child: SelectableText(s.error!, textAlign: TextAlign.center, style: const TextStyle(color: C.red, fontFamily: 'monospace', fontSize: 12))),
        const SizedBox(height: 16),
        Row(mainAxisSize: MainAxisSize.min, children: [
          TextButton(onPressed: () { Sessions.I.remove(s); Navigator.pop(context); }, child: const Text('Close')),
          if (!connecting) ...[
            const SizedBox(width: 8),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: C.green), onPressed: () => s.start(askerFor(context)), child: const Text('Retry')),
          ],
        ]),
      ]),
    );
  }

  Widget _key(String label, VoidCallback onTap, {bool on = false}) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Material(
          color: on ? C.blue : C.g4,
          borderRadius: BorderRadius.circular(6),
          child: InkWell(
            borderRadius: BorderRadius.circular(6),
            onTap: () { HapticFeedback.selectionClick(); onTap(); },
            child: Container(
              constraints: const BoxConstraints(minWidth: 40),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
              alignment: Alignment.center,
              child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ),
        ),
      );

  /// Keys a phone keyboard lacks: Esc, Tab, Ctrl, Alt, arrows and symbols.
  Widget _extraKeys() {
    void key(TerminalKey k) => s.terminal.keyInput(k);
    return Container(
      color: C.g1,
      height: 48,
      child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6), children: [
        _key('Esc', () => s.sendText('\x1b')),
        _key('Tab', () => s.sendText('\t')),
        _key('Ctrl', () { s.ctrl = !s.ctrl; setState(() {}); }, on: s.ctrl),
        _key('Alt', () { s.alt = !s.alt; setState(() {}); }, on: s.alt),
        _key('←', () => key(TerminalKey.arrowLeft)),
        _key('↑', () => key(TerminalKey.arrowUp)),
        _key('↓', () => key(TerminalKey.arrowDown)),
        _key('→', () => key(TerminalKey.arrowRight)),
        for (final c in ['|', '/', '-', '~', '_', ':', '\$', '*']) _key(c, () => s.sendText(c)),
        _key('Home', () => key(TerminalKey.home)),
        _key('End', () => key(TerminalKey.end)),
        _key('PgUp', () => key(TerminalKey.pageUp)),
        _key('PgDn', () => key(TerminalKey.pageDown)),
      ]),
    );
  }

  Future<void> _menu(BuildContext context, String v) async {
    final base = (s.fontSize ?? Store.I.settings['fontSize'] ?? 14) as int;
    switch (v) {
      case 'paste':
        final d = await Clipboard.getData('text/plain');
        if (d?.text != null) s.terminal.paste(d!.text!);
      case 'bigger':
        s.fontSize = (base + 1).clamp(4, 40);
        setState(() {});
      case 'smaller':
        s.fontSize = (base - 1).clamp(4, 40);
        setState(() {});
      case 'theme':
        if (!context.mounted) return;
        final picked = await showModalBottomSheet<String>(
          context: context,
          backgroundColor: C.g2,
          builder: (c) => ListView(children: [
            for (final t in kThemes)
              ListTile(
                leading: Container(width: 28, height: 28, decoration: BoxDecoration(color: Color(t.bg), borderRadius: BorderRadius.circular(5), border: Border.all(color: Color(t.fg)))),
                title: Text(t.name),
                onTap: () => Navigator.pop(c, t.name),
              ),
          ]),
        );
        if (picked != null) { s.themeName = picked; setState(() {}); }
      case 'reconnect':
        s.close();
        if (context.mounted) s.start(askerFor(context));
      case 'close':
        Sessions.I.remove(s);
        if (context.mounted) Navigator.pop(context);
    }
  }

  void _snippets(BuildContext context) {
    final list = Store.I.list('snippets');
    showModalBottomSheet(
      context: context,
      backgroundColor: C.g2,
      builder: (c) => list.isEmpty
          ? const Padding(padding: EdgeInsets.all(24), child: Text('No snippets yet. Add them in the Snippets screen.'))
          : ListView(children: [
              for (final sn in list)
                ListTile(
                  title: Text((sn['label'] ?? 'Snippet') as String),
                  subtitle: Text(((sn['script'] ?? '') as String).split('\n').first, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
                  trailing: TextButton(onPressed: () { s.sendText((sn['script'] ?? '') as String, run: true); Navigator.pop(c); }, child: const Text('Run')),
                  onTap: () { s.sendText((sn['script'] ?? '') as String); Navigator.pop(c); },
                ),
            ]),
    );
  }
}
