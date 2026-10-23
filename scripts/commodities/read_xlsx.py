"""Minimal reader for the World Bank Pink Sheet workbook (standard library only)."""
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def col_index(ref):
    letters = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_sheet(path, name):
    """Rows of the named sheet as dicts {column index: text}, keeping column positions of sparse rows."""
    z = zipfile.ZipFile(path)
    strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        strings = [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])) for si in root.findall('m:si', NS)]
    wb = z.read('xl/workbook.xml').decode()
    rels = z.read('xl/_rels/workbook.xml.rels').decode()
    rid = re.search(r'name="%s"[^>]*r:id="([^"]+)"' % re.escape(name), wb).group(1)
    m = re.search(r'Id="%s"[^>]*Target="([^"]+)"' % rid, rels) or re.search(r'Target="([^"]+)"[^>]*Id="%s"' % rid, rels)
    target = m.group(1)
    sheet = target.lstrip('/') if target.startswith('/') else 'xl/' + target
    root = ET.fromstring(z.read(sheet))
    out = []
    for r in root.find('m:sheetData', NS).findall('m:row', NS):
        row = {}
        for c in r.findall('m:c', NS):
            v = c.find('m:v', NS)
            if v is None:
                is_ = c.find('m:is', NS)
                text = ''.join(t.text or '' for t in is_.iter('{%s}t' % NS['m'])) if is_ is not None else ''
            else:
                text = strings[int(v.text)] if c.get('t') == 's' else v.text
            row[col_index(c.get('r'))] = text
        out.append(row)
    return out
