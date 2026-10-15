#!/usr/bin/env python3
"""정적 사이트 만들기: app/ 화면 + data/ 의 모든 .md 를 묶은 data.json → _site/

GitHub Pages 배포(.github/workflows/pages.yml)와 맥북 미리보기(run.sh)가 둘 다 이걸 쓴다.
"""
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(ROOT, "app")
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "_site")


def read_all_md():
    files = {}
    for base, _, names in os.walk(DATA):
        for name in sorted(names):
            if name.endswith(".md"):
                full = os.path.join(base, name)
                rel = os.path.relpath(full, DATA).replace(os.sep, "/")
                with open(full, encoding="utf-8") as f:
                    files[rel] = f.read()
    return dict(sorted(files.items()))


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(APP, OUT)
    files = read_all_md()
    data = json.dumps({"built": datetime.now(timezone.utc).isoformat(timespec="seconds"), "files": files},
                      ensure_ascii=False)
    with open(os.path.join(OUT, "data.json"), "w", encoding="utf-8") as f:
        f.write(data)
    # 내용이 바뀔 때마다 오프라인 캐시 이름도 바꿔서 휴대폰이 새 버전을 받게 한다.
    digest = hashlib.sha1()
    for name in sorted(os.listdir(OUT)):
        with open(os.path.join(OUT, name), "rb") as f:
            digest.update(f.read())
    sw = os.path.join(OUT, "sw.js")
    with open(sw, encoding="utf-8") as f:
        text = f.read().replace("swim-coach-dev", "swim-coach-" + digest.hexdigest()[:10])
    with open(sw, "w", encoding="utf-8") as f:
        f.write(text)
    open(os.path.join(OUT, ".nojekyll"), "w").close()
    print(f"_site/ 완성: md {len(files)}개")


if __name__ == "__main__":
    main()
