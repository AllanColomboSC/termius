// Host usage on the host cards: CPU, memory and battery of the hosts whose saved login works,
// read every 10 seconds over a quiet SSH connection while the Hosts screen is open.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import 'ssh_service.dart';
import 'store.dart';
import 'ui.dart';

class HostStats {
  final double? cpu;
  final int memUsed;
  final int memTotal;
  final int? battery;
  final String? batteryStatus;
  const HostStats({this.cpu, this.memUsed = 0, this.memTotal = 0, this.battery, this.batteryStatus});
}

/// Two CPU samples a second apart, memory, then every battery's capacity and status (Linux).
const _script = "LC_ALL=C; head -n1 /proc/stat; sleep 1; head -n1 /proc/stat; "
    "grep -E '^(MemTotal|MemAvailable|MemFree|Buffers|Cached):' /proc/meminfo; "
    "for b in /sys/class/power_supply/BAT*; do [ -r \"\$b/capacity\" ] && echo \"BAT \$(cat \"\$b/capacity\") \$(cat \"\$b/status\" 2>/dev/null)\"; done; true";

HostStats? parseStats(String text) {
  final cpu = <List<int>>[];
  final mem = <String, int>{};
  final batts = <(int, String)>[];
  for (final line in const LineSplitter().convert(text)) {
    final parts = line.trim().split(RegExp(r'\s+'));
    if (parts.isNotEmpty && parts.first == 'cpu') {
      final v = parts.skip(1).take(8).map(int.tryParse).whereType<int>().toList();
      if (v.length >= 4) {
        final total = v.fold<int>(0, (a, b) => a + b);
        final idle = v[3] + (v.length > 4 ? v[4] : 0);
        cpu.add([total - idle, total]);
      }
    } else if (line.startsWith('BAT ')) {
      final cap = int.tryParse(parts.length > 1 ? parts[1] : '');
      if (cap != null) batts.add((cap.clamp(0, 100), parts.skip(2).join(' ')));
    } else if (line.contains(':')) {
      final i = line.indexOf(':');
      final kb = int.tryParse(line.substring(i + 1).trim().split(RegExp(r'\s+')).first);
      if (kb != null) mem[line.substring(0, i).trim()] = kb * 1024;
    }
  }
  double? cpuPct;
  if (cpu.length >= 2 && cpu.last[1] > cpu.first[1]) {
    cpuPct = ((cpu.last[0] - cpu.first[0]) / (cpu.last[1] - cpu.first[1]) * 100).clamp(0, 100).toDouble();
  }
  final total = mem['MemTotal'] ?? 0;
  final avail = mem['MemAvailable'] ?? ((mem['MemFree'] ?? 0) + (mem['Buffers'] ?? 0) + (mem['Cached'] ?? 0));
  if (cpuPct == null && total == 0) return null;
  int? battery;
  String? status;
  if (batts.isNotEmpty) {
    battery = batts.map((b) => b.$1).reduce((a, b) => a + b) ~/ batts.length;
    status = batts.map((b) => b.$2).firstWhere((s) => s.isNotEmpty, orElse: () => '');
    if (status.isEmpty) status = null;
  }
  return HostStats(cpu: cpuPct, memUsed: (total - avail).clamp(0, total), memTotal: total, battery: battery, batteryStatus: status);
}

class _HostState {
  bool busy = false;
  String? key;
  String? blockedKey;
  int retryAt = 0;
  int at = 0;
  Conn? conn;
}

class HostUsage extends ChangeNotifier {
  static final HostUsage I = HostUsage._();
  HostUsage._();

  static const interval = Duration(seconds: 10);
  final Map<String, HostStats> stats = {};
  final Map<String, _HostState> _state = {};
  Timer? _timer;

  bool get enabled => Store.I.settings['hostUsage'] != false;

  /// Runs while the Hosts screen is on screen.
  void start() {
    _timer ??= Timer.periodic(interval, (_) => tick());
    tick();
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  void tick() {
    final hosts = Store.I.list('hosts');
    final ids = hosts.map((h) => h['id']).toSet();
    for (final id in _state.keys.toList()) {
      if (!ids.contains(id) || !enabled) {
        _state.remove(id)?.conn?.close();
        stats.remove(id);
      }
    }
    if (!enabled) { notifyListeners(); return; }
    for (final h in hosts) {
      _poll(h);
    }
  }

  /// Before a host's first numbers arrive: a host that will be read and isn't known to fail.
  bool isLoading(String id) {
    if (!enabled || stats.containsKey(id)) return false;
    final s = _state[id];
    if (s != null) return s.busy;
    final h = Store.I.byId('hosts', id);
    return h != null && _loginKey(h) != null;
  }

  /// A username and an already trusted host key: a check never has to ask for anything.
  String? _loginKey(Json h) {
    final st = Store.I;
    if ('${h['address'] ?? ''}'.isEmpty || h['quick'] == true) return null;
    final c = st.resolveHost(h);
    if ((c['username'] as String).isEmpty) return null;
    final trusted = st.trustedFor(h['address'] as String, c['port'] as int);
    if (trusted.isEmpty) return null;
    final key = st.byId('keys', c['keyId'] as String?);
    return jsonEncode([h['address'], c['port'], c['username'], c['password'], key?['privateKey'], key?['passphrase'], trusted, h['chain']]);
  }

  Future<void> _poll(Json h) async {
    final id = h['id'] as String;
    final s = _state.putIfAbsent(id, () => _HostState());
    final key = _loginKey(h);
    if (key == null) {
      if (stats.remove(id) != null) notifyListeners();
      return;
    }
    final now = DateTime.now().millisecondsSinceEpoch;
    if (s.busy || s.blockedKey == key || (s.key == key && (now < s.retryAt || now - s.at < interval.inMilliseconds - 1000))) return;
    if (s.key != key) { s.conn?.close(); s.conn = null; }
    s.busy = true;
    s.key = key;
    s.at = now;
    if (!stats.containsKey(id)) notifyListeners(); // skeleton while the first numbers are on their way
    try {
      String out;
      try {
        if (s.conn == null) throw StateError('no connection');
        out = utf8.decode(await s.conn!.client.run(_script).timeout(const Duration(seconds: 10)), allowMalformed: true);
      } catch (_) {
        // The kept connection went away (or there was none yet): log in again, never asking.
        s.conn?.close();
        s.conn = await connectHost(h, Asker((_, _, _, _) async => null, (_, _) async => null)).timeout(const Duration(seconds: 25));
        out = utf8.decode(await s.conn!.client.run(_script).timeout(const Duration(seconds: 10)), allowMalformed: true);
      }
      final parsed = parseStats(out);
      if (parsed == null) {
        s.blockedKey = key;
        stats.remove(id);
      } else {
        stats[id] = parsed;
        s.retryAt = 0;
      }
    } catch (e) {
      stats.remove(id);
      s.conn?.close();
      s.conn = null;
      final offline = e is TimeoutException || '$e'.startsWith('Could not connect');
      if (offline) {
        s.retryAt = DateTime.now().millisecondsSinceEpoch + 60000;
      } else {
        s.blockedKey = key; // wrong login or a host key that needs a look: wait until it changes
      }
    } finally {
      s.busy = false;
      notifyListeners();
    }
  }
}

String _gb(int b) => '${(b / 1073741824).toStringAsFixed(b >= 10 * 1073741824 ? 0 : 1)} GB';

Color _level(double v, double warn, double bad) => v >= bad ? C.red : (v >= warn ? C.orange : C.green);

/// The usage line under a host card's subtitle; nothing while there's nothing to show.
class UsageLine extends StatelessWidget {
  final String hostId;
  const UsageLine(this.hostId, {super.key});

  Widget _meter(String label, double pct, Color color, String tip) => Tooltip(
        message: tip,
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: C.g7)),
          const SizedBox(width: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: SizedBox(width: 26, height: 4, child: LinearProgressIndicator(value: pct / 100, color: color, backgroundColor: C.g1)),
          ),
          const SizedBox(width: 4),
          Text('${pct.round()}%', style: const TextStyle(fontSize: 11, color: C.g7, fontFeatures: [FontFeature.tabularFigures()])),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: HostUsage.I,
      builder: (context, _) {
        final s = HostUsage.I.enabled ? HostUsage.I.stats[hostId] : null;
        if (s == null && HostUsage.I.isLoading(hostId)) return const _UsageSkeleton();
        if (s == null) return const SizedBox.shrink();
        final items = <Widget>[];
        if (s.cpu != null) items.add(_meter('CPU', s.cpu!, _level(s.cpu!, 70, 90), 'Processor ${s.cpu!.toStringAsFixed(1)}% busy'));
        if (s.memTotal > 0) {
          final pct = s.memUsed / s.memTotal * 100;
          items.add(_meter('RAM', pct, _level(pct, 75, 90), 'Memory ${_gb(s.memUsed)} of ${_gb(s.memTotal)} used'));
        }
        if (s.battery != null) {
          final b = s.battery!;
          final st = s.batteryStatus ?? '';
          final charging = RegExp('charging|full', caseSensitive: false).hasMatch(st) && !RegExp('discharging|not charging', caseSensitive: false).hasMatch(st);
          final color = b <= 15 ? C.red : (b <= 30 ? C.orange : C.green);
          final icon = charging ? Icons.battery_charging_full : (b >= 90 ? Icons.battery_full : b >= 60 ? Icons.battery_5_bar : b >= 30 ? Icons.battery_3_bar : Icons.battery_1_bar);
          items.add(Tooltip(
            message: 'Battery $b%${st.isEmpty ? '' : ' ($st)'}',
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              RotatedBox(quarterTurns: 1, child: Icon(icon, size: 14, color: color)),
              const SizedBox(width: 3),
              Text('$b%', style: const TextStyle(fontSize: 11, color: C.g7)),
            ]),
          ));
        }
        return Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Wrap(spacing: 10, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: items),
        );
      },
    );
  }
}

/// Shimmering placeholders shown until a host's first numbers arrive.
class _UsageSkeleton extends StatefulWidget {
  const _UsageSkeleton();
  @override
  State<_UsageSkeleton> createState() => _UsageSkeletonState();
}

class _UsageSkeletonState extends State<_UsageSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 7),
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final x = _c.value * 3 - 1.5;
          Widget bar(double w) => Container(
                width: w,
                height: 9,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(5),
                  gradient: LinearGradient(begin: Alignment(x - 1, 0), end: Alignment(x + 1, 0), colors: const [C.g1, Color(0xFFF4F7F8), C.g1]),
                ),
              );
          return Wrap(spacing: 10, children: [bar(62), bar(66), bar(40)]);
        },
      ),
    );
  }
}
