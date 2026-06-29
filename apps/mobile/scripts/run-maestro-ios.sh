#!/bin/sh
set -eu

if [ -z "${JAVA_HOME:-}" ]; then
  detected_java_home=""

  if command -v /usr/libexec/java_home >/dev/null 2>&1; then
    detected_java_home=$(/usr/libexec/java_home -v 17 2>/dev/null || true)
  fi

  if [ -z "$detected_java_home" ] && command -v brew >/dev/null 2>&1; then
    for formula in openjdk@17 openjdk; do
      formula_prefix=$(brew --prefix "$formula" 2>/dev/null || true)
      formula_home="$formula_prefix/libexec/openjdk.jdk/Contents/Home"

      if [ -n "$formula_prefix" ] && [ -d "$formula_home" ]; then
        detected_java_home="$formula_home"
        break
      fi
    done
  fi

  if [ -n "$detected_java_home" ]; then
    export JAVA_HOME="$detected_java_home"
  fi
fi

if [ -n "${JAVA_HOME:-}" ]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro CLI is not installed. Install it from https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli" >&2
  exit 1
fi

exec maestro --platform=ios test --format=HTML --output=../../tmp/maestro-sudoku-smoke .maestro/sudoku-smoke.yaml
