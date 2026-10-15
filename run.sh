#!/bin/bash
# 맥북에서 미리 보기: ./run.sh  → http://localhost:8080
# (휴대폰은 GitHub Pages 주소로 연다. 이건 md를 고친 뒤 push 전에 확인하는 용도)
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8080}"
python3 build.py || exit 1
echo ""
echo "  🏊 수영 코치 미리 보기: http://localhost:$PORT   (끄기: Ctrl+C)"
echo ""
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory _site
