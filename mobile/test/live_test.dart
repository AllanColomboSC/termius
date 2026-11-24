// Against a real server: set SHELLBOX_LIVE=user@host[:port] and run `flutter test test/live_test.dart`.
// Without it the test is skipped. It stops at the password question.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shellbox_mobile/ssh_service.dart';
import 'package:shellbox_mobile/store.dart';

void main() {
  final spec = Platform.environment['SHELLBOX_LIVE'];
  test('reaches the key question and the password question', () async {
    final p = parseSsh(spec!)!;
    Store.I.importJson('{"hosts":[{"id":"h","address":"${p['address']}","port":${p['port']},"username":"${p['username']}"}]}', notify: false);
    String? seenFp;
    var askedPassword = false;
    final ask = Asker(
      (where, type, fp, changed) async {
        seenFp = fp;
        // ignore: avoid_print
        print('host key: $type $fp at $where');
        return 'once';
      },
      (message, username) async {
        askedPassword = true;
        // ignore: avoid_print
        print('asked: $message');
        return null;
      },
    );
    try {
      final c = await connectHost(Store.I.byId('hosts', 'h')!, ask);
      c.close();
    } catch (e) {
      // ignore: avoid_print
      print('ended with: $e');
    }
    expect(seenFp, startsWith('SHA256:'));
    expect(askedPassword, isTrue);
  }, skip: spec == null ? 'set SHELLBOX_LIVE to run' : false, timeout: const Timeout(Duration(seconds: 40)));
}
