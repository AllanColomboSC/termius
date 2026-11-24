// SFTP: browse a server's files, download to the phone, upload from the phone.
import 'dart:typed_data';

import 'package:dartssh2/dartssh2.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'ssh_service.dart';
import 'store.dart';
import 'ui.dart';

class SftpScreen extends StatefulWidget {
  final Json? host;
  const SftpScreen({super.key, this.host});
  @override
  State<SftpScreen> createState() => _SftpScreenState();
}

class _SftpScreenState extends State<SftpScreen> {
  Json? host;
  Conn? conn;
  SftpClient? sftp;
  String path = '/';
  List<SftpName> entries = [];
  String status = '';
  String? progress;

  @override
  void initState() {
    super.initState();
    host = widget.host;
    if (host != null) WidgetsBinding.instance.addPostFrameCallback((_) => _connect());
  }

  @override
  void dispose() {
    sftp?.close();
    conn?.close();
    super.dispose();
  }

  Future<void> _connect() async {
    setState(() => status = 'Connecting...');
    try {
      conn?.close();
      conn = await connectHost(host!, askerFor(context));
      sftp = await conn!.client.sftp();
      path = await sftp!.absolute('.');
      Store.I.addLog({'hostId': host!['id'], 'label': Store.I.hostLabel(host!), 'address': host!['address'], 'kind': 'SFTP', 'status': 'Connected'});
      await _load();
    } catch (e) {
      setState(() => status = '$e');
    }
  }

  Future<void> _load() async {
    setState(() => status = 'Loading...');
    try {
      final list = await sftp!.listdir(path);
      list.removeWhere((e) => e.filename == '.' || e.filename == '..');
      list.sort((a, b) {
        if (a.attr.isDirectory != b.attr.isDirectory) return a.attr.isDirectory ? -1 : 1;
        return a.filename.toLowerCase().compareTo(b.filename.toLowerCase());
      });
      setState(() { entries = list; status = ''; });
    } catch (e) {
      setState(() => status = '$e');
    }
  }

  String _join(String name) => path.endsWith('/') ? '$path$name' : '$path/$name';
  String _parent() {
    if (path == '/') return '/';
    final q = path.replaceAll(RegExp(r'/+$'), '');
    final i = q.lastIndexOf('/');
    return i <= 0 ? '/' : q.substring(0, i);
  }

  Future<void> _download(SftpName e) async {
    try {
      final f = await sftp!.open(_join(e.filename));
      final total = e.attr.size ?? 0;
      final chunks = BytesBuilder(copy: false);
      await for (final c in f.read(onProgress: (n) => setState(() => progress = '${e.filename}: ${total > 0 ? (n * 100 ~/ total) : 0}%'))) {
        chunks.add(c);
      }
      await f.close();
      setState(() => progress = null);
      final saved = await FilePicker.saveFile(fileName: e.filename, bytes: chunks.takeBytes(), mimeType: 'application/octet-stream');
      if (mounted && saved != null) toast(context, 'Saved ${e.filename}');
    } catch (err) {
      setState(() => progress = null);
      if (mounted) toast(context, 'Download failed: $err', error: true);
    }
  }

  Future<void> _upload() async {
    final files = await FilePicker.pickFiles(dialogTitle: 'Upload');
    for (final pf in files) {
      try {
        setState(() => progress = 'Uploading ${pf.name}...');
        final bytes = await pf.readAsBytes();
        final f = await sftp!.open(_join(pf.name), mode: SftpFileOpenMode.create | SftpFileOpenMode.truncate | SftpFileOpenMode.write);
        await f.writeBytes(bytes);
        await f.close();
      } catch (err) {
        if (mounted) toast(context, 'Upload failed: $err', error: true);
      }
    }
    setState(() => progress = null);
    _load();
  }

  Future<void> _remove(SftpName e) async {
    if (!await confirm(context, 'Delete', 'Delete "${e.filename}"?')) return;
    try {
      e.attr.isDirectory ? await sftp!.rmdir(_join(e.filename)) : await sftp!.remove(_join(e.filename));
    } catch (err) {
      if (mounted) toast(context, '$err', error: true);
    }
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final st = Store.I;
    if (host == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('SFTP')),
        body: ListView(padding: const EdgeInsets.all(12), children: [
          sectionTitle('Select host'),
          if (st.list('hosts').isEmpty) const Text('Add a host in the Hosts screen to browse its files here.', style: TextStyle(color: C.g7)),
          for (final h in st.sorted(st.list('hosts'), st.hostLabel))
            card(leading: avatar(os: h['os'] as String?), title: st.hostLabel(h), subtitle: 'sftp, ${st.resolveHost(h)['username']}', onTap: () { setState(() => host = h); _connect(); }),
        ]),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(st.hostLabel(host!)),
        actions: [
          IconButton(icon: const Icon(Icons.arrow_upward), onPressed: sftp == null ? null : () { path = _parent(); _load(); }),
          IconButton(icon: const Icon(Icons.refresh), onPressed: sftp == null ? null : _load),
          IconButton(icon: const Icon(Icons.create_new_folder_outlined), onPressed: sftp == null ? null : () async {
            final n = await promptText(context, 'New folder', 'Name');
            if (n == null || n.isEmpty) return;
            try { await sftp!.mkdir(_join(n)); } catch (e) { if (context.mounted) toast(context, '$e', error: true); }
            _load();
          }),
        ],
      ),
      floatingActionButton: sftp == null ? null : FloatingActionButton(onPressed: _upload, child: const Icon(Icons.upload)),
      body: Column(children: [
        Container(
          width: double.infinity,
          color: C.g1,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(path, style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: C.g7)),
        ),
        if (progress != null) Padding(padding: const EdgeInsets.all(8), child: Text(progress!, style: const TextStyle(color: C.blue))),
        if (status.isNotEmpty)
          Padding(padding: const EdgeInsets.all(16), child: Column(children: [
            SelectableText(status, style: TextStyle(color: status.endsWith('...') ? C.g7 : C.red)),
            if (!status.endsWith('...')) TextButton(onPressed: _connect, child: const Text('Retry')),
          ])),
        Expanded(
          child: ListView(children: [
            for (final e in entries)
              ListTile(
                leading: Icon(e.attr.isDirectory ? Icons.folder : Icons.insert_drive_file_outlined, color: e.attr.isDirectory ? C.blue : C.g7),
                title: Text(e.filename),
                subtitle: Text(e.attr.isDirectory ? 'folder' : _size(e.attr.size ?? 0), style: const TextStyle(color: C.g7, fontSize: 12)),
                onTap: () {
                  if (e.attr.isDirectory) { path = _join(e.filename); _load(); } else { _download(e); }
                },
                onLongPress: () => showModalBottomSheet(context: context, backgroundColor: C.g2, builder: (c) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
                      if (!e.attr.isDirectory) ListTile(leading: const Icon(Icons.download), title: const Text('Download'), onTap: () { Navigator.pop(c); _download(e); }),
                      ListTile(leading: const Icon(Icons.edit_outlined), title: const Text('Rename'), onTap: () async {
                        Navigator.pop(c);
                        final n = await promptText(context, 'Rename', 'New name', e.filename);
                        if (n == null || n.isEmpty || n == e.filename) return;
                        try { await sftp!.rename(_join(e.filename), _join(n)); } catch (err) { if (context.mounted) toast(context, '$err', error: true); }
                        _load();
                      }),
                      ListTile(leading: const Icon(Icons.delete_outline, color: C.red), title: const Text('Delete', style: TextStyle(color: C.red)), onTap: () { Navigator.pop(c); _remove(e); }),
                    ]))),
              ),
          ]),
        ),
      ]),
    );
  }

  String _size(int n) {
    if (n < 1024) return '$n B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    var v = n / 1024;
    var i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return '${v.toStringAsFixed(v < 10 ? 1 : 0)} ${u[i]}';
  }
}
