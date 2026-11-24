# Daniel's Posts

Astro 기본 프로젝트 위에 만든 심플한 개인 블로그입니다.

## Structure

```text
src/
├─ components/
│  └─ PostList.astro
├─ content/
│  └─ posts/
├─ layouts/
│  └─ BaseLayout.astro
├─ pages/
│  ├─ index.astro
│  ├─ about.astro
│  └─ posts/
│     ├─ index.astro
│     └─ [slug].astro
└─ styles/
   └─ global.css
```

## Commands

```sh
npm install
npm run dev
npm run build
```

새 글은 `src/content/posts`에 Markdown 또는 MDX 파일로 추가합니다.

## Editing from another device

```sh
git clone https://github.com/DanSJKim/sjblog.git
cd sjblog
npm install
npm run dev
```

글을 수정하거나 추가한 뒤에는 커밋하고 push합니다.

```sh
git add src/content/posts
git commit -m "Add post"
git push
```

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 사이트를 빌드해 GitHub Pages(<https://dansjkim.github.io/sjblog/>)에 배포합니다.
