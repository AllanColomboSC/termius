// Opening SSH connections: host key checks, login, host chaining, port forwarding.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dartssh2/dartssh2.dart';

import 'store.dart';

/// Returns 'add' (trust and remember), 'once' (trust this time) or null (cancel).
typedef AskHostKey = Future<String?> Function(String where, String type, String fingerprint, bool changed);

/// Returns {'username', 'password', 'save'} or null to cancel.
typedef AskCredentials = Future<Json?> Function(String message, String username);

class Conn {
  final SSHClient client;
  final List<SSHClient> hops;
  Conn(this.client, this.hops);

  void close() {
    client.close();
    for (final h in hops.reversed) {
      h.close();
    }
  }
}

class Asker {
  final AskHostKey hostKey;
  final AskCredentials credentials;
  const Asker(this.hostKey, this.credentials);
}

Future<Conn> connectHost(Json host, Asker ask, {String? overrideUser, String? overridePassword}) async {
  final s = Store.I;
  final chainIds = ((host['chain'] as List?) ?? []).cast<String>();
  final hops = <SSHClient>[];
  SSHClient? prev;
  final path = [...chainIds.map((id) => s.byId('hosts', id)).whereType<Json>(), host];
  for (var i = 0; i < path.length; i++) {
    final h = path[i];
    final last = i == path.length - 1;
    final c = s.resolveHost(h);
    final address = (h['address'] ?? '') as String;
    final port = c['port'] as int;
    var username = (last ? overrideUser : null) ?? (c['username'] as String);
    var password = (last ? overridePassword : null) ?? (c['password'] as String);
    if (username.isEmpty) {
      final r = await ask.credentials('Username is required for $address', '');
      if (r == null) throw const ConnectCancelled();
      username = r['username'] as String;
      password = r['password'] as String;
      _maybeSave(h, r);
    }
    final key = s.byId('keys', c['keyId'] as String?);
    List<SSHKeyPair>? identities;
    if (key != null && ((key['privateKey'] ?? '') as String).trim().isNotEmpty) {
      // A locked key opens with its own passphrase, or else with the host's password (people often save
      // the key's passphrase there).
      final pem = key['privateKey'] as String;
      final pass = (key['passphrase'] ?? '') as String;
      for (final p in [pass.isEmpty ? null : pass, if (password.isNotEmpty && password != pass) password]) {
        try {
          identities = SSHKeyPair.fromPem(pem, p);
          break;
        } catch (_) {
          identities = null;
        }
      }
    }
    final SSHSocket socket;
    try {
      socket = prev == null
          ? await SSHSocket.connect(address, port, timeout: const Duration(seconds: 20))
          : await prev.forwardLocal(address, port);
    } catch (e) {
      throw ConnectError('Could not connect to $address:$port: $e');
    }
    var asked = false;
    final keepalive = (s.settings['keepalive'] ?? 0) as int;
    final client = SSHClient(
      socket,
      username: username,
      identities: identities,
      keepAliveInterval: keepalive > 0 ? Duration(seconds: keepalive) : null,
      onVerifyHostKey: (type, fpBytes) async {
        final fp = utf8.decode(fpBytes);
        final trusted = s.trustedFor(address, port);
        if (trusted.contains(fp)) return true;
        final answer = await ask.hostKey('$address:$port', type, fp, trusted.isNotEmpty);
        if (answer == 'add') s.addKnownHost(address, port, fp, type);
        return answer != null;
      },
      onPasswordRequest: () async {
        if (password.isNotEmpty && !asked) {
          asked = true;
          return password;
        }
        final r = await ask.credentials(asked ? 'Wrong password, try again' : 'Password for $username@$address', username);
        if (r == null) return null;
        password = r['password'] as String;
        _maybeSave(h, r);
        return password;
      },
      onUserInfoRequest: (req) async {
        if (password.isEmpty) {
          final r = await ask.credentials(req.instruction.isNotEmpty ? req.instruction : 'Password for $username@$address', username);
          if (r == null) return null;
          password = r['password'] as String;
          _maybeSave(h, r);
        }
        return req.prompts.map((_) => password).toList();
      },
    );
    try {
      await client.authenticated;
    } catch (e) {
      client.close();
      for (final x in hops) {
        x.close();
      }
      throw ConnectError('$e');
    }
    if (prev != null) hops.add(prev);
    prev = client;
  }
  return Conn(prev!, hops);
}

void _maybeSave(Json host, Json r) {
  if (r['save'] == true && Store.I.byId('hosts', host['id'] as String?) != null) {
    host['username'] = r['username'];
    host['password'] = r['password'];
    Store.I.save();
  }
}

class ConnectError implements Exception {
  final String message;
  const ConnectError(this.message);
  @override
  String toString() => message;
}

class ConnectCancelled implements Exception {
  const ConnectCancelled();
  @override
  String toString() => 'Cancelled';
}

/// A running port forwarding rule.
class Forward {
  final Conn conn;
  final List<StreamSubscription> subs = [];
  ServerSocket? server;
  SSHDynamicForward? dynamic;
  SSHRemoteForward? remote;
  Forward(this.conn);

  void stop() {
    for (final s in subs) {
      s.cancel();
    }
    server?.close();
    dynamic?.close();
    if (remote != null) conn.client.cancelForwardRemote(remote!);
    conn.close();
  }
}

Future<Forward> startForward(Json rule, Json host, Asker ask) async {
  final conn = await connectHost(host, ask);
  final f = Forward(conn);
  final kind = rule['kind'] ?? 'local';
  final bindPort = int.tryParse('${rule['bindPort']}') ?? 0;
  final bindAddr = ((rule['bindAddress'] ?? '') as String).isEmpty ? '127.0.0.1' : rule['bindAddress'] as String;
  final destHost = ((rule['destHost'] ?? '') as String).isEmpty ? '127.0.0.1' : rule['destHost'] as String;
  final destPort = int.tryParse('${rule['destPort']}') ?? 0;
  try {
    if (kind == 'dynamic') {
      f.dynamic = await conn.client.forwardDynamic(bindHost: bindAddr, bindPort: bindPort);
    } else if (kind == 'remote') {
      final r = await conn.client.forwardRemote(host: bindAddr, port: bindPort);
      if (r == null) throw ConnectError('The server refused to listen on $bindAddr:$bindPort');
      f.remote = r;
      f.subs.add(r.connections.listen((ch) async {
        try {
          final sock = await Socket.connect(destHost, destPort);
          ch.stream.cast<List<int>>().pipe(sock);
          sock.cast<List<int>>().pipe(ch.sink);
        } catch (_) {
          ch.close();
        }
      }));
    } else {
      final server = await ServerSocket.bind(bindAddr, bindPort);
      f.server = server;
      f.subs.add(server.listen((sock) async {
        try {
          final ch = await conn.client.forwardLocal(destHost, destPort);
          ch.stream.cast<List<int>>().pipe(sock);
          sock.cast<List<int>>().pipe(ch.sink);
        } catch (_) {
          sock.destroy();
        }
      }));
    }
  } catch (e) {
    conn.close();
    rethrow;
  }
  return f;
}
