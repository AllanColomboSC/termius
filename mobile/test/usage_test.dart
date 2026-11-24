import 'package:flutter_test/flutter_test.dart';
import 'package:shellbox_mobile/usage.dart';

void main() {
  test('reads Linux usage output', () {
    final s = parseStats('cpu  100 0 100 800 0 0 0 0 0 0\ncpu  150 0 150 900 0 0 0 0 0 0\n'
        'MemTotal:        8000000 kB\nMemFree:          1000000 kB\nMemAvailable:     2000000 kB\nBAT 85 Discharging\n')!;
    expect(s.cpu!.round(), 50);
    expect(s.memUsed, 6000000 * 1024);
    expect(s.battery, 85);
    expect(s.batteryStatus, 'Discharging');
  });

  test('no battery, old kernel, and non-Linux', () {
    final s = parseStats('cpu  1 0 1 8\ncpu  1 0 1 18\nMemTotal: 1000 kB\nMemFree: 200 kB\nBuffers: 100 kB\nCached: 100 kB\n')!;
    expect(s.memUsed, 600 * 1024);
    expect(s.battery, null);
    expect(parseStats(''), null);
  });
}
