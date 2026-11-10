#!/bin/bash
# Runs the stacks suite one arm per benchlock invocation, so other agents get the
# machine between arms. Usage: run-locked.sh <benchlock.sh> [stackId…]
set -u
LOCK="$1"; shift
cd "$(dirname "$0")"
IDS=("$@")
if [ ${#IDS[@]} -eq 0 ]; then IDS=(zero astro next nuxt qwik react-router solidstart sveltekit tanstack-start); fi
T0=$(date +%s)
for id in "${IDS[@]}"; do
  S=$(date +%s)
  "$LOCK" bun bench-stacks.ts "$id"
  echo "### $id: $(( $(date +%s) - S )) s including lock wait"
done
echo "### total wall $(( $(date +%s) - T0 )) s"
