#!/usr/bin/env bash
# Dựng thư mục _site cho GitHub Pages từ app/index.html và thư mục dữ liệu ($1)
set -euo pipefail
SRC="${1:-data}"
rm -rf _site && mkdir -p _site/d
{ printf '<!doctype html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="description" content="khoimr11 — phân tích cổ phiếu Việt Nam">\n<!-- nội dung app (đầu trang: title, style; thân trang bắt đầu ở header) -->\n'; cat app/index.html; printf '\n</body>\n</html>\n'; } > _site/index.html
cp -R "$SRC"/. _site/d/ && rm -rf _site/d/.git _site/d/hist _site/d/probe _site/d/cache
touch _site/.nojekyll
du -sh _site; ls _site/d | head -20
