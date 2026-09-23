#!/bin/sh
# Menggabungkan assets/core.js + apps-script/adapter.gs.js menjadi apps-script/Code.gs
cd "$(dirname "$0")"
{
  echo "/* Asrama Mandalika - server Google Apps Script."
  echo " * File ini dibuat dari assets/core.js + apps-script/adapter.gs.js."
  echo " * Salin SELURUH isi file ini ke Code.gs di editor Apps Script. */"
  echo
  cat assets/core.js
  cat apps-script/adapter.gs.js
} > apps-script/Code.gs
echo "apps-script/Code.gs diperbarui"
