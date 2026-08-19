#!/bin/sh
# Both suites run the parser sliced straight out of the shipped .user.js, so they
# exercise the code that ships rather than a copy of it. They need a local
# capture -- see fixtures/expectations.example.json -- and report themselves as
# SKIPPED, never as passing, when one is not configured.
set -e
d=$(dirname "$0")
echo "--- single turn (protocol depth) ---"; node "$d/test-fixture.cjs"   "$1"
echo "--- multi turn (freeze, catch-ups) ---"; node "$d/test-multiturn.cjs" "$2"
