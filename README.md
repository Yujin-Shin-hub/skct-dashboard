# Score Trend Viewer — Notion DB 기반 성적 추이 분석

SKCT, GSAT, NCS 등 취업 시험 모의고사 성적을 노션 데이터베이스에서 불러와
회차별 추이를 차트로 시각화하는 로컬 웹 앱입니다.

---

## 주요 기능

- 노션 데이터베이스의 모의고사 기록을 회차 순으로 불러와 꺾은선 그래프로 표시
- **점수 · 정답률 · 응답수 · 미답수 · 틀린개수** 핵심 지표를 한눈에 비교
- **언어이해 · 자료해석 · 창의수리 · 언어추리 · 수열추리** 등 과목별 추이 그래프
- 페이지 맨 하단에 원본 테이블 확인 가능
- 캐시 파일(`notion_mock_cache.json`)을 이용해 재방문 시 빠르게 렌더링
- Docker Compose 한 줄로 실행 가능
<img width="1920" height="1080" alt="image-3" src="https://github.com/user-attachments/assets/efbfbcea-310d-43db-beac-56a0946a821d" />
<img width="1920" height="1080" alt="image-4" src="https://github.com/user-attachments/assets/b09eade8-20ed-4ad1-84df-23f2634ac59e" />


---

## 실행 환경

| 항목 | 버전 |
|---|---|
| Node.js | 22 이상 (Docker 사용 시 불필요) |
| Docker & Docker Compose | 선택 사항 |

---

## 사전 준비 — Notion API 토큰 & 데이터베이스 ID 발급

### 1단계 — Notion 통합(Integration) 만들기

1. [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations) 접속
2. **+ 새 API 통합** 클릭
3. 이름 입력 (예: `score-viewer`) → **제출**
4. 생성된 페이지에서 **"내부 통합 시크릿"** 값을 복사
   → 이 값이 `NOTION_ACCESS_TOKEN`입니다 (`ntn_` 또는 `secret_`로 시작)

### 2단계 — 데이터베이스에 통합 연결하기

1. 노션에서 모의고사 기록이 있는 **데이터베이스 페이지** 열기
2. 우측 상단 `···` 메뉴 → **연결** → 방금 만든 통합 선택

### 3단계 — 데이터베이스 ID 확인하기

데이터베이스 설정 보기 버튼 클릭 ➜ 데이터 소스 관리에서 해당 DB 소스 ID 복사

<img width="300" alt="image" src="https://github.com/user-attachments/assets/452ee366-6dc9-4400-a511-a8ed7437c342" />


---

## 노션 데이터베이스 속성 설정

데이터베이스에 아래 속성들을 만들어 두세요. **속성명이 정확히 일치**해야 합니다.
아래의 노션 페이지를 복제하여 사용하셔도 됩니다.
[skct 성적 데이터베이스](https://www.notion.so/1017384e6ea583138837018bac67af0a?v=9637384e6ea583ec880b880f0534fe02&source=copy_link)

### 필수 속성

| 속성명 | 타입 | 설명 |
|---|---|---|
| `태그` | 선택(Select) 또는 다중 선택(Multi-select) | 필터링에 사용. 예: `모의고사`, `SKCT`, `GSAT`, `NCS` |
| `점수` (또는 `총점`, `맞은개수`) | 숫자(Number) | 해당 회차 총점 또는 총 맞은 개수 |
| `응답수` | 숫자(Number) | 해당 회차에 응답한 문항 수 |
| `정답률` | 숫자(Number) | 정답률 (0~100 사이 숫자, 단위 %) |
| `이름` (또는 `제목`, `모의고사명`) | 텍스트(Text) 또는 제목(Title) | 각 회차의 표시 이름. 예: `2024년 하반기 SKCT` |

### 과목별 속성 (선택)

각 과목의 맞은 개수와 응답 수를 `맞은개수/응답수` 형식의 텍스트로 입력하면
자동으로 과목별 추이 그래프가 생성됩니다.

| 속성명 예시 | 타입 | 입력 예 |
|---|---|---|
| `언어이해` | 텍스트(Text) | `18/20` |
| `자료해석` | 텍스트(Text) | `15/20` |
| `창의수리` | 텍스트(Text) | `12/20` |
| `언어추리` | 텍스트(Text) | `14/20` |
| `수열추리` | 텍스트(Text) | `10/15` |

> 과목명은 자유롭게 변경 가능합니다. `숫자/숫자` 형식으로 입력된 모든 속성이 과목별 그래프에 표시됩니다.

### 데이터베이스 예시

| 이름 | 태그 | 점수 | 응답수 | 정답률 | 언어이해 | 자료해석 | 창의수리 | 언어추리 | 수열추리 |
|---|---|---|---|---|---|---|---|---|---|
| 2024 상반기 SKCT | 모의고사 | 69 | 95 | 73 | 18/20 | 15/20 | 14/20 | 12/20 | 10/15 |
| 2024 하반기 SKCT | 모의고사 | 74 | 98 | 76 | 19/20 | 16/20 | 15/20 | 14/20 | 10/15 |

🤖 아래의 지피티 모델을 사용하여 간편하게 채점해보세요!

[ChatGPT-SKCT 채점 도우미](https://chatgpt.com/g/g-69c324c5a4008191936df1d1e539c8a9-skct-caejeom-doumi)
---

## 설치 및 실행

### 방법 A — Docker Compose (권장)

```bash
# 1. 레포지토리 클론
git clone <레포 URL>
cd skct

# 2. 환경 변수 파일 작성
cp .env.example .env
# .env 파일을 열어 아래 값 입력

# 3. 실행
docker compose up -d
```

브라우저에서 [http://localhost:8787](http://localhost:8787) 접속

### 방법 B — Node.js 직접 실행

```bash
node notion_proxy_server.js
```

---

## 환경 변수 (.env)

```dotenv
# Notion 통합 시크릿 토큰 (필수)
NOTION_ACCESS_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 데이터베이스 ID (필수)
NOTION_DATABASE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# 태그 필터 — 이 값과 일치하는 태그가 있는 항목만 표시 (선택)
# 비워두면 전체 항목을 표시합니다
NOTION_FILTER_TEXT=모의고사

# Notion API 버전 (기본값: 2026-03-11)
NOTION_VERSION=2026-03-11

# 서버 포트 (기본값: 8787)
PORT=8787
```

---

## 동작 방식

```
브라우저 → Node.js 프록시 서버 → Notion API
```

브라우저에서 직접 Notion API를 호출하면 CORS 오류가 발생하기 때문에,
Node.js 서버가 프록시 역할을 하여 API를 대신 호출하고 결과를 캐시 파일로 저장합니다.

| 엔드포인트 | 설명 |
|---|---|
| `GET /` | 뷰어 HTML 페이지 반환 |
| `GET /data/notion_mock_cache.json` | 캐시 파일 반환 (없으면 Notion API 호출 후 저장) |
| `POST /api/load` | Notion API를 호출해 최신 데이터를 불러오고 캐시 갱신 |
| `POST /api/refresh` | `/api/load`와 동일 |
| `GET /api/config` | 현재 서버 설정 확인 |

---

## 파일 구조

```
.
├── notion_proxy_server.js     # Node.js 프록시 서버
├── notion_db_trend_viewer.html # 프론트엔드 (Vue 3 단일 파일)
├── notion_mock_cache.json     # 노션 데이터 캐시 (자동 생성)
├── .env                       # 환경 변수 (직접 작성 필요)
├── Dockerfile
└── compose.yaml
```

---

## 기술 스택

- **백엔드**: Node.js (표준 라이브러리만 사용, 외부 의존성 없음)
- **프론트엔드**: Vue 3 (CDN), SVG 기반 커스텀 차트
- **컨테이너**: Docker / Docker Compose
