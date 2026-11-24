# 내담자 언어 번역기 용어 빌더

`translator/data/terms.json`에 용어를 더할 때 쓰는 작업 도구입니다. 손으로 JSON을 고치지 않고
`data_*.py`의 `ROWS`에 한 줄씩 적은 뒤 빌더를 돌리면, 기존 용어와 겹치는 말은 건너뛰고 새 말만
계약(`translator/data/SCHEMA.md`)에 맞춰 넣습니다.

## 쓰는 법

```
python3 ops/scripts/build_translator/build.py --dry     # 개수·길이만 확인(파일 안 씀)
python3 ops/scripts/build_translator/build.py           # terms.json에 합침
```

- `--repo`를 주지 않으면 이 폴더 기준 저장소 뿌리를 씁니다.
- 빌더는 `translator/data/terms.json`을 **기존 자료**로 읽고 거기에 더합니다. 같은 말은 두 번 들어가지 않으므로 같은 명령을 다시 돌려도 결과가 같습니다.
- `updated_at`은 빌더가 `2026-11-24`로 고정합니다. 다른 날 작업하면 `build.py`의 `doc["updated_at"]` 값을 그날로 바꾸세요.
- 새 분야·묶음·출처는 `build.py`의 `NEW_CATS`·`NEW_GROUPS`·`NEW_SOURCES`에 적습니다. 묶음은 반드시 같은 분야(`cat`)에 속해야 하고, 출처는 `id`·`name`·`url`(https)·`note`를 갖춥니다.

## 한 줄의 모양

```
(묶음, 표기, 영문 원어/한글 명칭, 한글 정식 명칭, 한 줄 뜻(90자), 맥락(130자),
 질문1, 질문2, "다른 표기|검색어", "출처 id 또는 None", [치환어], "대응 문장")
```

- 비하·속어(`derog`)는 마지막 두 칸(치환어 목록·대응 문장)을 채웁니다. 나머지 분야는 비워 둡니다.
- 출처는 **확인한 기관만** 적고, 공식 정의가 없는 현장 약어·은어는 `None`으로 둡니다(화면은 「공식 정의 없음」으로 표시).
- 풀이 문장은 자료실이 새로 씁니다. 사전·교재·블로그 문장을 옮기지 않습니다.

## 검사

빌드 뒤 `python3 ops/scripts/validate_repo.py`가 `check_terms()`로 계약 위반(필수 키, 분야·묶음 일치,
연계 섹터 존재, 출처 존재, 길이 상한, 비하 표현의 치환어·대응 문장)을 잡습니다.
