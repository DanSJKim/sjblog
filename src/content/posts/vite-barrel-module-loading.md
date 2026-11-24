---
title: "배럴 파일과 모듈 로딩 비용"
description: "Button 하나를 import했는데 다른 모듈도 로드되는 이유와, 개발 모드의 로딩 비용을 운영 빌드의 트리 셰이킹과 구분해서 봐야 하는 이유."
pubDate: 2026-10-20
tags:
  - vite
  - javascript
  - frontend
  - performance
---

```ts
import { Button } from "./ui";
```

화면에서 필요한 것은 `Button` 하나다. 그런데 `./ui`가 여러 컴포넌트를 다시 내보내는 `index.ts`라면, 개발 중에는 이 한 줄 때문에 다른 컴포넌트 파일도 로드될 수 있다.

```ts
// ui/index.ts
export { Button } from "./button";
export { Dialog } from "./dialog";
export { Chart } from "./chart";
```

이렇게 다른 파일의 export를 모아 다시 내보내는 파일을 배럴 파일이라고 한다. 사용하는 쪽에서는 폴더 내부 경로를 몰라도 되고 파일을 옮겨도 배럴의 export만 유지하면 import 경로를 바꾸지 않아도 된다. 다만 경로가 짧아졌다고 해서 읽어야 할 파일까지 줄어들지는 않는다.

## 개발 모드의 모듈 로딩

Vite는 개발 중 애플리케이션 소스를 브라우저의 ES 모듈 방식으로 제공한다. 이때 위의 `index.ts`를 거치면 `button`뿐 아니라 `dialog`, `chart`로도 의존 관계가 연결된다. [Vite 성능 가이드](https://vite.dev/guide/performance.html#avoid-barrel-files)에서도 배럴에서 API 하나만 가져오더라도 재수출한 파일들을 가져오고 변환해야 한다고 설명한다.

```text
화면 -> ui/index.ts -> button
                   -> dialog
                   -> chart
```

여기서 `Dialog`나 `Chart`가 렌더링되는 것은 아니다. 해당 모듈을 불러오고 초기화하는 것과, 컴포넌트를 화면에 렌더링하는 것은 별개의 동작이다.

모듈에는 export한 함수 외에도 처음 불러올 때 실행되는 코드가 있을 수 있다. 예를 들어 `dialog` 모듈이 최상위에서 전역 이벤트를 등록한다면, `Dialog`를 사용하지 않는다는 이유만으로 그 등록을 생략할 수는 없다. 브라우저는 사용하지 않는 export를 보고 모듈 전체를 자동으로 제거하지 않는다.

파일 몇 개라면 차이가 작을 수 있지만 `chart`가 다른 배럴과 라이브러리를 가져온다면 연결되는 파일은 더 늘어난다. Marvin Hagemeister도 [배럴 파일의 성능 비용을 다룬 글](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/)에서 함수 실행 시간과 모듈을 준비하는 시간을 구분한다. 함수 자체가 빨라도 실행하기 전에 많은 파일을 읽어야 하면 전체 작업은 느릴 수 있다.

이 경로를 직접 지정하면 배럴을 거치며 생기는 연결을 피할 수 있다.

```ts
import { Button } from "./ui/button";
```

물론 `button` 자체가 가져오는 의존성은 여전히 필요하다. 여기서 줄어드는 것은 같은 배럴에 묶였다는 이유로 따라오던 모듈들이다. 또 이 설명은 프로젝트의 소스 파일을 기준으로 한다. npm 패키지는 Vite의 의존성 사전 번들링을 거칠 수 있으므로, 패키지의 export 수를 그대로 브라우저 요청 수로 계산할 수는 없다.

## 운영 빌드에서는 트리 셰이킹을 한다

운영 빌드에서는 번들러가 사용하지 않는 코드를 분석해 제거한다. `dialog`, `chart`와 그 의존성에 보존해야 할 부수효과가 없다면, 배럴에서 재수출했다는 이유만으로 반드시 최종 번들에 남지는 않는다.

반대로 초기화 코드나 스타일 import처럼 실행 의미가 있는 부분은 보존될 수 있다. `sideEffects` 설정도 여기에 영향을 주지만 설정이 없다고 모든 코드가 남는다거나 `false`로 바꾸면 항상 해결된다고 단정하기는 어렵다. 실제 코드의 부수효과와 번들러 설정을 함께 봐야 한다. [Rollup 문서](https://rollupjs.org/configuration-options/#treeshake-modulesideeffects)도 부수효과를 무시하는 설정이 초기화 모듈이나 스타일을 제거할 수 있다고 경고한다.

또 최종 번들에서 제거됐더라도, 빌드 도구가 제거 여부를 판단하기 위해 모듈을 읽고 분석하는 비용은 들 수 있다. Shu Ding의 [Next.js 패키지 import 최적화 글](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)에서도 이 분석 비용을 설명한다. 해당 글의 최적화 방식과 수치는 Next.js의 사례지만 최종 번들 크기만으로 개발 도구의 작업량까지 판단하기 어렵다는 점은 참고할 만하다.

그래서 개발 중 로딩이 느린 문제와 운영 번들이 큰 문제는 따로 확인해야 한다. 트리 셰이킹으로 배포 용량이 줄어도 개발 중의 모듈 로딩 비용은 남는다.

## 공개 API로 쓰는 배럴

배럴은 라이브러리나 모듈이 외부에 공개할 API를 모으는 진입점으로도 쓰인다. 이 경우에는 호출하는 쪽이 내부 파일 구조에 의존하지 않도록 하는 이점이 있다. TkDodo도 [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files)에서 라이브러리의 공개 진입점을 별도로 다룬다.

공개 API를 만들었다고 로딩 비용이 없어지지는 않는다. 외부에 함께 공개할 코드인지, 한 기능을 쓸 때 무거운 다른 기능까지 연결되는지 살펴볼 필요가 있다. 배럴 파일 하나만으로 내부 경로 접근을 막을 수도 없으므로, 접근 제한이 목적이라면 린트 규칙이나 패키지의 `exports` 설정 같은 장치도 필요하다.

같은 모듈 내부에서는 파일을 직접 가져오는 편이 순환 참조를 피하는 데도 도움이 된다. `button.tsx`가 자기 자신을 다시 내보내는 `index.ts`에서 유틸을 가져오면 아래처럼 되돌아오는 경로가 생긴다.

```text
button.tsx -> index.ts -> button.tsx
```

유틸 파일을 직접 import하면 이 경로를 만들지 않아도 된다.

애플리케이션에서 파일을 모아두기 위해 만든 배럴이라면 직접 import로도 충분한지부터 확인할 만하다. 공개 진입점이 필요한 곳은 유지할 이유가 있지만 폴더마다 관성적으로 `index.ts`를 만들 필요는 없다. 개발 로딩을 확인할 때는 연결되는 모듈을, 배포 용량을 확인할 때는 실제 빌드 결과를 봐야 한다.
