import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shellbox_mobile/main.dart';
import 'package:shellbox_mobile/store.dart';

void main() {
  test('quick connect text is understood', () {
    expect(parseSsh('ssh admin@192.0.2.10 -p 2222'), {'username': 'admin', 'address': '192.0.2.10', 'port': 2222});
    expect(parseSsh('root@example.com:2200'), {'username': 'root', 'address': 'example.com', 'port': 2200});
    expect(parseSsh('example.com'), {'username': '', 'address': 'example.com', 'port': 22});
    expect(parseSsh('   '), null);
  });

  test('blank host fields come from its group', () {
    Store.I.importJson('{"groups":[{"id":"g","label":"Prod","username":"deploy","password":"pw"}],'
        '"hosts":[{"id":"h","address":"10.0.0.1","groupId":"g","port":2222}]}', notify: false);
    final r = Store.I.resolveHost(Store.I.byId('hosts', 'h')!);
    expect(r['username'], 'deploy');
    expect(r['password'], 'pw');
    expect(r['port'], 2222);
    expect(Store.I.settings['fontSize'], 14);
    expect(Store.I.settings['scrollback'], 40000);
  });

  testWidgets('opens on Hosts with the side menu in the original order', (tester) async {
    SharedPreferences.setMockInitialValues({});
    Store.I.importJson('{}', notify: false);
    await tester.pumpWidget(const ShellboxApp());
    expect(find.text('Hosts'), findsWidgets);
    expect(find.text('Create host'), findsOneWidget);
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    for (final name in ['Keychain', 'Port Forwarding', 'Snippets', 'Known Hosts', 'Logs', 'SFTP', 'Settings']) {
      expect(find.text(name), findsWidgets, reason: name);
    }
    await tester.tap(find.text('Keychain'));
    await tester.pumpAndSettle();
    expect(find.text('Your keychain is empty'), findsOneWidget);
  });
}
