#!/usr/bin/env bash
set -euo pipefail

rm -rf dist

mkdir -p \
  dist/stage/controller \
  dist/stage/i18n \
  dist/stage/view

cp index.html Component.js manifest.json xs-app.json dist/stage/
cp -R controller/. dist/stage/controller/
cp -R i18n/. dist/stage/i18n/
cp -R view/. dist/stage/view/

python3 - <<'PY'
from pathlib import Path
import zipfile

source = Path("dist/stage")
archive = Path("dist/asset-management-v2-ui.zip")

with zipfile.ZipFile(
    archive,
    mode="w",
    compression=zipfile.ZIP_DEFLATED
) as zip_file:
    for file in sorted(source.rglob("*")):
        if file.is_file():
            zip_file.write(
                file,
                file.relative_to(source)
            )

print(f"Created {archive}")
PY

rm -rf dist/stage
