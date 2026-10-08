"""Grows the benchmark vault to N notes. Deterministic: note i and its links
are the same whatever N is, so growing 1k -> 5k -> 20k keeps earlier notes.
Titles are numbers; contents are one line and some links; nothing personal.

    python3 genvault.py <vault folder> 20000

Links are chosen by preferential attachment (1 to 4 per note after the first),
and each note's age is exponential with a 90-day mean, capped at two years,
counted back from the moment the script runs: ages are reproducible, dates
are not. Notes go in 20 folders, "area 00" to "area 19"."""
import os, random, sys, time, math
root = sys.argv[1]; target = int(sys.argv[2])
notes = os.path.join(root, 'notes')
os.makedirs(notes, exist_ok=True)
rng = random.Random(20261007)
now = time.time()
pool = []            # each note once, plus once per link it has received
links = []
ages = []
for i in range(target):
    k = 0 if i == 0 else min(i, rng.choice([1, 1, 2, 2, 3, 4]))
    chosen = set()
    while len(chosen) < k:
        chosen.add(rng.choice(pool))   # preferential attachment, O(1)
    pool.extend(chosen)
    pool.append(i)
    links.append(sorted(chosen))
    ages.append(min(730.0, rng.expovariate(1 / 90.0)))   # days since last edit
made = 0
for i in range(target):
    folder = os.path.join(notes, f'area {i % 20:02d}')
    path = os.path.join(folder, f'Note {i:05d}.md')
    if os.path.exists(path): continue
    os.makedirs(folder, exist_ok=True)
    with open(path, 'w') as f:
        f.write(f'Note {i}.\n\n' + ' '.join(f'[[Note {j:05d}]]' for j in links[i]) + '\n')
    t = now - ages[i] * 86400
    os.utime(path, (t, t))
    made += 1
print('made', made, 'total', target)
