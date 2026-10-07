#!/usr/bin/env python3
"""Encodeurs minimalistes des formats binaires Android (sans aapt2) :
 - AXML : AndroidManifest.xml compilé
 - ARSC : resources.arsc (icône multi-densité)

Utilisés par build-apk.sh quand le SDK Android n'est pas disponible.
"""
import struct
import sys
import json

RES_NULL = 0x00
RES_STRING_POOL = 0x0001
RES_TABLE = 0x0002
RES_XML = 0x0003
RES_XML_START_NS = 0x0100
RES_XML_END_NS = 0x0101
RES_XML_START_EL = 0x0102
RES_XML_END_EL = 0x0103
RES_XML_RESMAP = 0x0180
RES_TABLE_PACKAGE = 0x0200
RES_TABLE_TYPE = 0x0201
RES_TABLE_TYPE_SPEC = 0x0202

T_REF = 0x01
T_STRING = 0x03
T_INT_DEC = 0x10
T_INT_HEX = 0x11
T_BOOL = 0x12

ANDROID_NS = 'http://schemas.android.com/apk/res/android'

# Identifiants d'attributs du framework (android.R.attr, vérifiés via android-all)
ATTR = {
    'theme': 16842752, 'label': 16842753, 'icon': 16842754, 'name': 16842755, 'exported': 16842768,
    'launchMode': 16842781, 'screenOrientation': 16842782, 'configChanges': 16842783,
    'minSdkVersion': 16843276, 'versionCode': 16843291, 'versionName': 16843292, 'windowSoftInputMode': 16843307,
    'targetSdkVersion': 16843376, 'allowBackup': 16843392, 'hardwareAccelerated': 16843475, 'largeHeap': 16843610,
    'isGame': 16843764, 'appCategory': 16844101, 'compileSdkVersion': 16844146, 'compileSdkVersionCodename': 16844147,
}


def pad4(b: bytes) -> bytes:
    return b + b'\x00' * ((4 - len(b) % 4) % 4)


def string_pool(strings):
    offsets = []
    data = b''
    for s in strings:
        offsets.append(len(data))
        enc = s.encode('utf-16-le')
        n = len(s)
        if n > 0x7fff:
            raise ValueError('chaîne trop longue')
        data += struct.pack('<H', n) + enc + b'\x00\x00'
    data = pad4(data)
    header_size = 28
    strings_start = header_size + 4 * len(strings)
    body = b''.join(struct.pack('<I', o) for o in offsets) + data
    size = header_size + len(body)
    return struct.pack('<HHIIIIII', RES_STRING_POOL, header_size, size, len(strings), 0, 0, strings_start, 0) + body


class Axml:
    """Construit un AndroidManifest binaire à partir d'un arbre simple."""

    def __init__(self):
        self.attr_names = []  # noms d'attributs android (indices = map de ressources)
        self.strings = []

    def idx(self, s):
        if s not in self.strings:
            self.strings.append(s)
        return self.strings.index(s)

    def build(self, root):
        # 1) les noms d'attributs android doivent occuper le début du pool
        def collect(el):
            for (ns, name, _t, _v) in el['attrs']:
                if ns == 'android' and name not in self.attr_names:
                    self.attr_names.append(name)
            for c in el.get('children', []):
                collect(c)
        collect(root)
        self.attr_names.sort(key=lambda n: ATTR[n])
        self.strings = list(self.attr_names)
        body = b''
        idx = self.idx
        ns_uri, ns_prefix = idx(ANDROID_NS), idx('android')

        def node(t, payload):
            return struct.pack('<HHIII', t, 16, 16 + len(payload), 1, 0xFFFFFFFF) + payload

        body += node(RES_XML_START_NS, struct.pack('<II', ns_prefix, ns_uri))

        def emit(el):
            out = b''
            attrs = []
            for (ns, name, typ, val) in el['attrs']:
                ns_i = ns_uri if ns == 'android' else 0xFFFFFFFF
                name_i = idx(name)
                if typ == 'string':
                    raw = idx(val)
                    tv = (T_STRING, raw)
                elif typ == 'bool':
                    raw = 0xFFFFFFFF
                    tv = (T_BOOL, 0xFFFFFFFF if val else 0)
                elif typ == 'int':
                    raw = 0xFFFFFFFF
                    tv = (T_INT_DEC, val)
                elif typ == 'hex':
                    raw = 0xFFFFFFFF
                    tv = (T_INT_HEX, val)
                elif typ == 'ref':
                    raw = 0xFFFFFFFF
                    tv = (T_REF, val)
                else:
                    raise ValueError(typ)
                attrs.append((ATTR.get(name, 0xFFFFFFFF) if ns == 'android' else 0xFFFFFFFF, ns_i, name_i, raw, tv))
            attrs.sort(key=lambda a: a[0])
            name_i = idx(el['tag'])
            ext = struct.pack('<IIHHHHHH', 0xFFFFFFFF, name_i, 20, 20, len(attrs), 0, 0, 0)
            for (_rid, ns_i, n_i, raw, (dt, data)) in attrs:
                ext += struct.pack('<IIIHBBI', ns_i, n_i, raw, 8, 0, dt, data & 0xFFFFFFFF)
            out += node(RES_XML_START_EL, ext)
            for c in el.get('children', []):
                out += emit(c)
            out += node(RES_XML_END_EL, struct.pack('<II', 0xFFFFFFFF, name_i))
            return out

        body += emit(root)
        body += node(RES_XML_END_NS, struct.pack('<II', ns_prefix, ns_uri))
        pool = string_pool(self.strings)
        resmap_payload = b''.join(struct.pack('<I', ATTR[n]) for n in self.attr_names)
        resmap = struct.pack('<HHI', RES_XML_RESMAP, 8, 8 + len(resmap_payload)) + resmap_payload
        total = 8 + len(pool) + len(resmap) + len(body)
        return struct.pack('<HHI', RES_XML, 8, total) + pool + resmap + body


def el(tag, attrs=None, children=None):
    return {'tag': tag, 'attrs': attrs or [], 'children': children or []}


def manifest(cfg):
    a = lambda n, t, v: ('android', n, t, v)
    activity = el('activity', [
        a('name', 'string', cfg['activity']),
        a('exported', 'bool', True),
        a('launchMode', 'int', 2),                 # singleTask
        a('screenOrientation', 'int', 13),         # fullUser
        a('configChanges', 'hex', 0x1BB0),
        a('windowSoftInputMode', 'hex', 0x10),     # adjustResize
        a('hardwareAccelerated', 'bool', True),
    ], [el('intent-filter', [], [
        el('action', [a('name', 'string', 'android.intent.action.MAIN')]),
        el('category', [a('name', 'string', 'android.intent.category.LAUNCHER')]),
    ])])
    app = el('application', [
        a('label', 'string', cfg['label']),
        a('icon', 'ref', 0x7f010000),
        a('theme', 'ref', 16974383),               # Theme.Material.NoActionBar.Fullscreen
        a('allowBackup', 'bool', True),
        a('hardwareAccelerated', 'bool', True),
        a('largeHeap', 'bool', True),
        a('isGame', 'bool', True),
        a('appCategory', 'int', 0),                # game
    ], [activity])
    root = el('manifest', [
        a('versionCode', 'int', cfg['versionCode']),
        a('versionName', 'string', cfg['versionName']),
        a('compileSdkVersion', 'int', cfg['targetSdk']),
        a('compileSdkVersionCodename', 'string', str(cfg['targetSdkName'])),
        (None, 'package', 'string', cfg['package']),
    ], [
        el('uses-sdk', [a('minSdkVersion', 'int', cfg['minSdk']), a('targetSdkVersion', 'int', cfg['targetSdk'])]),
        el('uses-permission', [a('name', 'string', 'android.permission.VIBRATE')]),
        app,
    ])
    return Axml().build(root)


DENSITIES = [('mdpi', 160), ('hdpi', 240), ('xhdpi', 320), ('xxhdpi', 480), ('xxxhdpi', 640)]


def arsc(package):
    """Table de ressources : 0x7f010000 = mipmap/ic_launcher (5 densités)."""
    paths = [f'res/mipmap-{d}-v4/ic_launcher.png' for d, _ in DENSITIES]
    gpool = string_pool(paths)
    type_pool = string_pool(['mipmap'])
    key_pool = string_pool(['ic_launcher'])
    # typeSpec : 1 entrée, varie selon la densité (CONFIG_DENSITY = 0x0100)
    spec = struct.pack('<HHIBBHI', RES_TABLE_TYPE_SPEC, 16, 16 + 4, 1, 0, 0, 1) + struct.pack('<I', 0x0100)
    types = b''
    for i, (_d, dens) in enumerate(DENSITIES):
        cfg = bytearray(64)
        struct.pack_into('<I', cfg, 0, 64)
        struct.pack_into('<H', cfg, 14, dens)
        struct.pack_into('<H', cfg, 24, 4)  # sdkVersion (qualificatif -v4)
        header_size = 8 + 4 + 4 + 4 + 64
        entries_start = header_size + 4
        entry = struct.pack('<HHI', 8, 0, 0) + struct.pack('<HBBI', 8, 0, T_STRING, i)
        size = entries_start + len(entry)
        types += struct.pack('<HHIBBHII', RES_TABLE_TYPE, header_size, size, 1, 0, 0, 1, entries_start) + bytes(cfg) + struct.pack('<I', 0) + entry
    name16 = package.encode('utf-16-le')[:254]
    name16 += b'\x00' * (256 - len(name16))
    pkg_header = 288
    type_strings_off = pkg_header
    key_strings_off = pkg_header + len(type_pool)
    pkg_body = type_pool + key_pool + spec + types
    pkg = struct.pack('<HHII', RES_TABLE_PACKAGE, pkg_header, pkg_header + len(pkg_body), 0x7f) + name16 + struct.pack('<IIIII', type_strings_off, 1, key_strings_off, 1, 0) + pkg_body
    total = 12 + len(gpool) + len(pkg)
    return struct.pack('<HHII', RES_TABLE, 12, total, 1) + gpool + pkg


if __name__ == '__main__':
    cfg = json.loads(sys.argv[1])
    out_dir = sys.argv[2]
    with open(f'{out_dir}/AndroidManifest.xml', 'wb') as f:
        f.write(manifest(cfg))
    with open(f'{out_dir}/resources.arsc', 'wb') as f:
        f.write(arsc(cfg['package']))
    print('AndroidManifest.xml et resources.arsc générés')
