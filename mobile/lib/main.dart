// Shellbox for phones: the same screens as the desktop app, in the same order.
import 'package:flutter/material.dart';

import 'hosts.dart';
import 'screens.dart';
import 'sftp.dart';
import 'store.dart';
import 'terminal.dart';
import 'ui.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Store.I.load();
  runApp(const ShellboxApp());
}

class ShellboxApp extends StatelessWidget {
  const ShellboxApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(title: 'Shellbox', debugShowCheckedModeBanner: false, theme: appTheme(), home: const Home());
}

/// Side menu order read from the original: Hosts, Keychain, Port Forwarding, Snippets, Known Hosts, Logs.
const _pages = [
  ('Hosts', Icons.dns_outlined),
  ('Keychain', Icons.vpn_key_outlined),
  ('Port Forwarding', Icons.swap_horiz),
  ('Snippets', Icons.code),
  ('Known Hosts', Icons.verified_user_outlined),
  ('Logs', Icons.history),
];

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  int page = 0;

  Widget _body() => switch (page) {
        0 => const HostsScreen(),
        1 => const KeychainScreen(),
        2 => const ForwardingScreen(),
        3 => const SnippetsScreen(),
        4 => const KnownHostsScreen(),
        _ => const LogsScreen(),
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_pages[page].$1),
        actions: [
          IconButton(tooltip: 'SFTP', icon: const Icon(Icons.folder_open_outlined), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SftpScreen()))),
          ListenableBuilder(
            listenable: Sessions.I,
            builder: (context, _) => IconButton(
              tooltip: 'Open sessions',
              onPressed: () => showModalBottomSheet(context: context, backgroundColor: C.g2, builder: (_) => const SessionsSheet()),
              icon: Badge(isLabelVisible: Sessions.I.list.isNotEmpty, label: Text('${Sessions.I.list.length}'), backgroundColor: C.green, child: const Icon(Icons.terminal)),
            ),
          ),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: Column(children: [
            Expanded(child: ListView(padding: EdgeInsets.zero, children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 18, 20, 8),
              child: Row(children: [Icon(Icons.shield_outlined, color: C.green), SizedBox(width: 10), Text('Vaults', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700))]),
            ),
            for (var i = 0; i < _pages.length; i++)
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
                child: Material(
                  color: page == i ? C.g5 : Colors.transparent,
                  borderRadius: BorderRadius.circular(6),
                  child: ListTile(
                    dense: true,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    leading: Icon(_pages[i].$2, color: C.ink, size: 20),
                    title: Text(_pages[i].$1, style: const TextStyle(fontSize: 14)),
                    onTap: () { setState(() => page = i); Navigator.pop(context); },
                  ),
                ),
              ),
            const Divider(height: 28),
            ListTile(leading: const Icon(Icons.folder_open_outlined), title: const Text('SFTP'), onTap: () { Navigator.pop(context); Navigator.push(context, MaterialPageRoute(builder: (_) => const SftpScreen())); }),
            ListTile(leading: const Icon(Icons.settings_outlined), title: const Text('Settings'), onTap: () { Navigator.pop(context); Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen())); }),
            ])),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(children: [
                Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: C.green, borderRadius: BorderRadius.circular(6)), child: const Text('Free', style: TextStyle(fontWeight: FontWeight.w600))),
                const SizedBox(width: 10),
                const Expanded(child: Text('All features unlocked. Your data stays on this phone.', style: TextStyle(color: C.g7, fontSize: 11))),
              ]),
            ),
          ]),
        ),
      ),
      body: _body(),
    );
  }
}
