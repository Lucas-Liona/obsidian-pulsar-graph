#!/usr/bin/env bash
# pp.sh '<json>' : runs one harness command in the window of the vault named in
# the json, and prints the summary it returns. The full record is written to
# $PULSAR_PROF_OUT/runs/<vault>/<label>.json.
#
#   OBSIDIAN          Obsidian's CLI (Obsidian.com on Windows; installer 1.12.7+,
#                     with Settings → General → Command line interface on)
#   PULSAR_LIVE       this folder, as the Obsidian process sees it
#   PULSAR_PROF_OUT   where run files go, as the Obsidian process sees it
#
#   pp.sh '{"cmd":"meta","vault":"pulsar-bench-vault","label":"try-1"}'
set -eu
: "${OBSIDIAN:?set OBSIDIAN to Obsidian's CLI}"
: "${PULSAR_LIVE:?set PULSAR_LIVE to this folder as Obsidian sees it}"
: "${PULSAR_PROF_OUT:?set PULSAR_PROF_OUT to an output folder as Obsidian sees it}"
args=$(printf '%s' "$1" | sed "s|}\$|,\"file\":\"$PULSAR_LIVE/${HARNESS:-harness.mjs}\"}|")
"$OBSIDIAN" eval code="globalThis.__ppOut='$PULSAR_PROF_OUT';globalThis.__pr=$args;eval(require('fs').readFileSync('$PULSAR_LIVE/relay.mjs','utf8'))"
