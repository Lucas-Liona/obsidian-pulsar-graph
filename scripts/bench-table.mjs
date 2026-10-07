// Prints a vitest bench JSON report as mean ± sd, which is what a commit
// message should quote: the default table leads with ops/sec and a relative
// margin of error, neither of which says how long one call takes.
//
//   npx vitest bench --run --outputJson bench.json && node scripts/bench-table.mjs bench.json
import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync(process.argv[2] ?? 'bench.json', 'utf8'));
const ms = (value) => (value >= 100 ? value.toFixed(0) : value >= 1 ? value.toFixed(2) : value.toFixed(4));

for (const file of report.files) {
	for (const group of file.groups) {
		console.log(`\n${group.fullName.split(' > ').slice(1).join(' > ')}`);
		for (const result of group.benchmarks) {
			const line = `${ms(result.mean)} ± ${ms(result.sd)} ms`;
			console.log(`  ${result.name.padEnd(34)} ${line.padStart(22)}   p99 ${ms(result.p99).padStart(8)}   n=${result.sampleCount}`);
		}
	}
}
