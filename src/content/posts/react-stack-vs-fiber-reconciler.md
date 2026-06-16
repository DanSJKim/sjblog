---
title: "React Reconciler가 Stack에서 Fiber로 바뀐 이유"
description: "렌더링을 중간에 중단했다가 재개하는 개념이 자료구조 수준에서 와닿지 않아, Stack reconciler와 Fiber의 실제 생김새를 뜯어본 기록입니다."
pubDate: 2026-06-16
tags:
  - react
  - frontend
  - internals
---

『전문가를 위한 리액트』의 Fiber 재조정자 파트를 읽다 보니 이런 설명이 나왔다. React가 렌더링을 중간에 중단하고, 더 급한 일을 먼저 처리한 다음, 중단한 지점부터 다시 재개한다는 것이었다. 글로는 알겠는데 코드 수준에서는 와닿지 않았다. 함수 호출을 어떻게 중간에 멈춘다는 거지?

책은 그게 Fiber 덕분이라고 했다. React 16에서 reconciler를 Stack에서 Fiber로 다시 쓰면서 가능해졌다는 건데, 정작 뭐가 어떻게 바뀐 건지 이해가 잘 되지 않았다. 멈춤과 재개가 가능해진 게 Fiber라면, Stack 시절엔 왜 안 됐는지부터 봐야 했다.

## Stack Reconciler가 노드를 stack에 쌓는 줄 알았다

처음엔 Stack reconciler라는 이름 때문에, React가 따로 stack 자료구조를 두고 노드를 push/pop 하는 줄 알았다. 코드를 찾아보니 아니었다. 여기서 stack은 그냥 JavaScript의 call stack이다. 옛 reconciler는 트리를 재귀로 내려가며 처리했고, 그 재귀 호출이 쌓이는 곳이 call stack이라 "Stack reconciler"라고 부른 것뿐이었다.

의사코드로 줄이면 이런 모양이다.

```js
function reconcile(element) {
  const instance = createInstance(element)

  // 자식으로 재귀해서 내려간다
  for (const child of element.children) {
    reconcile(child)
  }

  return instance
}
```

`reconcile(App)`을 부르면 그 안에서 `reconcile(Header)`, `reconcile(List)`를 부르고, `reconcile(List)`는 다시 자식 `reconcile(Item)`을 부른다. 트리가 깊어질수록 호출이 그만큼 쌓인다.

처음엔 이게 왜 문제인지 잘 몰랐다. 재귀로 트리를 도는 건 흔한 코드니까. 막상 걸리는 지점은 "한 번 시작하면 끝까지 돌아야 한다"였다.

## 재귀로는 진행 위치를 붙잡아 둘 수 없다

재귀 호출이 진행되는 동안 call stack은 이렇게 쌓여 있다.

```
reconcile(Item)    ← 지금 여기
reconcile(List)
reconcile(App)
```

이 스택을 중간에 잠깐 멈춰두고 브라우저에 제어를 넘길 방법이 없다. JavaScript는 한 call stack이 다 풀릴 때까지 다른 일을 하지 않는다. 그래서 트리가 크면 `reconcile(App)`이 끝날 때까지 메인 스레드가 묶이고, 그동안 클릭이나 입력, 애니메이션 같은 더 급한 일도 전부 뒤로 밀린다. 입력창에 글자를 쳤는데 한참 뒤에 나타나는 그 버벅임이다.

"중단했다가 재개한다"가 안 됐던 건 React가 게을러서가 아니라, 재귀로 구현된 탓에 작업의 진행 위치가 call stack 안에만 있었기 때문이다. call stack은 우리가 들고 있다가 나중에 꺼내 쓸 수 있는 값이 아니다. 멈추는 순간 사라진다.

## Fiber Node는 그냥 객체다

그럼 Fiber는 뭘 바꿨나. 용어부터 정리하면, 흔히 "Fiber"라고 뭉뚱그리지만 정확히는 Work Loop, Scheduler, Lane System까지 묶은 걸 Fiber Architecture라고 부른다. 그중 핵심 자료구조가 Fiber Node라는 객체다. 이름이 거창해서 한참 들여다봤는데, 이 자료구조의 실체는 plain JavaScript 객체 하나였다. 달리 보면, 재귀였다면 call stack에 쌓였을 스택 프레임을 React가 객체로 만들어 heap에 둔 것이다. 작업 단위 하나마다 Fiber Node가 하나 붙는다. React 소스의 `FiberNode`를 필요한 부분만 추리면 이렇다.

```js
function FiberNode(tag, pendingProps, key) {
  // 이 fiber가 누구인가
  this.tag = tag           // FunctionComponent, HostComponent('div') 등
  this.type = null         // App, Header, 'div' ...
  this.key = key
  this.stateNode = null    // 실제 DOM 노드나 클래스 인스턴스

  // 트리를 잇는 포인터 (여기가 핵심)
  this.return = null       // 부모 fiber
  this.child = null        // 첫 번째 자식 fiber
  this.sibling = null      // 다음 형제 fiber

  // props / state
  this.pendingProps = pendingProps
  this.memoizedProps = null
  this.memoizedState = null   // hook이 매달리는 자리
  this.updateQueue = null

  // 스케줄링
  this.lanes = NoLanes     // 이 작업이 얼마나 급한가
  this.flags = NoFlags     // 삽입/수정/삭제 같은 할 일 표시

  this.alternate = null    // 현재 트리 ↔ 작업 중 트리를 잇는 짝
}
```

Stack 시절엔 없던 게 `return` / `child` / `sibling`이다. 트리의 부모-자식 관계를 재귀 호출 대신 이 세 포인터로 표현한다.

예를 들어 이런 트리가 있으면,

```jsx
<App>
  <Header />
  <List>
    <Item />
    <Item />
  </List>
</App>
```

fiber들은 이렇게 연결된다.

![Fiber 트리 포인터 구조: App의 child가 Header, Header의 sibling이 List, List의 child가 Item, Item의 sibling이 다음 Item을 가리킨다. child는 첫 자식으로 내려가는 파란 화살표, sibling은 다음 형제로 가는 청록 화살표, return은 부모로 돌아가는 점선 화살표다. 방문 순서는 App, Header, List, Item, Item 순.](/posts/react-fiber/fiber-tree.svg)

각 fiber는 `child`를 따라 첫 자식으로 내려가고, `sibling`을 따라 옆 형제로 넘어가고, 더 갈 곳이 없으면 `return`을 따라 부모로 돌아온다. 재귀에서 "함수가 끝나 호출자로 돌아가는" 동작을 `return` 포인터가 대신한다. children 배열만 들고 있었다면 트리를 재귀로 타고 내려가야 하지만, 이렇게 세 포인터로 펼쳐두면 재귀 없이 반복문으로 트리를 DFS 순회할 수 있다.

## 중단과 재개가 가능한 이유

순회는 재귀가 아니라 반복문으로 돈다. 대략 이런 모양이다.

```js
let workInProgress = rootFiber

// 이해를 위한 의사코드 (concurrent 경로)
function workLoopConcurrent() {
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress)
    // performUnitOfWork 안에서 workInProgress가 다음 fiber로 갱신된다
  }
}
```

`performUnitOfWork`는 fiber 하나를 처리하고, 그 과정에서 `workInProgress`를 다음 fiber로 옮긴다. 다음 fiber는 앞에서 본 포인터를 따라 정해진다. `child`가 있으면 내려가며 `beginWork`를 하고, 더 내려갈 곳이 없으면 `completeWork` 뒤 `sibling`으로, 그것도 없으면 `return`을 따라 올라간다. Stack과 갈리는 지점은 `shouldYield()`다. fiber 하나를 끝낼 때마다 "지금 브라우저에 양보해야 하나?"를 묻고, 양보해야 하면 루프를 빠져나가 제어를 넘긴다.

한 가지 짚어둘 게 있다. 이렇게 중간에 양보할지 확인하는 건 concurrent 경로뿐이다. 동기 경로인 `workLoopSync`에는 그 확인이 없어서 한 번 시작하면 끝까지 돈다. 그러니 "멈출 수 있다"는 건 구조가 그렇게 깔려 있다는 가능성이고, 실제로 멈추는지는 그 업데이트가 어느 경로로 도느냐에 달렸다. 이 조건은 마지막에 다시 본다.

그렇게 빠져나가도 다음에 어디서부터 다시 시작할지 알 수 있다. 진행 위치가 `workInProgress`라는 변수에 들어 있기 때문이다. 재귀였다면 위치가 call stack에 있어서 멈추는 순간 잃어버렸을 텐데, Fiber는 그 위치를 평범한 변수로 들고 있다. 진행 상태를 붙잡을 수 있는 값으로 꺼내둔 것, 이게 중단과 재개가 가능한 이유다.

처음에는 Fiber가 무슨 정교한 스케줄링 알고리즘인 줄 알았는데, 멈춤과 재개에 한정해서 보면 핵심은 "트리를 객체 + 포인터로 펼쳐서, 현재 위치를 변수에 담아둔다"였다.

![Stack Reconciler와 Fiber 비교: Stack Reconciler는 reconcile(App), reconcile(List), reconcile(Item)이 call stack에 쌓여 한 번 시작하면 끝까지 못 멈추고 진행 위치도 스택 안에 있어 멈추면 사라진다. Fiber는 App, Header, List, Item 노드를 workInProgress 변수가 가리켜, 진행 위치가 변수에 남으므로 멈춘 지점부터 다시 이어갈 수 있다.](/posts/react-fiber/stack-vs-fiber.svg)

## 멈출 수 있는 단계와 없는 단계

여기까지 보고 한 가지가 걸렸다. 렌더링을 중간에 멈추고 나중에 다시 한다면, 화면이 반쯤 그려진 채로 보이는 거 아닌가?

그렇지는 않다. Fiber는 작업을 두 단계로 나눈다.

- **render(reconcile) phase**: 어떤 fiber가 바뀌었는지 계산하고, 바뀐 곳에 `flags`로 표시를 남긴다. 이 단계는 (concurrent 경로라면) 멈췄다 이어갈 수 있다. 아직 실제 DOM은 건드리지 않는다.
- **commit phase**: render 단계에서 표시해둔 변경을 실제 DOM에 한 번에 반영한다. 이 단계는 멈추지 않고 동기로 끝낸다.

화면이 깨져 보이지 않는 건 이 분리 덕분이다. 멈췄다 이어가는 건 계산만 하는 render phase고, 사용자에게 보이는 DOM을 바꾸는 commit phase는 쪼개지 않는다. render phase를 중간에 버리고 더 급한 업데이트부터 처리하더라도, 버려지는 건 계산이지 화면이 아니다.

`alternate` 필드가 여기서 같이 등장한다. React는 지금 화면을 그리고 있는 fiber 트리(current)와, 새로 계산 중인 트리(workInProgress)를 따로 둔다. 둘은 `alternate`로 서로를 가리킨다. 계산은 workInProgress 트리에서 하고, commit이 끝나면 그 트리가 current가 된다. 작업 중인 화면과 보이는 화면을 분리해두는 double buffering인데, render phase를 중간에 버려도 보이는 화면이 멀쩡한 것도 이 구조와 맞물린다.

## Fiber가 해결한 문제는 속도였을까

여기서 오해하기 쉬운데, Fiber로 바꿨다고 같은 트리를 한 번 그리는 비용 자체가 줄어드는 건 아니다. 오히려 fiber 객체를 만들고 포인터를 잇는 비용이 더 들 수도 있다.

바뀐 건 속도가 아니라 "언제 멈출 수 있는가"다. 긴 렌더링을 작은 단위로 쪼개서, 중간중간 입력이나 클릭 같은 급한 일을 먼저 처리하고 돌아올 수 있다. 전체 시간은 비슷해도 입력이 즉시 반응하면 체감상 덜 버벅인다. 처리량보다 체감 응답성을 챙기는 구조인 셈이다.

그런데 멈출 수만 있어서는 부족하다. 여러 업데이트가 동시에 밀려 있을 때 무엇을 먼저 할지도 정해야 한다. 그 우선순위를 맡는 게 `lanes`다. fiber마다 이 업데이트가 얼마나 급한지를 lane으로 표시해두면, 급한 업데이트를 먼저 처리하고 덜 급한 건 미룰 수 있다. `useTransition`으로 감싼 업데이트가 입력에 밀리는 게 이 우선순위 위에서 돌아가는 동작이다. 다만 lane이 실제로 어떻게 비트로 묶이고 비교되는지는 따로 더 파봐야 해서, 이 글에서는 "급한 정도를 fiber에 적어둔다" 정도로 남겨둔다.

앞에서 미뤄둔 조건을 여기서 마저 본다. 이 중단과 재개가 항상 켜져 있는 건 아니다. `createRoot`로 concurrent 렌더링을 켜면, 그중 대표적으로 `startTransition`이나 `useTransition`으로 표시한 업데이트가 시간 분할의 대상이 된다. 평범한 동기 업데이트는 같은 root에서도 기본적으로 한 번에 끝까지 렌더링한다. Fiber는 "멈출 수 있는 구조"를 깔아둔 쪽이고, 실제로 멈추는 건 그 위에서 transition으로 표시한 작업이다.

## 정리

- Stack reconciler의 "stack"은 별도 자료구조가 아니라 JS의 call stack이다. 트리를 재귀로 내려가니, 한 번 시작하면 다 끝날 때까지 메인 스레드를 놓지 못했다.
- Fiber는 작업 단위마다 객체(Fiber Node)를 만들고 `child`/`sibling`/`return` 포인터로 트리를 잇는다. 순회를 반복문으로 돌리고 진행 위치를 `workInProgress` 변수에 담아서, 중간에 멈췄다 이어갈 수 있는 구조다.
- 멈췄다 이어가도 화면이 안 깨지는 건 계산만 하는 render phase와 DOM에 반영하는 commit phase를 나눠뒀기 때문이다.
- Fiber의 핵심은 일을 작은 단위로 쪼개 멈추고 우선순위를 줄 수 있게 한 것이다. concurrent 기능은 그 위에 얹힌다.

concurrent 기능을 거의 마법처럼 쓰다가 자료구조까지 내려와 보니, 재귀로는 못 들고 있던 "지금 어디까지 했는지"를 `workInProgress` 변수와 fiber 포인터로 꺼내둔 게 핵심이었다. 남은 건 lanes 쪽인데, 우선순위를 실제로 어떻게 비교하고 묶는지는 다음에 더 봐야겠다.

## 참고한 문서

- [React 공식 블로그: React v16.0 (Fiber 도입)](https://legacy.reactjs.org/blog/2017/09/26/react-v16.0.html)
- [Andrew Clark, react-fiber-architecture](https://github.com/acdlite/react-fiber-architecture)
- [Lin Clark, A Cartoon Intro to Fiber (React Conf 2017)](https://www.youtube.com/watch?v=ZCuYPiUIONs)
- [React 소스: ReactFiber.js](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiber.js)
