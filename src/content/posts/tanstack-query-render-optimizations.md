---
title: "[번역] TanStack Query 렌더 최적화"
description: "구조적 공유, 추적되는 프로퍼티, select까지. React Query가 불필요한 리렌더를 줄이는 방법을 다룬 TanStack Query 공식 문서 Render Optimizations 번역."
pubDate: 2026-11-24
tags:
  - translation
  - react-query
  - frontend
  - performance
---

> 이 글은 TanStack Query 공식 문서의 [Render Optimizations](https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations)를 번역한 글이다. 원문은 [MIT 라이선스](https://github.com/TanStack/query/blob/main/LICENSE)(Copyright (c) 2021-present Tanner Linsley)로 배포된다.

React Query는 컴포넌트가 실제로 필요할 때만 리렌더되도록 몇 가지 최적화를 자동으로 적용한다. 이는 다음과 같은 방법으로 이루어진다.

## 구조적 공유 (structural sharing)

React Query는 "구조적 공유"라는 기법을 사용해 리렌더 사이에 가능한 한 많은 참조가 그대로 유지되도록 한다. 데이터를 네트워크로 가져오면 보통 응답을 json 파싱하면서 완전히 새로운 참조를 얻게 된다. 하지만 데이터에서 *아무것도* 바뀌지 않았다면 React Query는 원래 참조를 유지한다. 일부만 바뀌었다면 바뀌지 않은 부분은 유지하고 바뀐 부분만 교체한다.

> 참고: 이 최적화는 `queryFn`이 JSON 호환 데이터를 반환할 때만 동작한다. `structuralSharing: false`를 전역으로 또는 쿼리별로 설정해 끌 수 있고 함수를 전달해 직접 구조적 공유를 구현할 수도 있다.

### 참조 동일성 (referential identity)

`useQuery`, `useInfiniteQuery`, `useMutation`이 반환하는 최상위 객체와 `useQueries`가 반환하는 배열은 **참조가 안정적이지 않다**. 렌더마다 새로운 참조가 된다. 하지만 이 훅들이 반환하는 `data` 프로퍼티는 가능한 한 안정적으로 유지된다.

## 추적되는 프로퍼티 (tracked properties)

React Query는 `useQuery`가 반환한 프로퍼티 중 하나가 실제로 "사용"될 때만 리렌더를 일으킨다. 이는 [Proxy 객체](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)를 사용해 구현된다. 덕분에 불필요한 리렌더를 많이 피할 수 있다. 예를 들어 `isFetching`이나 `isStale` 같은 프로퍼티는 자주 바뀔 수 있지만 컴포넌트에서 쓰이지 않는 경우가 그렇다.

`notifyOnChangeProps`를 전역으로 또는 쿼리별로 직접 설정해 이 기능을 커스터마이즈할 수 있다. 이 기능을 끄고 싶다면 `notifyOnChangeProps: 'all'`로 설정하면 된다.

> 참고: 프록시의 get 트랩은 구조 분해를 통해서든 직접 접근을 통해서든 프로퍼티에 접근할 때 호출된다. 객체 rest 구조 분해를 사용하면 이 최적화가 비활성화된다. 이 함정을 막기 위한 [lint 규칙](https://tanstack.com/query/latest/docs/eslint/no-rest-destructuring)이 있다.

## select

`select` 옵션을 사용해 컴포넌트가 구독할 데이터의 일부를 선택할 수 있다. 고도로 최적화된 데이터 변환을 하거나 불필요한 리렌더를 피할 때 유용하다.

```js
export const useTodos = (select) => {
  return useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
    select,
  })
}

export const useTodoCount = () => {
  return useTodos((data) => data.length)
}
```

`useTodoCount` 커스텀 훅을 사용하는 컴포넌트는 todo의 개수가 바뀔 때만 리렌더된다. 예를 들어 todo의 이름이 바뀌었을 때는 리렌더되지 **않는다**.

> 참고: `select`는 성공적으로 캐시된 데이터를 대상으로 동작하며 에러를 던지기에 적절한 위치가 아니다. 에러에 대한 신뢰할 수 있는 출처(source of truth)는 `queryFn`이며 에러를 반환하는 `select` 함수는 `data`가 `undefined`이고 `isSuccess`가 `true`인 결과를 만든다. 잘못된 데이터에 대해 쿼리를 실패시키고 싶다면 `queryFn`에서, 캐싱과 무관한 에러 케이스라면 쿼리 훅 바깥에서 에러를 처리하기를 권장한다.

### 메모이제이션 (memoization)

`select` 함수는 다음 경우에만 다시 실행된다.

- `select` 함수 자체의 참조가 바뀐 경우
- `data`가 바뀐 경우

즉 위에서 본 것처럼 인라인으로 작성한 `select` 함수는 모든 렌더마다 실행된다. 이를 피하려면 `select` 함수를 `useCallback`으로 감싸거나, 의존성이 없다면 안정적인 함수 참조로 추출하면 된다.

```js
// useCallback으로 감싼 경우
export const useTodoCount = () => {
  return useTodos(useCallback((data) => data.length, []))
}
```

```js
// 안정적인 함수 참조로 추출한 경우
const selectTodoCount = (data) => data.length

export const useTodoCount = () => {
  return useTodos(selectTodoCount)
}
```

## 더 읽을거리

이 주제들에 대한 심층 가이드는 TkDodo의 [React Query Render Optimizations](https://tkdodo.eu/blog/react-query-render-optimizations)를 읽어 보자. `select` 옵션을 가장 잘 최적화하는 방법은 [React Query Selectors, Supercharged](https://tkdodo.eu/blog/react-query-selectors-supercharged)에서 볼 수 있다.
