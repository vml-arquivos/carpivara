#!/usr/bin/env bash
# Uso: ./run-suite2.sh <rótulo> <arquivo1> ... — limpa o banco antes de CADA arquivo (contaminação gera falha falsa).
cd /home/ubuntu/dev/bl-buscar || exit 1
export TEST_DATABASE_URL='postgresql://postgres:test@127.0.0.1:5432/blbuscar_test'
label="$1"; shift
for t in "$@"; do
  sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS blbuscar_test;" -c "CREATE DATABASE blbuscar_test;" >/dev/null 2>&1
  f="apps/api/test/${t}.test.mjs"
  if [ ! -f "$f" ]; then echo "$t|ARQUIVO NAO ENCONTRADO"; continue; fi
  out="/tmp/s2_${label}_${t}.txt"
  node --test "$f" > "$out" 2>&1
  total=$(grep -E '^# tests ' "$out" | tail -1 | awk '{print $3}')
  pass=$(grep -E '^# pass ' "$out" | tail -1 | awk '{print $3}')
  fail=$(grep -E '^# fail ' "$out" | tail -1 | awk '{print $3}')
  canc=$(grep -E '^# cancelled ' "$out" | tail -1 | awk '{print $3}')
  names=$(grep -E '^not ok [0-9]+ - ' "$out" | sed 's/^not ok [0-9]* - //' | head -8 | paste -sd ' || ' -)
  echo "$t|total=${total:-?}|pass=${pass:-?}|fail=${fail:-?}|cancelled=${canc:-0}|${names}"
done
