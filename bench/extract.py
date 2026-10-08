"""Builds bench/results/ from the live harness's raw run files.

    python3 bench/extract.py <runs dir> bench/results

<runs dir> holds one folder per vault (pulsar-bench-vault, pulsar-demo-vault,
and the author's own vault), each full of the JSON files the harness wrote:
one per run, every sample kept. Nothing here is computed beyond reshaping:
means and standard deviations are left to the notebook, so that what it
prints can be checked against these files and nothing else.

The author's vault is the exception. Its raw files stay on the machine they
were made on; only aggregate rows (mean, sd, n, counts) come out of it, into
authors-vault.csv, and nothing that names a note, a folder or a plugin.

CPU profiles are folded into stacks (one line per distinct stack, weighted by
the microseconds each sample covered) with idle time dropped, file paths cut
to their last segment, and gzipped.
"""
import csv
import gzip
import json
import os
import re
import sys

RUNS, OUT = sys.argv[1], sys.argv[2]
BENCH = os.path.join(RUNS, 'pulsar-bench-vault')
DEMO = os.path.join(RUNS, 'pulsar-demo-vault')
OWN = os.path.join(RUNS, 'Obsidian-Vault')

BUILD = {'off': 'Pulsar off', '138': '1.38.0', '139': '1.39.0', '140': '1.40.0'}


def load(folder, label):
    with open(os.path.join(folder, f'{label}.json')) as f:
        return json.load(f)


def write(name, header, rows):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(header)
        for row in rows:
            w.writerow([fmt(x) for x in row])
    print(f'{name}: {len(rows)} rows')


def fmt(x):
    if isinstance(x, float):
        return f'{x:.4f}'.rstrip('0').rstrip('.') if x == x else ''
    if isinstance(x, bool):
        return 'true' if x else 'false'
    return '' if x is None else x


# ---------------------------------------------------------------- the rerun

def rerun():
    metas = []
    for folder, vault in ((BENCH, 'bench'), (DEMO, 'demo')):
        for name in sorted(os.listdir(folder)):
            if name.startswith('RR-') and name.endswith('.meta.json'):
                m = load(folder, name[:-len('.json')])
                metas.append((vault, m))

    def parse(label):
        parts = label.split('-')
        test = parts[1]
        if test in ('open', 'tl'):
            return test, parts[2], int(parts[3]), ''
        if test == 'sw':
            return test, parts[3], int(parts[4]), parts[2]
        if test == 'uo':
            return test, parts[3], 0, parts[2]
        return test, '', 0, ''

    rows = []
    for vault, m in metas:
        test, build, rnd, variant = parse(m['label'])
        gpu = m.get('gpu') or []
        rows.append([m['label'], vault, test, BUILD.get(build, build), rnd, variant, m['at'], m['mainSha256'],
                     m['enabled'], m['loaded'], m['window']['focused'], m['window']['visible'], m['window']['minimized'],
                     m['window']['width'], m['window']['height'], m['display']['hz'], m['display']['scale'],
                     m['onBattery'], any(g.get('active') for g in gpu), len(gpu), m['cpu']['model'].strip(),
                     m['cpu']['threads'], m['memFreeGB'], m['otherObsidianCores'],
                     ';'.join(f"{g['type']}:{g['nodes']}" for g in m['graphs'])])
    rows.sort(key=lambda r: r[6])
    write('rerun/runs.csv', ['label', 'vault', 'test', 'build', 'round', 'variant', 'at_utc', 'main_sha256', 'enabled',
                             'loaded', 'focused', 'visible', 'minimized', 'window_w', 'window_h', 'display_hz',
                             'display_scale', 'on_battery', 'gpu_marked_active', 'gpu_adapters', 'cpu', 'threads',
                             'mem_free_gb', 'other_obsidian_cores', 'graphs_drawn'], rows)

    at = {m['label']: m['at'] for _, m in metas}

    # Opening the global graph. RR-open-* are the timed runs, in rotated order;
    # RR-swopen-* opened a fresh graph before each build's note switches and
    # are kept as a cross-check, not used for the headline.
    rows = []
    for name in sorted(os.listdir(BENCH)):
        g = re.match(r'RR-(open|swopen)-(\w+)-(\d)\.json$', name)
        if not g:
            continue
        d = load(BENCH, name[:-5])
        rows.append([d['label'], 'timed' if g[1] == 'open' else 'before switches', BUILD[g[2]], int(g[3]),
                     at.get(d['label'], ''), d['firstNodes'], d['toFirstNodes'], ';'.join(map(str, d['nodesOver3s'])),
                     d['settledMs'], d['blockedFirst10s'], d['blockedTotal']])
    write('rerun/open.csv', ['label', 'purpose', 'build', 'round', 'at_utc', 'first_nodes', 'to_first_nodes_ms',
                             'node_counts_first_3s', 'settled_ms', 'blocked_first_10s_ms', 'blocked_ms'], rows)

    # Note switches: 20 measured per build, pair and round, after 2 warm-up
    # switches (RR-swwarm-*), which are kept and flagged.
    rows = []
    for name in sorted(os.listdir(BENCH)):
        g = re.match(r'RR-(sw|swwarm)-(in|out)-(\d+)-(\d)\.json$', name)
        if not g:
            continue
        d = load(BENCH, name[:-5])
        nodes = d['graphsAfter'][0]['nodes'] if d['graphsAfter'] else None
        for i, r in enumerate(d['records']):
            rows.append([d['label'], g[1] == 'swwarm', BUILD[g[3]], g[2], int(g[4]), i + 1, nodes, d['refiltersPerSwitch'],
                         r['long'], r['frame2'], r['frame1'], r['sync']])
    write('rerun/switch.csv', ['label', 'warmup', 'build', 'pair', 'round', 'switch', 'nodes_drawn',
                               'refilters_per_switch', 'blocked_ms', 'second_frame_ms', 'first_frame_ms', 'sync_ms'], rows)

    rows = []
    for name in sorted(os.listdir(DEMO)):
        g = re.match(r'RR-tl-(\w+)-(\d)\.json$', name)
        if not g:
            continue
        d = load(DEMO, name[:-5])
        for i, (cores, awake) in enumerate(zip(d['cpuPerSec'], d['perSec'])):
            rows.append([d['label'], BUILD[g[1]], int(g[2]), i + 1, d['nodes'], cores, awake])
    write('rerun/timelapse.csv', ['label', 'build', 'round', 'second', 'nodes_drawn', 'renderer_cores', 'awake_share'], rows)

    loads, calls = [], []
    for name in sorted(os.listdir(DEMO)):
        g = re.match(r'RR-uo-(first|own)-(\d+)\.json$', name)
        if not g:
            continue
        d = load(DEMO, name[:-5])
        mode = 'defaults' if g[1] == 'first' else 'fresh writing on'
        for i, (n, ms, enable) in enumerate(zip(d['callsPerLoad'], d['callMs'], d['enableMs'])):
            loads.append([d['label'], BUILD[g[2]], mode, i + 1, d['editors'], n, sum(ms), enable])
            for j, one in enumerate(ms):
                calls.append([d['label'], BUILD[g[2]], mode, i + 1, j + 1, one])
    write('rerun/reconfigure-loads.csv', ['label', 'build', 'mode', 'load', 'editors', 'calls', 'calls_ms', 'enable_ms'], loads)
    write('rerun/reconfigure-calls.csv', ['label', 'build', 'mode', 'load', 'call', 'ms'], calls)


# ------------------------------------- the fresh-writing reconfigure, solved

# What a load with fresh writing on pays, with every pending restyle forced and
# timed at a fixed point (bench/live/restyle.mjs), so that no build can slip
# one into an untimed frame. Two comparisons, each the second of two rounds;
# the first rounds were printed and not kept.
RESTYLE = [
    ('UO4-r138-12101', 'orders', '1.38.0'),
    ('UO4-master-12101', 'orders', '1.40.0 code path'),
    ('UO4-after-12101', 'orders', 'properties set after the call'),
    ('UO4-master-25966', 'fix', 'before #125'),
    ('UO4-scope-25966', 'fix', '1.41.0 (#125)'),
]


def restyle():
    rows = []
    for label, comparison, build in RESTYLE:
        d = load(DEMO, label)
        for i in range(len(d['callMs'])):
            calls, before, props = d['callMs'][i], d['flushMs'][i], d['varFlushMs'][i]
            after = d['afterLoadFlushMs'][i]
            rows.append([label, comparison, build, d['mainSha256'], i + 1, d['editors'], len(calls), sum(calls), sum(props),
                         sum(before), after, sum(calls) + sum(props) + sum(before) + after, d['enableMs'][i]])
    write('restyle/loads.csv', ['label', 'comparison', 'build', 'main_sha256', 'load', 'editors', 'calls', 'reconfigure_ms',
                                'restyle_from_properties_ms', 'restyle_pending_before_call_ms', 'restyle_pending_after_load_ms',
                                'total_ms', 'enable_ms'], rows)


# ------------------------------------------------------- the first session

def session1():
    rows = []
    opens = [('FB20k-off', 'Pulsar off', 'FB20k'), ('FB20k-master', '#109', 'FB20k'), ('FB20k-first', '#110', 'FB20k'),
             ('O20k-off', 'Pulsar off', 'O20k'), ('O20k-fix', '#109', 'O20k'), ('O20k-on', 'before #109', 'O20k')]
    for stem, build, series in opens:
        for i in range(1, 7):
            path = os.path.join(BENCH, f'{stem}-{i}.json')
            if not os.path.exists(path):
                continue
            d = load(BENCH, f'{stem}-{i}')
            rows.append([d['label'], series, build, i, d['firstNodes'], d['toFirstNodes'],
                         ';'.join(map(str, d['nodesOver3s'])), d['settledMs'], d['blockedFirst10s'], d['blockedTotal']])
    write('session1/open.csv', ['label', 'series', 'build', 'run', 'first_nodes', 'to_first_nodes_ms',
                                'node_counts_first_3s', 'settled_ms', 'blocked_first_10s_ms', 'blocked_ms'], rows)

    def switches(folder, stems, vault):
        out = []
        for label, build, pair, rnd in stems:
            d = load(folder, label)
            nodes = d['graphsAfter'][0]['nodes'] if d.get('graphsAfter') else None
            for i, r in enumerate(d['records']):
                out.append([label, vault, build, pair, rnd, i + 1, nodes, d.get('refiltersPerSwitch'),
                            r['long'], r['frame2'], r['frame1'], r['sync']])
        return out

    head = ['label', 'vault', 'build', 'pair', 'round', 'switch', 'nodes_drawn', 'refilters_per_switch',
            'blocked_ms', 'second_frame_ms', 'first_frame_ms', 'sync_ms']
    stems = []
    for pair in ('in', 'out'):
        stems += [(f'H20k-release-{pair}', '1.38.0', pair, 1), (f'H20k-fixA-{pair}', '#108', pair, 1),
                  (f'H20k-fixAB-{pair}', '#109', pair, 1)]
        for rnd in (1, 2):
            stems += [(f'R3-{pair}-firstbuild-{rnd}', '#110', pair, rnd), (f'R3-{pair}-onerepaint-{rnd}', '#111', pair, rnd)]
    write('session1/switch-bench.csv', head, switches(BENCH, stems, 'bench 20k'))

    # Time inside each of Pulsar's own handlers per switch (inclusive).
    rows = []
    names = ['applyTo', 'syncRenderers', 'spotlitFrom', 'exemptFromFilter', 'paintTabs', 'keptWithoutOpen',
             'updateStatusBar', 'refreshBeadViews', 'noteSeen']
    for pair in ('in', 'out'):
        for build, stem in (('#110', 'firstbuild'), ('#111', 'onerepaint')):
            for rnd in (1, 2):
                d = load(BENCH, f'R3S-{pair}-{stem}-{rnd}')
                for i, r in enumerate(d['rec']):
                    rows.append([d['label'], build, pair, rnd, i + 1, r['long']] + [r.get(n, 0) for n in names])
    write('session1/switch-handlers.csv', ['label', 'build', 'pair', 'round', 'switch', 'blocked_ms'] + [f'{n}_ms' for n in names], rows)

    stems = []
    for rnd in (1, 2):
        stems += [(f'R3-demo-firstbuild-{rnd}', '#110', 'demo', rnd), (f'R3-demo-onerepaint-{rnd}', '#111', 'demo', rnd)]
    for rnd in (1, 2, 3):
        stems += [(f'AT-demo-rel139-{rnd}', '1.39.0', 'demo', rnd), (f'AT-demo-attention-{rnd}', '#113', 'demo', rnd)]
    write('session1/switch-demo.csv', head, switches(DEMO, stems, 'demo'))

    # 1.38.0 against Pulsar off. Files of this baseline carry the version
    # Obsidian read at startup, which is stale (see T9), so the build is set here.
    stems = [('A-switch-on', '1.38.0', 'demo', 1), ('A-switch-off', 'Pulsar off', 'demo', 1),
             ('B-switch-on', '1.38.0 under the profiler', 'demo', 1), ('B-switch-off', 'Pulsar off under the profiler', 'demo', 1)]
    rows = switches(DEMO, stems, 'demo')
    for size in ('1k', '5k', '20k'):
        rows += switches(BENCH, [(f'{size}-defaults-switch-on', '1.38.0', 'defaults', 1),
                                 (f'{size}-defaults-switch-off', 'Pulsar off', 'defaults', 1)], f'bench {size}')
    for size in ('1k', '20k'):
        rows += switches(BENCH, [(f'{size}-his-switch-on', '1.38.0', "author's settings", 1)], f'bench {size}')
    write('session1/baseline-switch.csv', head, rows)

    rows = []
    frames = [(DEMO, 'C-frame-on', 'demo', '1.38.0'), (DEMO, 'C-frame-off', 'demo', 'Pulsar off')]
    for size in ('1k', '5k', '20k'):
        frames += [(BENCH, f'{size}-defaults-frame-on', f'bench {size}', '1.38.0'),
                   (BENCH, f'{size}-defaults-frame-off', f'bench {size}', 'Pulsar off')]
    frames += [(BENCH, '1k-his-frame-on', 'bench 1k', "1.38.0, author's settings"),
               (BENCH, '20k-his-frame-on', 'bench 20k', "1.38.0, author's settings"),
               (BENCH, 'P-20k-his-frame', 'bench 20k', "1.38.0, author's settings, under the profiler")]
    for folder, label, vault, build in frames:
        d = load(folder, label)
        for i, t in enumerate(d['times']):
            rows.append([label, vault, build, d['nodes'], i + 1, t])
    write('session1/frame.csv', ['label', 'vault', 'build', 'nodes_drawn', 'frame', 'ms'], rows)

    rows = []
    for label, build in (('F1-before', '1.38.0'), ('F1-off', 'Pulsar off'), ('F1-after', '#108'),
                         ('F1-after-replay', '#108, replay restarted')):
        d = load(DEMO, label)
        for i, (cores, awake) in enumerate(zip(d['cpuPerSec'], d['perSec'])):
            rows.append([label, build, i + 1, d['nodes'], cores, awake])
    write('session1/timelapse.csv', ['label', 'build', 'second', 'nodes_drawn', 'renderer_cores', 'awake_share'], rows)

    rows = []
    for run in (1, 2):
        for label, build in ((f'INK-master-{run}', '#113'), (f'INK-inkstatus-{run}', '#114')):
            d = load(DEMO, label)
            for i, t in enumerate(d['times']):
                rows.append([label, build, run, i + 1, t])
    write('session1/keystroke.csv', ['label', 'build', 'round', 'keystroke', 'ms'], rows)

    rows = []
    for mode, key in (('defaults', 'first'), ('demo settings', 'own')):
        for build, stem in (('before #116', 'master'), ('#116', 'inkoff')):
            for run in (1, 2):
                label = f'IO-{key}-{stem}-{run}'
                d = load(DEMO, label)
                for i, r in enumerate(d['records']):
                    rows.append([label, build, mode, run, i + 1, r['enable'], r['ready'], r['frame']])
    for label, mode in (('A-load', 'demo settings'), ('A-first', 'defaults')):
        d = load(DEMO, label)
        for i, r in enumerate(d['records']):
            rows.append([label, '1.38.0', mode, 1, i + 1, r['enable'], r['ready'], r['frame']])
    write('session1/load-demo.csv', ['label', 'build', 'mode', 'round', 'load', 'enable_ms', 'ready_ms', 'frame_ms'], rows)

    d = load(DEMO, 'C-loadparts')
    rows = []
    for i, cycle in enumerate(d['cycles']):
        for step, ms in sorted(cycle.items()):
            rows.append(['C-loadparts', '1.38.0', i + 1, step, ms])
    write('session1/loadparts-demo.csv', ['label', 'build', 'load', 'step', 'ms'], rows)

    rows = []
    for label, build in (('A-components', '1.38.0'),):
        d = load(DEMO, label)
        for step, s in d['result'].items():
            rows.append([label, 'demo', build, step, s['batch'], s['n'], s['mean'], s['sd'], s['median']])
    for size in ('1k', '5k', '20k'):
        for kind in ('defaults', 'his'):
            label = f'{size}-{kind}-components'
            if not os.path.exists(os.path.join(BENCH, label + '.json')):
                continue
            d = load(BENCH, label)
            for step, s in d['result'].items():
                rows.append([label, f'bench {size}', '1.38.0', step, s['batch'], s['n'], s['mean'], s['sd'], s['median']])
    write('session1/components.csv', ['label', 'vault', 'build', 'step', 'calls_per_sample', 'n', 'mean_ms', 'sd_ms', 'median_ms'], rows)

    # #111 had to leave every node drawn exactly as before: each node's
    # colour, alpha (x 1e4, rounded) and drawn tint after a settled switch,
    # snapshotted under #110 and #111 for both notes of both pairs.
    rows = []
    for pair in ('in', 'out'):
        for rnd in (1, 2):
            for note in ('first', 'second'):
                a = load(BENCH, f'paint-{pair}-firstbuild-{rnd}-{note}')
                b = load(BENCH, f'paint-{pair}-onerepaint-{rnd}-{note}')
                differ = sum(1 for x, y in zip(a, b) if x != y) + abs(len(a) - len(b))
                rows.append([pair, rnd, note, len(a), len(b), differ])
    write('session1/paint-compare.csv', ['pair', 'round', 'note', 'nodes_110', 'nodes_111', 'nodes_differing'], rows)

    # When each first-session run finished. Those files carry no timestamp of
    # their own, so this is the file's modification time, in UTC.
    rows = []
    import datetime
    for folder, vault in ((BENCH, 'bench'), (DEMO, 'demo')):
        for name in sorted(os.listdir(folder)):
            if name.endswith('.json') and re.match(r'(FB20k|O20k|H20k|R3S?|P-?20k|S20k|\d+k|[ABC]|F1|INK|IO|AT)-', name):
                t = datetime.datetime.fromtimestamp(os.path.getmtime(os.path.join(folder, name)), datetime.timezone.utc)
                rows.append([name[:-5], vault, t.strftime('%Y-%m-%dT%H:%M:%SZ')])
    write('session1/files.csv', ['label', 'vault', 'modified_utc'], rows)


# ------------------------------------------- the author's vault, aggregates

def authors_vault():
    rows = []

    def stat(values):
        n = len(values)
        mean = sum(values) / n
        sd = (sum((v - mean) ** 2 for v in values) / (n - 1)) ** 0.5 if n > 1 else 0.0
        s = sorted(values)
        return n, mean, sd, s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2

    def add(metric, build, label, values, unit='ms', graphs=''):
        n, mean, sd, median = stat(values)
        rows.append([metric, build, unit, n, mean, sd, median, label, graphs])

    def drawn(d):
        return ';'.join(f"{g['type']}:{g['nodes']}{'' if g['drawing'] else ' (hidden)'}" for g in d['graphsBefore'])

    for label, build in (('A-switch-on', '1.38.0'), ('A-switch-off', 'Pulsar off'),
                         ('B-switch-on', '1.38.0 under the profiler'), ('B-switch-off', 'Pulsar off under the profiler'),
                         ('H-switch-release', '1.38.0'), ('H-switch-fixA', '#108'), ('H-switch-fixAB', '#109')):
        d = load(OWN, label)
        add('note switch, second frame', build, label, [r['frame2'] for r in d['records']], graphs=drawn(d))
        add('note switch, blocked', build, label, [r['long'] for r in d['records']], graphs=drawn(d))
    for label, build in (('C-frame-on-1115', '1.38.0, filter off in memory'), ('C-frame-off-1115', 'Pulsar off')):
        d = load(OWN, label)
        add(f"one frame of a moving graph, {d['nodes']} nodes", build, label, d['times'], graphs=f"graph:{d['nodes']}")
    d = load(OWN, 'C-loadparts')
    for step in ('enablePlugin (total)', 'onload (until done)', 'history.load (until done)', 'syncRenderers', 'attach',
                 'api.workspace.updateOptions', 'api.registerEditorExtension', 'syncInk', 'applyTo'):
        add(f'plugin load: {step}', '1.38.0', 'C-loadparts', [c.get(step, 0) for c in d['cycles']])
    for label, build in (('G-components-before', '1.38.0'), ('G-components-after', '#108')):
        d = load(OWN, label)
        for step in ('refilter', 'syncRenderers'):
            s = d['result'][step]
            rows.append([f'one call: {step}', build, 'ms', s['n'], s['mean'], s['sd'], s['median'], label, ''])
        graph = [g['nodes'] for g in d['graphs'] if g['type'] == 'graph']
        rows.append(['global graph nodes drawn, filter on', build, 'nodes', 1, graph[0], 0, graph[0], label, ''])
    d = load(OWN, 'A-switch-off')
    graph = [g['nodes'] for g in d['graphsBefore'] if g['type'] == 'graph']
    rows.append(['global graph nodes, no filter', 'Pulsar off', 'nodes', 1, graph[0], 0, graph[0], 'A-switch-off', ''])
    # The panel's dropdown, from the load profile: time under Obsidian's
    # addDropdown per load, and the part of it spent reading offsetWidth.
    stacks, _, _ = fold(os.path.join(OWN, 'B-load.cpuprofile'))
    under = sum(us for k, us in stacks.items() if 'e.addDropdown' in k)
    layout = sum(us for k, us in stacks.items() if 'e.addDropdown' in k and k.endswith('get offsetWidth'))
    rows.append(['plugin load, under the profiler: time under addDropdown', '1.38.0', 'ms per load', 11, under / 11000, '', '', 'B-load', ''])
    rows.append(['plugin load, under the profiler: of which reading offsetWidth', '1.38.0', 'ms per load', 11, layout / 11000, '', '', 'B-load', ''])
    reads = ('getBoundingClientRect', 'getClientRects', 'get offsetWidth', 'get offsetHeight', 'getComputedStyle')
    other = sum(us for k, us in stacks.items() if 'e.addDropdown' not in k and k.split(';')[-1] in reads)
    rows.append(['plugin load, under the profiler: every other layout read', '1.38.0', 'ms per load', 11, other / 11000, '', '', 'B-load', ''])
    write('authors-vault.csv', ['metric', 'build', 'unit', 'n', 'mean', 'sd', 'median', 'source_label', 'graphs_open'], rows)


# ---------------------------------------------------------- CPU profiles

PROFILES = [
    # name, vault folder, label, what one event is, how many, build
    ('demo-switch-on', DEMO, 'B-switch-on', 'note switch', 32, '1.38.0'),
    ('demo-switch-off', DEMO, 'B-switch-off', 'note switch', 32, 'Pulsar off'),
    ('demo-timelapse-on', DEMO, 'B-idle-on', 'second at rest', 65, '1.38.0'),
    ('demo-timelapse-off', DEMO, 'B-idle-off', 'second at rest', 65, 'Pulsar off'),
    ('demo-load', DEMO, 'B-load', 'plugin load', 11, '1.38.0'),
    ('bench-switch', BENCH, 'P20k-fixAB-in', 'note switch', 14, '#109'),
    ('bench-frame', BENCH, 'P-20k-his-frame', 'frame', 131, '1.38.0'),
]


def segment(url):
    if not url:
        return ''
    if url.startswith('app://obsidian.md/') or url.startswith('plugin:'):
        return url.split('/')[-1] if not url.startswith('plugin:') else url
    return re.split(r'[\\/]', url)[-1]


def fold(path):
    with open(path) as f:
        p = json.load(f)
    nodes = {n['id']: n for n in p['nodes']}
    # A frame can lose its URL when its script was compiled lazily; the
    # script id still says which file it came from.
    by_script = {}
    for n in p['nodes']:
        cf = n['callFrame']
        if cf['url'] and cf['scriptId'] != '0':
            by_script[cf['scriptId']] = cf['url']
    parent = {}
    for n in p['nodes']:
        for c in n.get('children', []):
            parent[c] = n['id']
    weight = {}
    deltas = p.get('timeDeltas', [])
    for i, s in enumerate(p['samples']):
        covered = deltas[i + 1] if i + 1 < len(deltas) else (deltas[i] if i < len(deltas) else 0)
        weight[s] = weight.get(s, 0) + covered
    stacks = {}
    idle = 0
    for nid, us in weight.items():
        if us <= 0:
            continue
        names = []
        x = nid
        while x in nodes:
            cf = nodes[x]['callFrame']
            if cf['functionName'] != '(root)':
                url = cf['url'] or by_script.get(cf['scriptId'], '')
                where = segment(url)
                name = cf['functionName'] or '(anonymous)'
                names.append(f'{name} [{where}]' if where else name)
            x = parent.get(x)
        names.reverse()
        if names and names[-1] == '(idle)':
            idle += us
            continue
        key = ';'.join(names) or '(root)'
        stacks[key] = stacks.get(key, 0) + us
    return stacks, idle, (p['endTime'] - p['startTime'])


def profiles(src):
    rows = []
    for name, folder, label, event, events, build in PROFILES:
        path = os.path.join(src, os.path.basename(folder), f'{label}.cpuprofile')
        stacks, idle, duration = fold(path)
        text = ''.join(f'{k} {round(v)}\n' for k, v in sorted(stacks.items()))
        assert 'Users' not in text and '.md' not in text, name
        out = os.path.join(OUT, 'flame', f'{name}.folded.gz')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with gzip.GzipFile(out, 'wb', mtime=0) as f:
            f.write(text.encode())
        rows.append([name, label, 'bench 20k' if folder == BENCH else 'demo', build, event, events,
                     round(sum(stacks.values()) / 1000, 1), round(idle / 1000, 1), round(duration / 1e6, 2)])
    write('flame/profiles.csv', ['profile', 'source_label', 'vault', 'build', 'event', 'events', 'busy_ms', 'idle_ms', 'duration_s'], rows)


# Each part runs only when its raw files are there, so a rerun elsewhere can
# rebuild rerun/ without the first session or the author's vault.
if os.path.exists(os.path.join(BENCH, 'RR-open-off-1.json')):
    rerun()
if all(os.path.exists(os.path.join(DEMO, f'{label}.json')) for label, *_ in RESTYLE):
    restyle()
if os.path.exists(os.path.join(BENCH, 'FB20k-off-1.json')):
    session1()
if os.path.isdir(OWN):
    authors_vault()
if all(os.path.exists(os.path.join(folder, f'{label}.cpuprofile')) for _, folder, label, *_ in PROFILES):
    profiles(RUNS)
