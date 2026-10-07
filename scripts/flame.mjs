// Turns a V8 .cpuprofile into folded stacks, the input flamegraph.pl and
// speedscope both read, or into a table of where the time went.
//
//   node scripts/flame.mjs profile.cpuprofile            > profile.folded
//   node scripts/flame.mjs profile.cpuprofile --top 15
//   node scripts/flame.mjs profile.cpuprofile --only pulsar-graph > plugin.folded
//
// A profile is recorded from inside Obsidian through the DevTools protocol;
// the probe skill holds the script. Each sample is weighted by the time it
// actually covered rather than counted, because V8 does not sample evenly.
import { readFileSync } from 'node:fs';

const [file, ...rest] = process.argv.slice(2);
if (!file) {
	console.error('usage: node scripts/flame.mjs <file.cpuprofile> [--top N] [--only <url fragment>]');
	process.exit(1);
}

const option = (name) => {
	const at = rest.indexOf(name);
	return at < 0 ? undefined : rest[at + 1];
};

const top = option('--top');
const only = option('--only');
const profile = JSON.parse(readFileSync(file, 'utf8'));

const byId = new Map(profile.nodes.map((node) => [node.id, node]));
const parent = new Map();
for (const node of profile.nodes) {
	for (const child of node.children ?? []) {
		parent.set(child, node.id);
	}
}

const label = (node) => {
	const frame = node.callFrame;
	const name = frame.functionName || '(anonymous)';
	const where = frame.url ? frame.url.split('/').pop() : '';
	return where ? `${name} [${where}]` : name;
};

// Microseconds each sample stood for: the gap to the next one.
const weights = new Map();
const deltas = profile.timeDeltas ?? [];
profile.samples.forEach((id, index) => {
	const covered = deltas[index + 1] ?? deltas[index] ?? 0;
	weights.set(id, (weights.get(id) ?? 0) + covered);
});

const stacks = new Map();
const self = new Map();
const inclusive = new Map();

for (const [id, micros] of weights) {
	const frames = [];
	for (let at = id; at !== undefined; at = parent.get(at)) {
		const node = byId.get(at);
		if (node.callFrame.functionName === '(root)') {
			break;
		}
		frames.push(node);
	}
	frames.reverse();

	if (only && !frames.some((node) => node.callFrame.url.includes(only))) {
		continue;
	}

	const names = frames.map(label);
	const key = names.join(';') || '(root)';
	stacks.set(key, (stacks.get(key) ?? 0) + micros);

	const leaf = names[names.length - 1] ?? '(root)';
	self.set(leaf, (self.get(leaf) ?? 0) + micros);
	for (const name of new Set(names)) {
		inclusive.set(name, (inclusive.get(name) ?? 0) + micros);
	}
}

if (top) {
	const total = [...stacks.values()].reduce((sum, micros) => sum + micros, 0);
	const rows = [...inclusive].sort((a, b) => b[1] - a[1]).slice(0, Number(top));
	console.log(`total ${(total / 1000).toFixed(1)} ms sampled`);
	console.log('inclusive ms   self ms   function');
	for (const [name, micros] of rows) {
		const own = self.get(name) ?? 0;
		console.log(`${(micros / 1000).toFixed(1).padStart(12)} ${(own / 1000).toFixed(1).padStart(9)}   ${name}`);
	}
} else {
	for (const [key, micros] of stacks) {
		console.log(`${key} ${Math.round(micros)}`);
	}
}
