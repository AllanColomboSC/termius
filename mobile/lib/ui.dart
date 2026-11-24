// Colours, shared widgets and the questions asked while connecting.
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'os_icons.dart';
import 'ssh_service.dart';
import 'store.dart';

/// Light interface palette matched to reference/picture-1.png.
class C {
  static const g1 = Color(0xFFE6EBED);
  static const g2 = Color(0xFFEDF1F2);
  static const g3 = Color(0xFFFFFFFF);
  static const g4 = Color(0xFFD5DDE0);
  static const g5 = Color(0xFFE6EBED);
  static const g6 = Color(0xFFA4B3BA);
  static const g7 = Color(0xFF798C94);
  static const ink = Color(0xFF141729);
  static const top = Color(0xFF282B3D);
  static const blue = Color(0xFF2091F6);
  static const green = Color(0xFF21B568);
  static const red = Color(0xFFF25E61);
  static const blueberry = Color(0xFF6666D2);
  static const orange = Color(0xFFECA855);
}

ThemeData appTheme() {
  final base = ThemeData.light(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: C.g2,
    colorScheme: base.colorScheme.copyWith(primary: C.blue, secondary: C.green, surface: C.g3, onSurface: C.ink, surfaceTint: Colors.transparent, error: C.red),
    appBarTheme: const AppBarTheme(backgroundColor: C.top, foregroundColor: Colors.white, surfaceTintColor: Colors.transparent, elevation: 0, centerTitle: false),
    drawerTheme: const DrawerThemeData(backgroundColor: Color(0xFFF7F9FA)),
    cardTheme: const CardThemeData(color: C.g3, elevation: 0, margin: EdgeInsets.zero),
    dividerColor: C.g4,
    floatingActionButtonTheme: const FloatingActionButtonThemeData(backgroundColor: C.blue, foregroundColor: Colors.white),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: C.g1,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      hintStyle: const TextStyle(color: C.g7),
      labelStyle: const TextStyle(color: C.g7),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: C.g5)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: C.g5)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: C.blue)),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.all(Colors.white),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? C.green : C.g6),
    ),
  );
}

const kOsNames = {
  'ubuntu': 'Ubuntu', 'debian': 'Debian', 'centos': 'CentOS', 'fedora': 'Fedora', 'redhat': 'Red Hat', 'arch': 'Arch Linux',
  'alpine': 'Alpine', 'raspbian': 'Raspberry Pi OS', 'freebsd': 'FreeBSD', 'openbsd': 'OpenBSD', 'macos': 'macOS', 'opensuse': 'openSUSE',
  'suse': 'SUSE', 'linux': 'Linux', 'kali': 'Kali', 'mint': 'Linux Mint', 'rocky': 'Rocky Linux', 'alma': 'AlmaLinux', 'gentoo': 'Gentoo',
  'manjaro': 'Manjaro', 'nixos': 'NixOS', 'elementary': 'elementary OS', 'popos': 'Pop!_OS', 'android': 'Android', 'synology': 'Synology',
  'proxmox': 'Proxmox', 'truenas': 'TrueNAS', 'docker': 'Docker', 'windows': 'Windows',
};

/// Operating system logos (Simple Icons, CC0) on their brand colour.
Widget avatar({String? os, IconData? icon, Color? color, double size = 40}) {
  final logo = icon == null ? kOsIcons[(os ?? '').toLowerCase()] : null;
  var bg = color ?? (logo != null ? Color(logo.$2) : C.g6);
  if (bg.computeLuminance() < 0.02) bg = C.g5;
  final fg = bg.computeLuminance() > 0.45 ? C.ink : Colors.white;
  final hex = '#${(fg.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';
  return Container(
    width: size,
    height: size,
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(size * 0.15)),
    alignment: Alignment.center,
    child: logo != null
        ? SvgPicture.string('<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="$hex" d="${logo.$1}"/></svg>', width: size * 0.55, height: size * 0.55)
        : Icon(icon ?? Icons.dns_outlined, color: Colors.white, size: size * 0.5),
  );
}

/// Guesses the operating system from a login banner.
String? detectOs(String text) {
  const words = [
    ['ubuntu', 'ubuntu'], ['debian', 'debian'], ['centos', 'centos'], ['fedora', 'fedora'], ['red hat', 'redhat'], ['raspbian', 'raspbian'],
    ['raspberry', 'raspbian'], ['alpine', 'alpine'], ['arch linux', 'arch'], ['freebsd', 'freebsd'], ['openbsd', 'openbsd'], ['opensuse', 'opensuse'],
    ['rocky linux', 'rocky'], ['almalinux', 'alma'], ['gentoo', 'gentoo'], ['manjaro', 'manjaro'], ['nixos', 'nixos'], ['pop!_os', 'popos'],
    ['elementary os', 'elementary'], ['proxmox', 'proxmox'], ['synology', 'synology'], ['truenas', 'truenas'], ['kali', 'kali'],
    ['linux mint', 'mint'], ['darwin', 'macos'], ['microsoft windows', 'windows'],
  ];
  final t = text.toLowerCase();
  for (final w in words) {
    if (t.contains(w[0])) return w[1];
  }
  return t.contains('linux') ? 'linux' : null;
}

Widget card({required Widget leading, required String title, String? subtitle, Widget? below, Widget? trailing, VoidCallback? onTap, VoidCallback? onLongPress}) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Material(
      color: C.g3,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(children: [
            leading,
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                if (subtitle != null && subtitle.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: C.g7, fontSize: 12)),
                  ),
                if (below != null) below,
              ]),
            ),
            if (trailing != null) trailing,
          ]),
        ),
      ),
    ),
  );
}

Widget sectionTitle(String t, [int? count]) => Padding(
      padding: const EdgeInsets.fromLTRB(2, 14, 0, 10),
      child: Row(children: [
        Text(t, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        if (count != null) Padding(padding: const EdgeInsets.only(left: 8), child: Text('$count', style: const TextStyle(color: C.g7, fontSize: 12))),
      ]),
    );

Widget formCard(String? title, List<Widget> children) => Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: C.g3, borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (title != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600))),
        ...children,
      ]),
    );

/// A text field bound to one key of a saved record; every change is saved straight away.
class BoundField extends StatefulWidget {
  final Json obj;
  final String field;
  final String hint;
  final IconData? icon;
  final bool password;
  final bool number;
  final int maxLines;
  final ValueChanged<String>? onChanged;
  const BoundField(this.obj, this.field, this.hint, {super.key, this.icon, this.password = false, this.number = false, this.maxLines = 1, this.onChanged});
  @override
  State<BoundField> createState() => _BoundFieldState();
}

class _BoundFieldState extends State<BoundField> {
  late final TextEditingController c = TextEditingController(text: '${widget.obj[widget.field] ?? ''}');
  bool hidden = true;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: c,
        obscureText: widget.password && hidden,
        maxLines: widget.password ? 1 : widget.maxLines,
        keyboardType: widget.number ? TextInputType.number : (widget.maxLines > 1 ? TextInputType.multiline : TextInputType.text),
        autocorrect: false,
        style: widget.maxLines > 1 ? const TextStyle(fontFamily: 'monospace', fontSize: 12) : null,
        decoration: InputDecoration(
          hintText: widget.hint,
          labelText: widget.maxLines > 1 ? null : null,
          prefixIcon: widget.icon != null ? Icon(widget.icon, size: 18, color: C.g7) : null,
          suffixIcon: widget.password ? IconButton(icon: Icon(hidden ? Icons.visibility_off : Icons.visibility, size: 18), onPressed: () => setState(() => hidden = !hidden)) : null,
        ),
        onChanged: (v) {
          widget.obj[widget.field] = widget.number ? (int.tryParse(v) ?? v) : v;
          Store.I.save();
          widget.onChanged?.call(v);
        },
      ),
    );
  }
}

Future<bool> confirm(BuildContext context, String title, String text, {String ok = 'Delete'}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      backgroundColor: C.g2,
      title: Text(title),
      content: Text(text),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
        FilledButton(style: FilledButton.styleFrom(backgroundColor: C.red), onPressed: () => Navigator.pop(c, true), child: Text(ok)),
      ],
    ),
  );
  return r == true;
}

Future<String?> promptText(BuildContext context, String title, String hint, [String value = '']) {
  final c = TextEditingController(text: value);
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: C.g2,
      title: Text(title),
      content: TextField(controller: c, autofocus: true, decoration: InputDecoration(hintText: hint), onSubmitted: (v) => Navigator.pop(ctx, v)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, c.text), child: const Text('Save')),
      ],
    ),
  );
}

void toast(BuildContext context, String text, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text), backgroundColor: error ? const Color(0xFF9B2F33) : C.g4));
}

/// The two questions asked while connecting, as dialogs.
Asker askerFor(BuildContext context) => Asker(
      (where, type, fp, changed) => showDialog<String>(
        context: context,
        barrierDismissible: false,
        builder: (c) => AlertDialog(
          backgroundColor: C.g2,
          title: Text(changed ? 'Host key changed' : 'Unknown host'),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(changed
                ? 'WARNING: the key of $where has changed. Someone could be intercepting the connection, or the server was reinstalled.'
                : 'The authenticity of $where can\'t be established. Are you sure you want to continue connecting?'),
            const SizedBox(height: 12),
            SelectableText('$type fingerprint is\n$fp', style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: const Text('Close')),
            TextButton(onPressed: () => Navigator.pop(c, 'once'), child: const Text('Continue')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: changed ? C.red : C.green),
              onPressed: () => Navigator.pop(c, 'add'),
              child: Text(changed ? 'Replace and continue' : 'Add and continue'),
            ),
          ],
        ),
      ),
      (message, username) {
        final u = TextEditingController(text: username);
        final p = TextEditingController();
        var save = true;
        return showDialog<Json>(
          context: context,
          barrierDismissible: false,
          builder: (c) => StatefulBuilder(
            builder: (c, set) => AlertDialog(
              backgroundColor: C.g2,
              title: const Text('Authentication required'),
              content: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(message, style: const TextStyle(color: C.g7)),
                const SizedBox(height: 12),
                TextField(controller: u, decoration: const InputDecoration(hintText: 'Username', prefixIcon: Icon(Icons.person_outline, size: 18))),
                const SizedBox(height: 8),
                TextField(controller: p, obscureText: true, autofocus: username.isNotEmpty, decoration: const InputDecoration(hintText: 'Password', prefixIcon: Icon(Icons.lock_outline, size: 18))),
                CheckboxListTile(value: save, onChanged: (v) => set(() => save = v ?? false), title: const Text('Save to host'), contentPadding: EdgeInsets.zero, dense: true),
              ]),
              actions: [
                TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: C.green),
                  onPressed: () => Navigator.pop(c, {'username': u.text.trim(), 'password': p.text, 'save': save}),
                  child: const Text('Continue'),
                ),
              ],
            ),
          ),
        );
      },
    );
