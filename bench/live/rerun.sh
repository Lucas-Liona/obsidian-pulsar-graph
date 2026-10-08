#!/usr/bin/env bash
# The one-session rerun: Pulsar off / 1.38.0 / 1.39.0 / 1.40.0 side by side,
# interleaved by round with the order rotated, every run kept, each run's
# build hash, window, display, power and GPU saved beside it (RR-*.meta.json).
# As run on 7 October 2026, 22:47–23:20, with the paths turned into variables
# and the window juggling (opening and closing the bench vault from another
# window) left to whoever runs it.
#
# Before running: the bench vault (genvault.py, grown to 20,000 notes) and the
# demo vault each open in a window of their own, Pulsar installed in both, and
# nothing else of yours open in them. The script copies builds and a settings
# file into their plugin folders, so do not point it at a vault you care about.
#
#   OBSIDIAN, PULSAR_LIVE, PULSAR_PROF_OUT   as in pp.sh
#   BENCH_PLUGIN_DIR, DEMO_PLUGIN_DIR        each vault's .obsidian/plugins/pulsar-graph
#   BENCH_SETTINGS                           the data.json to measure the bench with
#   MAIN_138, MAIN_139, MAIN_140             each release's main.js
#
#   PHASES="A B C D" bash rerun.sh
set -u
: "${BENCH_PLUGIN_DIR:?}" "${DEMO_PLUGIN_DIR:?}" "${BENCH_SETTINGS:?}" "${MAIN_138:?}" "${MAIN_139:?}" "${MAIN_140:?}"
HERE=$(cd "$(dirname "$0")" && pwd)
BV=$BENCH_PLUGIN_DIR
DV=$DEMO_PLUGIN_DIR
BENCH=pulsar-bench-vault
DEMO=pulsar-demo-vault
PHASES=${PHASES:-"A B C D"}
declare -A MAIN=([138]=$MAIN_138 [139]=$MAIN_139 [140]=$MAIN_140)

say() { echo "[$(date +%H:%M:%S)] $*"; }
pp() { timeout "${T:-150}" "$HERE/pp.sh" "$1"; }
load() { # vault dir build
	pp "{\"cmd\":\"disable\",\"vault\":\"$1\"}" >/dev/null
	if [ "$3" != off ]; then
		cp "${MAIN[$3]}" "$2/main.js"
		T=120 pp "{\"cmd\":\"enable\",\"vault\":\"$1\",\"expect\":1,\"raw\":true}" >/dev/null
		sleep 4
	fi
}
meta() { echo "  meta $(pp "{\"cmd\":\"meta\",\"vault\":\"$1\",\"label\":\"$2\"}")"; }

if [[ $PHASES == *A* || $PHASES == *B* ]]; then
	say "bench: settings copied in"
	cp "$BENCH_SETTINGS" "$BV/data.json"
	T=700 pp "{\"cmd\":\"benchsetup\",\"vault\":\"$BENCH\",\"focus\":true}"
	pp "{\"cmd\":\"guard\",\"vault\":\"$BENCH\"}"
fi

if [[ $PHASES == *A* ]]; then
	say "A: opening the global graph, 20k notes, 6 rounds"
	orders=("off 138 139 140" "138 139 140 off" "139 140 off 138" "140 off 138 139" "off 138 139 140" "138 139 140 off")
	for r in 1 2 3 4 5 6; do
		for b in ${orders[$((r - 1))]}; do
			load $BENCH "$BV" $b
			meta $BENCH "RR-open-$b-$r"
			echo "  $(T=200 pp "{\"cmd\":\"opengraph\",\"vault\":\"$BENCH\",\"label\":\"RR-open-$b-$r\",\"limit\":120000}")"
		done
	done
fi

if [[ $PHASES == *B* ]]; then
	say "B: note switches, 20k notes, 3 rounds, fresh graph per build"
	orders=("138 139 140" "139 140 138" "140 138 139")
	for r in 1 2 3; do
		for b in ${orders[$((r - 1))]}; do
			load $BENCH "$BV" $b
			echo "  $(T=200 pp "{\"cmd\":\"opengraph\",\"vault\":\"$BENCH\",\"label\":\"RR-swopen-$b-$r\",\"limit\":120000}")"
			for which in in out; do
				echo "  $(pp "{\"cmd\":\"opentwo\",\"vault\":\"$BENCH\",\"which\":\"$which\"}")"
				pp "{\"cmd\":\"switches\",\"vault\":\"$BENCH\",\"label\":\"RR-swwarm-$which-$b-$r\",\"n\":2}" >/dev/null
				echo "  $(T=100 pp "{\"cmd\":\"settle\",\"vault\":\"$BENCH\",\"limit\":90000}")"
				meta $BENCH "RR-sw-$which-$b-$r"
				echo "  $(pp "{\"cmd\":\"switches\",\"vault\":\"$BENCH\",\"label\":\"RR-sw-$which-$b-$r\",\"n\":20}")"
			done
		done
	done
fi

if [[ $PHASES == *A* || $PHASES == *B* ]]; then
	say "bench: unguard, settings and history removed, 1.40.0 put back"
	pp "{\"cmd\":\"unguard\",\"vault\":\"$BENCH\"}"
	rm -f "$BV/data.json" "$BV/history.json"
	cp "${MAIN[140]}" "$BV/main.js"
fi

if [[ $PHASES == *C* ]]; then
	say "C: timelapse at rest, demo, 2 rounds"
	pp "{\"cmd\":\"guard\",\"vault\":\"$DEMO\",\"blockData\":true,\"focus\":true}"
	echo "  $(T=90 pp "{\"cmd\":\"timelapse\",\"vault\":\"$DEMO\",\"start\":true,\"sec\":40}")"
	orders=("off 138 139 140" "140 139 138 off")
	for r in 1 2; do
		for b in ${orders[$((r - 1))]}; do
			load $DEMO "$DV" $b
			sleep 5
			meta $DEMO "RR-tl-$b-$r"
			echo "  $(T=60 pp "{\"cmd\":\"awake\",\"vault\":\"$DEMO\",\"label\":\"RR-tl-$b-$r\",\"sec\":20,\"noprof\":true}")"
		done
	done
	echo "  $(T=30 pp "{\"cmd\":\"timelapse\",\"vault\":\"$DEMO\",\"stop\":true}")"
fi

if [[ $PHASES == *D* ]]; then
	say "D: editor reconfigurations per load, demo"
	pp "{\"cmd\":\"guard\",\"vault\":\"$DEMO\",\"blockData\":true}"
	for mode in first own; do
		for b in 138 139 140; do
			load $DEMO "$DV" $b
			meta $DEMO "RR-uo-$mode-$b"
			first=false; [ $mode = first ] && first=true
			echo "  $(HARNESS=reconfigure.mjs T=120 pp "{\"vault\":\"$DEMO\",\"label\":\"RR-uo-$mode-$b\",\"first\":$first,\"n\":10}")"
		done
	done
	pp "{\"cmd\":\"unguard\",\"vault\":\"$DEMO\"}"
fi
say "done"
