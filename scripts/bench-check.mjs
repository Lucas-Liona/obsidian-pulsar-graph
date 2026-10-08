// Compares the vitest benches against bench/baseline.json, so a change that
// makes a hot path slower shows up before it ships rather than in a profile.
//
//   npm run bench:check            three runs, their median compared against the baseline
//   npm run bench:record           three runs, written as the new baseline
//   node scripts/bench-check.mjs --runs 1    one run, for a quick look
//
// Three runs by default, folded the same way the baseline was, because one run
// is not enough here: on an unchanged tree a single run once read 50,000 notes'
// newest 3 at +88%, a hair under the flag.
//
// Local only. A shared CI runner's neighbours move these numbers by more than
// the regressions worth catching, and a baseline only means something on the
// machine that recorded it — which is why the machine is recorded with it.
//
// A bench is flagged when its mean is past the baseline's mean by more than
// two of the baseline's standard deviations AND by more than 5%. The first
// alone flags the tightest benches on noise; the second alone flags the
// noisiest ones on every run.
//
// The standard deviation is the larger of two: the spread of single calls
// within the baseline's run, and the spread of the mean between its runs.
// What is compared is one mean against another, and on this machine the mean
// moves between runs by more than single calls suggest: with the first alone,
// an unchanged tree flagged 50,000 notes' pass at +31%, inside the 15-23 ms
// its own three baseline runs had spread over.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'bench', 'baseline.json');
const RECORD_RUNS = 3;
const SDS = 2;
const SLOWER = 0.05;

const args = process.argv.slice(2);
const recording = args.includes('--record');
const runsAt = args.indexOf('--runs');
const runs = runsAt >= 0 ? Math.max(1, Number(args[runsAt + 1]) || 1) : RECORD_RUNS;

const ms = (value) => (value >= 100 ? value.toFixed(0) : value >= 1 ? value.toFixed(2) : value.toFixed(4));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const sd = (values) => {
	if (values.length < 2) {
		return 0;
	}

	const middle = mean(values);
	return Math.sqrt(values.reduce((sum, value) => sum + (value - middle) ** 2, 0) / (values.length - 1));
};

/** What a baseline is only comparable on. Date and commit are kept but not compared. */
function machine() {
	const vitest = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'vitest', 'package.json'), 'utf8')).version;
	// The last commit to change what the benches measure, rather than HEAD:
	// a branch is squashed on merge, and its own commits stop existing.
	const measured = ['src', 'test/vault.ts', 'test/*.bench.ts'];
	const git = spawnSync('git', ['log', '-1', '--format=%H', '--', ...measured], { cwd: ROOT, encoding: 'utf8' });
	const dirty = spawnSync('git', ['status', '--porcelain', '--', ...measured], { cwd: ROOT, encoding: 'utf8' });

	return {
		cpu: cpus()[0]?.model.trim() ?? 'unknown',
		cores: cpus().length,
		memoryGb: Math.round(totalmem() / 2 ** 30),
		os: `${platform()} ${release()}`,
		node: process.version,
		vitest,
		date: new Date().toISOString(),
		commit: `${git.stdout.trim()}${dirty.stdout.trim() ? ' (modified since)' : ''}`
	};
}

const COMPARED = ['cpu', 'cores', 'memoryGb', 'os', 'node', 'vitest'];

/** One pass over every bench: key → { mean, sd, samples } in ms. */
function runOnce(index) {
	const dir = mkdtempSync(join(tmpdir(), 'pulsar-bench-'));
	const out = join(dir, 'bench.json');

	process.stderr.write(`bench run ${index + 1} of ${runs}… `);
	const started = Date.now();
	const result = spawnSync('npx', ['vitest', 'bench', '--run', '--outputJson', out], { cwd: ROOT, encoding: 'utf8' });
	process.stderr.write(`${((Date.now() - started) / 1000).toFixed(1)} s\n`);

	if (result.status !== 0 || !existsSync(out)) {
		process.stderr.write(result.stdout + result.stderr);
		throw new Error(`vitest bench exited with ${result.status}`);
	}

	const report = JSON.parse(readFileSync(out, 'utf8'));
	rmSync(dir, { recursive: true, force: true });

	const benches = new Map();

	for (const file of report.files) {
		for (const group of file.groups) {
			for (const bench of group.benchmarks) {
				const key = [...group.fullName.split(' > '), bench.name].join(' › ');
				benches.set(key, { mean: bench.mean, sd: bench.sd, samples: bench.sampleCount });
			}
		}
	}

	return benches;
}

/**
 * Several runs folded into one: per bench, the run whose mean is the median of
 * the runs' means, with that run's own sd — a real run rather than an average
 * of runs, and one outlying run cannot move it. The spread of the means across
 * runs is kept beside it as the run-to-run noise.
 */
function fold(passes) {
	const keys = new Set(passes.flatMap((pass) => [...pass.keys()]));
	const folded = {};

	for (const key of [...keys].sort()) {
		const seen = passes.map((pass) => pass.get(key)).filter(Boolean);
		const byMean = [...seen].sort((a, b) => a.mean - b.mean);
		const median = byMean[Math.floor((byMean.length - 1) / 2)];
		const means = seen.map((bench) => bench.mean);
		const noise = sd(means);

		folded[key] = {
			mean: median.mean,
			sd: median.sd,
			samples: median.samples,
			runs: seen.length,
			means,
			noiseSd: noise,
			noiseRelative: noise / mean(means)
		};
	}

	return folded;
}

function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const passes = Array.from({ length: runs }, (_, index) => runOnce(index));
const now = fold(passes);

if (recording) {
	const relative = Object.values(now).map((bench) => bench.noiseRelative);
	const baseline = {
		comment: 'Written by `npm run bench:record`. Per bench, the median of the runs by mean, with that run\'s sd (ms per call); noiseSd and noiseRelative are the spread of the runs\' means. Local only: compare on the machine below.',
		machine: machine(),
		runs,
		noise: {
			medianRelative: median(relative),
			maxRelative: Math.max(...relative)
		},
		benches: now
	};

	mkdirSync(dirname(BASELINE), { recursive: true });
	writeFileSync(BASELINE, `${JSON.stringify(baseline, null, '\t')}\n`);

	console.log(`\nRecorded ${Object.keys(now).length} benches over ${runs} runs to bench/baseline.json.`);
	console.log(`Run-to-run noise in the mean: median ${(baseline.noise.medianRelative * 100).toFixed(1)}%, worst ${(baseline.noise.maxRelative * 100).toFixed(1)}%.\n`);

	const width = Math.max(...Object.keys(now).map((key) => key.length));
	for (const [key, bench] of Object.entries(now)) {
		console.log(`  ${key.padEnd(width)}   ${`${ms(bench.mean)} ± ${ms(bench.sd)} ms`.padStart(22)}   noise ${(bench.noiseRelative * 100).toFixed(1).padStart(5)}%`);
	}

	process.exit(0);
}

if (!existsSync(BASELINE)) {
	console.error('No bench/baseline.json yet. Record one with `npm run bench:record`.');
	process.exit(2);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const here = machine();
const differs = COMPARED.filter((field) => String(baseline.machine?.[field]) !== String(here[field]));

if (differs.length > 0) {
	console.warn('\n!!! This is not the machine the baseline was recorded on. The comparison below means little.');
	for (const field of differs) {
		console.warn(`!!!   ${field}: baseline ${baseline.machine?.[field]}, here ${here[field]}`);
	}
	console.warn('!!! Record a baseline here with `npm run bench:record` before reading anything into it.\n');
}

const rows = [];
let flagged = 0;

for (const [key, base] of Object.entries(baseline.benches)) {
	const current = now[key];

	if (!current) {
		rows.push([key, `${ms(base.mean)} ± ${ms(base.sd)}`, 'missing', '', 'GONE']);
		continue;
	}

	const change = current.mean / base.mean - 1;
	const spread = Math.max(base.sd, base.noiseSd ?? 0);
	const slower = current.mean > base.mean + SDS * spread && change > SLOWER;

	if (slower) {
		flagged++;
	}

	rows.push([
		key,
		`${ms(base.mean)} ± ${ms(spread)}`,
		`${ms(current.mean)} ± ${ms(current.sd)}`,
		`${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`,
		slower ? 'SLOWER' : ''
	]);
}

for (const key of Object.keys(now)) {
	if (!(key in baseline.benches)) {
		rows.push([key, 'missing', `${ms(now[key].mean)} ± ${ms(now[key].sd)}`, '', 'NEW']);
	}
}

const headings = ['bench', 'baseline ms', 'now ms', 'change', 'flag'];
const widths = headings.map((heading, column) => Math.max(heading.length, ...rows.map((row) => row[column].length)));
const line = (cells) => cells.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))).join('   ');

console.log(`\n${line(headings)}`);
console.log(widths.map((width) => '-'.repeat(width)).join('   '));
for (const row of rows) {
	console.log(line(row));
}

const missing = rows.filter((row) => row[4] === 'GONE' || row[4] === 'NEW').length;
if (missing > 0) {
	console.warn(`\n${missing} bench(es) on one side only. Re-record the baseline if the benches themselves changed.`);
}

console.log(`\nFlagged: a mean past baseline + ${SDS} sd and more than ${SLOWER * 100}% slower, the baseline's sd being the larger of its calls' and its runs'. Baseline ${baseline.machine?.date ?? '?'} at ${baseline.machine?.commit ?? '?'}.`);

if (flagged > 0) {
	console.error(`${flagged} bench(es) slower than the baseline.`);
	process.exit(1);
}

console.log('Nothing slower than the baseline.');
