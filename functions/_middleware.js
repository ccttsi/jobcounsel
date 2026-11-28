// 자료실 라이브 차단막 — 저장소 루트를 그대로 올리는 Cloudflare Pages에서
// 내부 운영·설계 문서가 「URL만 알면」 열리던 것을 404로 막는다. (헌법 제3조 3-2)
//
// 왜 여기서 막나
//   · 배포는 `witw.pages.dev`(저장소 `ccttsi/jobcounsel` 루트를 빌드 없이 그대로 올린다)라
//     `/ops/CONNECTORS.md`·`/CONSTITUTION.md`·`/design/HANDOFF.md`가 200 + text/markdown으로 열렸다.
//   · Cloudflare Pages의 `_redirects`는 301·302 같은 «넘김»만 되고 404·403 같은 «되돌림»은
//     지원하지 않는다(공식 문서의 Advanced redirects 표). 정적 파일을 먼저 찾는 순서도 아니다.
//   · `functions/_middleware.js`는 정적 파일보다 **먼저** 돌아 응답 상태 코드를 그대로 정할 수 있다.
//     `_routes.json`이 모든 요청을 이 함수로 보내므로 깊은 폴더의 `.md`·`.py`까지 잡힌다.
//
// 규칙 (아래 세 상수가 유일한 기준이다 — `validate_repo.py`의 `expose` 검사가 이 파일을 읽어 대조한다)
//   INTERNAL_DIRS — 폴더째로 내부인 곳(`functions/`는 Cloudflare가 배포판으로 내보내지 않지만,
//     나중에 정적 파일로 섞여 나가더라도 차단 목록이 새지 않게 같이 막아 둔다)
//   INTERNAL_EXTS — 어느 폴더에 있든 내부인 확장자(문서·스크립트·스키마·워크플로)
//   ALWAYS_PUBLIC — 위 규칙보다 먼저 봐주는 공개 파일(검색엔진 안내문)
//   + 저장소 루트의 점·밑줄로 시작하는 파일(`.nojekyll`·`.gitignore`·`_headers`·`_routes.json` —
//     Pages 설정 파일은 배포 뒤에도 `/_headers`·`/_routes.json`으로 200이 되어 그대로 읽혔다)
// 막지 않는 것 — 화면(`.html`·`.css`·`.js`)과 화면이 읽는 공개 데이터(`.json`·이미지·글꼴),
//   `robots.txt`. 37개 섹터·대문·비서·마이덱은 이 함수를 지나 `context.next()`로 그대로 나간다.
export const INTERNAL_DIRS = ["ops", "design", "docs", "drafts", "mlc", ".claude", ".github", "supabase", "functions", "android"];
export const INTERNAL_EXTS = ["md", "py", "sql", "tsv", "yml", "yaml", "sh", "toml", "cfg", "ini"];
export const ALWAYS_PUBLIC = ["/robots.txt"];

/** 내부 경로면 막은 이유(`dir:ops`·`ext:md`·`root-dotfile:.nojekyll`)를, 공개 경로면 null을 돌려준다. */
export function internalPath(rawPath) {
  let path = String(rawPath || "/");
  try {
    path = decodeURIComponent(path); // /%6Fps/ROLES.md 같은 표기를 풀어서 본다
  } catch {
    /* 잘못된 % 표기는 푼 것처럼 치지 않고 그대로 본다 */
  }
  const segs = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      segs.pop();
      continue;
    }
    segs.push(part);
  }
  const clean = "/" + segs.join("/");
  if (ALWAYS_PUBLIC.includes(clean.toLowerCase())) return null;

  const first = (segs[0] || "").toLowerCase();
  if (INTERNAL_DIRS.includes(first)) return "dir:" + first;

  const last = segs.length ? segs[segs.length - 1] : "";
  if (segs.length === 1 && (first.startsWith(".") || first.startsWith("_"))) return "root-file:" + first;

  const found = /\.([A-Za-z0-9]+)$/.exec(last);
  const ext = found ? found[1].toLowerCase() : "";
  if (ext && INTERNAL_EXTS.includes(ext)) return "ext:" + ext;
  return null;
}

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  if (internalPath(pathname)) {
    // 무엇이 있는지는 알려 주지 않는다 — 200이든 403이든 «있다»는 신호가 된다.
    return new Response("Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
      },
    });
  }
  return context.next();
}
