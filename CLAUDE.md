# CLAUDE.md — swim-coach (수영 코치)

## 이 프로젝트는
- 물이 무서운 성인이 혼자 수영을 배우는 휴대폰용 웹앱. 화면은 **수영장 찾기**와 **오늘의 수업** 두 가지.
- 서버 없는 정적 앱. `data/` 의 md(커리큘럼 · 수영장 표)를 `build.py` 가 `data.json` 하나로 묶고, GitHub Pages(https://lsc2016.github.io/swim-coach/)로 연다.
- 내 기록 · 동네 · 다니는 수영장은 휴대폰 브라우저(localStorage) 안에만 저장, "md로 내보내기"로 꺼낸다. 자세한 사용법은 `README.md`.

## 폴더 지도
| 이름 | 하는 일 |
|---|---|
| `app/app.js` | 화면 · 다음 수업 정하기 · 기록 저장 · zip 내보내기 전부 (약 50 KB, 한 파일) |
| `app/index.html` · `style.css` · `manifest.webmanifest` · `icon-*.png` | 껍데기 · 모양 · 홈 화면 아이콘 |
| `app/sw.js` | 오프라인 캐시 (캐시 이름은 build.py 가 배포마다 바꾼다) |
| `data/` ⛔ | 커리큘럼 · 수영장 표 · 내보낸 기록 md (사람이 Obsidian 으로 고치는 자료 — 열지 말 것) |
| `build.py` | `app/` + `data/*.md` → `_site/` (data.json). `_site/` 는 매번 지우고 새로 만든다 |
| `run.sh` | 맥북 미리 보기 → http://localhost:8080 |
| `.github/` | `workflows/pages.yml` — main 에 push 하면 GitHub Pages 로 배포 |
| `.claude/` | `launch.json` — 미리 보기 실행 설정(run.sh, 포트 8091) |
| `README.md` | 사람용 설명 (md 고치는 규칙 · 수업 순서 · 다음 수업 규칙) |

## 시작점
- 미리 보기: `./run.sh` (build.py 를 돌리고 `_site/` 를 띄움). 배포는 main 에 push 하면 자동.
- 읽는 순서: `README.md` → `app/app.js` 맨 아래 `route()` (896줄~, 주소 → 화면) → 그 화면 함수 `view*`.
- 확인: `node --check app/app.js`, `python3 -m py_compile build.py`. 시험 파일은 없다.

## 고치는 규칙
- 있는 것을 지우고 새로 만들지 말고, 더하고 보완하기.
- 사람이 승인하기 전에 데이터 파일·설정 파일을 지우거나 덮어쓰지 않기.
- 삭제 명령(rm -rf 등)은 쓰지 않기.
- 어느 화면에서든 첫 화면으로 돌아갈 길(로고 누르면 첫 화면)을 없애지 않기. (지금은 `topBar` 의 「← 홈」 단추 · `data-go=""`)
- md 의 `## 제목` 이름 · 표의 열 이름은 app.js 가 그 글자로 찾는다 — 바꾸면 app.js 도 같이 (README "md 파일 직접 고치는 법").
- 이 저장소는 공개 — push 한 기록 md 도 공개된다.

## 읽는 양 줄이기
| 이런 일이면 | 이 파일만 읽어라 |
|---|---|
| 다음 수업 정하는 규칙 | `app/app.js` 214~295줄 (`mainNext` · `plan` · `variantMenu`) |
| 수업 md 읽기 | `app/app.js` 120~190줄 (`parseFM` · `parseLesson` · `curriculum` · `logs`) |
| 수영장 표 · 오늘 열리는 시간 | `app/app.js` 296~404줄, 화면은 731~827줄 |
| 기록 저장 · 내보내기 | `app/app.js` 50~112줄, 593~730줄 |
| 오프라인 · 새 판 받기 | `app/sw.js`, `build.py` |
| 배포 | `.github/workflows/pages.yml` |

**열지 말 것**: `data/` (자료), `_site/` (만들어진 것), 아이콘 png.

## 용어
| 우리말 | 코드 안 |
|---|---|
| 수업 | `data/curriculum/*.md` 한 파일, `parseLesson` (`id` · `순서` · `단계이름`) |
| 보충 수업 | `보충-*.md`, `l.supp` |
| 멈추기 지점 | md 의 `> 🛑 **무서우면 여기서 멈추기**` 줄 |
| 무서웠던 정도 | `FEARS` (전혀 · 조금 · 많이 · 못 들어감) |
| 힘들었던 점 | `DIFFS` |
| 다음: 넘어가기 · 반복 · 뒤로 | `NEXT_TEXT` |
| 내 정보 | `profile.md` (localStorage 안) |

## 다른 프로젝트와의 연결
- dashboard 의 `apps.json` 이 이 앱을 GitHub Pages 주소로 링크한다 (`swim_coach`, kind external). 이 저장소는 다른 폴더를 읽거나 쓰지 않는다.
- 바깥 주소: 네이버 지도 검색 · 유튜브 검색 링크만 (`app/app.js` 338 · 518줄).

## 저장소 밖
- 휴대폰 브라우저 localStorage (`localFiles` · `repo` · `exported` · `lastExport`) — 내 기록 · 내 정보 · 고친 수영장 표.
- GitHub Pages 설정 (저장소 Settings).

## 모르는 것 (확인 필요)
- `data/` 안 md 개수 · 꼴 (이번에 열지 않음).
