# sjblog

## 글 발행 규칙

- `src/content/posts`에 글을 새로 올리거나 본문을 고칠 때는, push하기 전에 항상 `/humanize-korean:humanize` 확인을 거친다. 번역 글도 예외 없다.
- 이 명령은 사용자만 실행할 수 있다. Claude는 직접 호출하거나 다른 방법으로 흉내 내지 말고, 대상 파일 경로를 알려 주며 사용자에게 실행을 요청한다.
- 확인 결과를 글에 반영하기 전에는 push하지 않는다. `main`에 push하면 GitHub Actions가 바로 운영 사이트에 배포한다.
