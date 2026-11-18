# 육아 소식 한눈에

육아 정책·지원금·보육·육아휴직·나들이 소식을 3시간마다 자동으로 모아 보여주는 정적 사이트입니다.
서버도, API 키도 없이 **GitHub Actions(수집) + GitHub Pages(화면)**로만 동작합니다.

- 구글 뉴스 검색 RSS + 고용노동부 RSS에서 **제목·요약·링크만** 저장 (본문 수집 안 함)
- 중복 기사 제거, 5개 분류(정책·지원금 / 보육·교육 / 일·가정 / 건강·안전 / 나들이·행사)
- 지역 태그(세종·대전 등), 기사 속 **신청·마감·행사 날짜 자동 추출 → 캘린더**
- 이번 주 많이 나온 키워드, 기사 저장(⭐)·공유
- 최근 45일치 보관

## 구조
```
index.html, css/style.css, js/app.js   화면 (모바일 우선)
data/news.json                          수집 결과 (Actions가 자동 갱신, 처음엔 예시 데이터)
scripts/fetch-news.mjs                  수집·분류 스크립트 (Node 20+, 외부 패키지 없음)
scripts/config.json                     검색어·분류 단어·지역·RSS 목록 ← 여기만 고치면 됨
.github/workflows/update-news.yml       3시간마다 실행
```

## 설정 (3단계)
1. **GitHub 저장소 만들기** → 이 폴더 내용을 그대로 올립니다
2. **Pages 켜기**: Settings → Pages → Branch `main` / `/ (root)` → Save
3. **첫 수집**: Actions 탭 → `육아 뉴스 수집` → Run workflow
   → 1~2분 뒤 `data/news.json`이 실제 기사로 바뀌고 사이트에 반영됩니다

> Actions 탭에 "워크플로를 활성화하라"는 버튼이 보이면 먼저 눌러 주세요.
> Settings → Actions → General → Workflow permissions가 `Read and write`인지도 확인하세요.

## 비밀번호
- 기본값 `202611`. `js/app.js` 맨 위 `PASSWORD_SHA256`에 **SHA-256 해시**로만 저장됩니다.
- 바꾸기: `printf '%s' 새비밀번호 | sha256sum` 결과로 그 값을 교체
- 한 번 입력하면 브라우저 탭을 닫을 때까지 유지됩니다
- ⚠ 정적 사이트의 '가벼운 잠금'입니다. `data/news.json` 주소를 직접 알면 열람할 수 있습니다

## 내 키워드 (방문자별)
- 화면의 "🔖 내 키워드"에 단어를 등록하면 해당 소식만 골라 보고 제목에 강조 표시합니다
- 방문자 휴대폰(브라우저)에만 저장, 최대 15개
- 수집된 기사 안에서 찾는 방식이라, 자주 요청받는 키워드는 아래 `googleNews.queries`에 추가하면 더 많이 잡힙니다

## 검색어·RSS 바꾸기
`scripts/config.json`
- `googleNews.queries`: 구글 뉴스에서 찾을 검색어 (예: `"세종 키즈카페"` 추가)
- `googleNews.window`: 검색 기간 (`when:3d` = 최근 3일)
- `rssFeeds`: 언론사·기관 RSS 주소 추가 (`{ "name": "언론사명", "url": "...", "mustMatch": true }`)

## 로컬 테스트
```bash
FIXTURE_NOW=2026-11-18T09:00:00Z node scripts/fetch-news.mjs --fixture scripts/fixtures/sample.json  # 예시 데이터
node scripts/fetch-news.mjs        # 실제 수집
python3 -m http.server             # http://localhost:8000
```

## 참고
- 기사 링크는 구글 뉴스를 거쳐 원문으로 이동합니다
- 구글 뉴스 RSS는 비상업적 이용 전제이므로 사이트에 광고를 붙이지 마세요
- 저장소에 60일간 커밋이 없으면 GitHub가 예약 실행을 멈출 수 있습니다 (수집 커밋이 계속 생기면 유지됨)
- 정책브리핑(korea.kr) RSS는 2026.7.1 서비스 중단, 네이버 검색 API는 키 발급처 이관·이용조건 변경으로 제외
- 블로그 링크: `index.html` 하단 `blogLink` 주소를 실제 블로그 주소로 바꾸세요
