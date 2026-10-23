"""Converts the World Bank Pink Sheet (CMO-Historical-Data-Monthly.xlsx) into public/data/commodities.json.

    python3 scripts/commodities/convert.py <workbook.xlsx> <source_url> [out=public/data/commodities.json]

Monthly average prices in nominal US dollars (World Bank Commodity Price Data, CC BY 4.0). Only the benchmarks listed
in SERIES are kept, from 1990. Values are copied as published (rounded to 6 significant digits); missing months stay
null. The workflow .github/workflows/commodities.yml runs this monthly and proposes the result as a pull request.
"""
import json
import math
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from read_xlsx import read_sheet  # noqa: E402

# id, workbook header, display name, group, short description of the benchmark
SERIES = [
    ('brent', 'Crude oil, Brent', 'Crude oil, Brent', 'Energy', 'North Sea light crude, the main international oil benchmark'),
    ('wti', 'Crude oil, WTI', 'Crude oil, WTI', 'Energy', 'West Texas Intermediate, the US benchmark (Cushing, Oklahoma)'),
    ('dubai', 'Crude oil, Dubai', 'Crude oil, Dubai', 'Energy', 'Medium sour crude, the reference for Middle East exports to Asia'),
    ('gas-us', 'Natural gas, US', 'Natural gas, United States', 'Energy', 'Henry Hub, Louisiana'),
    ('gas-eu', 'Natural gas, Europe', 'Natural gas, Europe', 'Energy', 'Dutch TTF (earlier: import border prices)'),
    ('lng-japan', 'Liquefied natural gas, Japan', 'LNG, Japan', 'Energy', 'Japanese LNG import price'),
    ('coal-au', 'Coal, Australian', 'Coal, Australia', 'Energy', 'Thermal coal, Newcastle, Australia'),
    ('gold', 'Gold', 'Gold', 'Precious metals', 'London, 99.5% fine'),
    ('silver', 'Silver', 'Silver', 'Precious metals', 'Handy and Harman, 99.9% grade, New York'),
    ('platinum', 'Platinum', 'Platinum', 'Precious metals', '99.9% refined, London'),
    ('copper', 'Copper', 'Copper', 'Base metals and ores', 'LME, grade A cathodes'),
    ('aluminium', 'Aluminum', 'Aluminium', 'Base metals and ores', 'LME, 99.7% purity'),
    ('nickel', 'Nickel', 'Nickel', 'Base metals and ores', 'LME, cathodes'),
    ('zinc', 'Zinc', 'Zinc', 'Base metals and ores', 'LME, high grade'),
    ('lead', 'Lead', 'Lead', 'Base metals and ores', 'LME, refined'),
    ('tin', 'Tin', 'Tin', 'Base metals and ores', 'LME, refined'),
    ('iron-ore', 'Iron ore, cfr spot', 'Iron ore', 'Base metals and ores', 'China import iron ore fines, 62% Fe, CFR'),
    ('wheat', 'Wheat, US HRW', 'Wheat', 'Agriculture', 'US No. 1 hard red winter, Gulf export price'),
    ('maize', 'Maize', 'Maize (corn)', 'Agriculture', 'US No. 2 yellow, Gulf export price'),
    ('soybeans', 'Soybeans', 'Soybeans', 'Agriculture', 'US, CIF Rotterdam'),
    ('rice', 'Rice, Thai 5%', 'Rice', 'Agriculture', 'Thai 5% broken, white rice, Bangkok export price'),
    ('palm-oil', 'Palm oil', 'Palm oil', 'Agriculture', 'Malaysia/Indonesia, CIF Rotterdam'),
    ('sugar', 'Sugar, world', 'Sugar', 'Agriculture', 'International Sugar Agreement price'),
    ('coffee', 'Coffee, Arabica', 'Coffee, Arabica', 'Agriculture', 'International Coffee Organization, New York'),
    ('cocoa', 'Cocoa', 'Cocoa', 'Agriculture', 'International Cocoa Organization daily price'),
    ('cotton', 'Cotton, A Index', 'Cotton', 'Agriculture', 'Cotton Outlook A Index, middling'),
    ('urea', 'Urea', 'Urea (fertiliser)', 'Fertilisers', 'Ukraine/Black Sea (later Middle East), prilled bulk'),
    ('dap', 'DAP', 'Diammonium phosphate (fertiliser)', 'Fertilisers', 'US Gulf (later Morocco), standard size, bulk'),
]
START = (1990, 1)


def num(text):
    try:
        v = float(text)
    except (TypeError, ValueError):
        return None
    return float(f'{v:.6g}') if math.isfinite(v) else None


def main():
    path, source_url = sys.argv[1], sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else 'public/data/commodities.json'
    rows = read_sheet(path, 'Monthly Prices')
    updated = next((r[0] for r in rows[:6] if str(r.get(0, '')).startswith('Updated on')), '')
    header_i = next(i for i, r in enumerate(rows) if 'Crude oil, Brent' in r.values())
    header, units = rows[header_i], rows[header_i + 1]
    col = {v.strip(): k for k, v in header.items() if v}
    months = [(r[0], r) for r in rows[header_i + 2:] if re.fullmatch(r'\d{4}M\d{2}', str(r.get(0, '')))]
    months = [(m, r) for m, r in months if (int(m[:4]), int(m[5:])) >= START]
    if not months:
        sys.exit('no monthly rows found')
    series = []
    for sid, head, name, group, desc in SERIES:
        if head not in col:
            sys.exit(f'series not found in workbook: {head}')
        c = col[head]
        unit = units.get(c, '').strip('()')
        values = [num(r.get(c)) for _, r in months]
        last = max((i for i, v in enumerate(values) if v is not None), default=None)
        if last is None or last < len(values) - 6:
            sys.exit(f'{head}: no value in the last six months')
        series.append({'id': sid, 'name': name, 'group': group, 'benchmark': desc, 'unit': unit, 'values': values})
    first, last = months[0][0], months[-1][0]
    data = {
        'source': {
            'name': 'World Bank Commodity Price Data (The Pink Sheet)',
            'url': 'https://www.worldbank.org/en/research/commodity-markets',
            'file': source_url,
            'license': 'CC BY 4.0',
            'attribution': 'Source: World Bank Commodity Price Data (The Pink Sheet), CC BY 4.0',
        },
        'kind': 'Monthly average prices, nominal US dollars',
        'publisherUpdated': updated.replace('Updated on ', ''),
        'converted': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'start': f'{first[:4]}-{first[5:]}',
        'end': f'{last[:4]}-{last[5:]}',
        'series': series,
    }
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print(f'{out}: {len(series)} series, {data["start"]} to {data["end"]}, publisher update {data["publisherUpdated"]}, {os.path.getsize(out)} bytes')


main()
