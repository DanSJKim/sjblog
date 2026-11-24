---
title: "[번역] React Query 데이터 변환"
description: "react-query에서 꽤 흔하고도 중요한 작업인 데이터 변환을 어디서 어떻게 할 수 있는지 알아본다. TkDodo의 React Query Data Transformations 번역."
pubDate: 2026-11-24
tags:
  - translation
  - react-query
  - frontend
---

> 이 글은 TkDodo(Dominik Dorfmeister)의 [React Query Data Transformations](https://tkdodo.eu/blog/react-query-data-transformations)를 번역한 글이다. 원문은 2021-03-10에 발행됐고 2023-10-21에 마지막으로 수정됐다.

"Things I have to say about react-query" 2부에 온 것을 환영한다. 이 라이브러리와 그 주변 커뮤니티에 점점 더 깊이 관여하게 되면서 사람들이 자주 묻는 패턴을 몇 가지 더 발견했다. 처음에는 이것을 하나의 큰 글에 모두 적으려 했지만 좀 더 다루기 쉬운 조각으로 나누기로 했다. 첫 번째는 꽤 흔하면서도 중요한 작업인 데이터 변환이다.

## 데이터 변환

솔직히 인정하자. 우리 대부분은 GraphQL을 쓰지 *않는다*. 쓰고 있다면 아주 기뻐해도 좋다. 원하는 형식으로 데이터를 요청할 수 있는 호사를 누리고 있기 때문이다.

하지만 REST로 작업한다면 백엔드가 반환하는 것에 제약을 받는다. 그렇다면 react-query로 작업할 때 데이터를 어디서, 어떻게 변환하는 것이 가장 좋을까? 소프트웨어 개발에서 유일하게 쓸모 있는 답이 여기에도 그대로 적용된다.

> 상황에 따라 다르다.
>
> — 모든 개발자, 언제나

데이터를 변환*할 수 있는* 위치에 대한 3+1가지 접근법과 각각의 장단점을 살펴보자.

### 0. 백엔드에서

감당할 수 있다면 내가 가장 좋아하는 접근법이다. 백엔드가 우리가 원하는 구조 그대로 데이터를 반환한다면, 우리가 할 일은 아무것도 없다. 공개 REST API로 작업할 때처럼 많은 경우 비현실적으로 들릴 수 있지만 엔터프라이즈 애플리케이션에서는 충분히 달성할 수 있는 일이기도 하다. 백엔드를 직접 통제할 수 있고 정확히 내 유스케이스에 맞는 데이터를 반환하는 엔드포인트가 있다면, 기대하는 형태 그대로 데이터를 내려주는 쪽을 택하자.

🟢 &nbsp; 프런트엔드에서 할 일이 없음<br/>
🔴 &nbsp; 항상 가능하지는 않음

### 1. queryFn에서

`queryFn`은 `useQuery`에 전달하는 함수다. 이 함수는 Promise를 반환해야 하고 그 결과 데이터가 쿼리 캐시에 들어간다. 하지만 그렇다고 해서 반드시 백엔드가 내려주는 구조 그대로 데이터를 반환해야 한다는 뜻은 아니다. 반환하기 전에 변환할 수 있다.

```ts
const fetchTodos = async (): Promise<Todos> => {
  const response = await axios.get('todos')
  const data: Todos = response.data

  return data.map((todo) => todo.name.toUpperCase())
}

export const useTodosQuery = () =>
  useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  })
```

그러면 프런트엔드에서는 이 데이터를 "백엔드에서 원래 이렇게 온 것처럼" 다룰 수 있다. 코드 어디에서도 대문자로 바뀌지 *않은* todo 이름을 다룰 일이 없다. 원본 구조에도 접근할 수 *없다*. react-query-devtools를 보면 변환된 구조가 보이고 네트워크 트레이스를 보면 원본 구조가 보인다. 헷갈릴 수 있으니 염두에 두자.

또한 여기서는 react-query가 대신 해줄 수 있는 최적화가 없다. fetch가 실행될 때마다 변환도 실행된다. 변환 비용이 크다면 다른 대안 중 하나를 고려하자. 데이터 페칭을 추상화한 공용 api 레이어를 둔 회사도 있어서 변환을 하려 해도 이 레이어에 접근하지 못할 수 있다.

🟢 &nbsp; 코로케이션 측면에서 "백엔드와 아주 가까움"<br/>
🟡 &nbsp; 변환된 구조가 캐시에 들어가므로 원본 구조에 접근할 수 없음<br/>
🔴 &nbsp; fetch할 때마다 실행됨<br/>
🔴 &nbsp; 자유롭게 수정할 수 없는 공용 api 레이어가 있다면 쓸 수 없음

### 2. 렌더 함수에서

[1부](https://tkdodo.eu/blog/practical-react-query)에서 권한 대로 커스텀 훅을 만든다면, 거기서 손쉽게 변환할 수 있다.

```ts
const fetchTodos = async (): Promise<Todos> => {
  const response = await axios.get('todos')
  return response.data
}

export const useTodosQuery = () => {
  const queryInfo = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  })

  return {
    ...queryInfo,
    data: queryInfo.data?.map((todo) => todo.name.toUpperCase()),
  }
}
```

지금 상태로는 fetch 함수가 실행될 때뿐만 아니라 사실상 모든 렌더마다(데이터 페칭과 무관한 렌더까지 포함해서) 실행된다. 아마 전혀 문제가 되지 않겠지만 문제가 된다면 `useMemo`로 최적화할 수 있다. 의존성은 *가능한 한 좁게* 정의하도록 주의하자. queryInfo 안의 `data`는 무언가 실제로 바뀌지 않는 한 참조가 안정적이지만(바뀌었다면 변환을 다시 계산하는 것이 맞다), `queryInfo` 자체는 그렇지 *않다*. `queryInfo`를 의존성으로 넣으면 변환은 다시 모든 렌더마다 실행된다.

```ts
export const useTodosQuery = () => {
  const queryInfo = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  })

  return {
    ...queryInfo,
    // 🚨 이렇게 하지 말 것 - 여기서 useMemo는 아무 일도 하지 않는다!
    data: React.useMemo(
      () => queryInfo.data?.map((todo) => todo.name.toUpperCase()),
      [queryInfo],
    ),

    // ✅ queryInfo.data 기준으로 올바르게 메모이제이션한다
    data: React.useMemo(
      () => queryInfo.data?.map((todo) => todo.name.toUpperCase()),
      [queryInfo.data],
    ),
  }
}
```

특히 커스텀 훅 안에 데이터 변환과 결합할 추가 로직이 있다면 좋은 선택지다. data가 undefined일 수 있다는 점에 유의하고 다룰 때는 옵셔널 체이닝을 쓰자.

> **업데이트**
>
> React Query는 v4부터 [tracked queries](https://tkdodo.eu/blog/react-query-render-optimizations#tracked-queries)를 기본으로 켜 두므로 `...queryInfo`를 스프레드하는 것은 더 이상 권장하지 않는다. 모든 프로퍼티의 getter를 호출하게 되기 때문이다.

🟢 &nbsp; useMemo로 최적화할 수 있음<br/>
🟡 &nbsp; 정확한 구조를 devtools에서 확인할 수 없음<br/>
🔴 &nbsp; 문법이 조금 더 복잡함<br/>
🔴 &nbsp; data가 undefined일 수 있음<br/>
🔴 &nbsp; tracked queries와 함께 쓰는 것은 권장하지 않음

### 3. select 옵션 사용하기

v3에서 내장 셀렉터가 도입됐고 이것도 데이터 변환에 쓸 수 있다.

```ts
export const useTodosQuery = () =>
  useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
    select: (data) => data.map((todo) => todo.name.toUpperCase()),
  })
```

셀렉터는 `data`가 존재할 때만 호출되므로 여기서는 `undefined`를 신경 쓸 필요가 없다. 위와 같은 셀렉터 역시 모든 렌더마다 실행되는데, 함수의 동일성(identity)이 바뀌기 때문이다(인라인 함수다). 변환 비용이 크다면 useCallback으로 메모이제이션하거나, 안정적인 함수 참조로 추출하면 된다.

```ts
const transformTodoNames = (data: Todos) =>
  data.map((todo) => todo.name.toUpperCase())

export const useTodosQuery = () =>
  useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
    // ✅ 안정적인 함수 참조를 사용한다
    select: transformTodoNames,
  })

export const useTodosQuery = () =>
  useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
    // ✅ useCallback으로 메모이제이션한다
    select: React.useCallback(
      (data: Todos) => data.map((todo) => todo.name.toUpperCase()),
      [],
    ),
  })
```

나아가 select 옵션은 데이터의 일부만 구독하는 데에도 쓸 수 있다. 이 접근법이 정말 독특한 지점이 바로 이것이다. 다음 예시를 보자.

```js
export const useTodosQuery = (select) =>
  useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
    select,
  })

export const useTodosCount = () =>
  useTodosQuery((data) => data.length)
export const useTodo = (id) =>
  useTodosQuery((data) => data.find((todo) => todo.id === id))
```

여기서는 커스텀 셀렉터를 `useTodosQuery`에 전달해서 [useSelector](https://react-redux.js.org/api/hooks#useselector)와 비슷한 API를 만들었다. 커스텀 훅은 여전히 이전처럼 동작한다. `select`를 전달하지 않으면 `undefined`가 되어 전체 상태가 반환되기 때문이다.

하지만 셀렉터를 전달하면 이제 셀렉터 함수의 결과만 구독하게 된다. 이것은 꽤 강력하다. todo의 이름을 업데이트하더라도 `useTodosCount`로 개수만 구독하는 컴포넌트는 리렌더되지 *않는다*는 뜻이기 때문이다. 개수는 바뀌지 않았으니 react-query는 이 옵저버에게 업데이트를 알리지 *않기로* 할 수 있다 🥳 (여기서는 조금 단순화한 설명이고 기술적으로 완전히 맞는 말은 아니라는 점에 유의하자. 렌더 최적화는 3부에서 더 자세히 다룬다).

🟢 &nbsp; 가장 뛰어난 최적화<br/>
🟢 &nbsp; 부분 구독이 가능함<br/>
🟡 &nbsp; 옵저버마다 구조가 다를 수 있음<br/>
🟡 &nbsp; 구조적 공유가 두 번 수행됨 (이것도 [3부](https://tkdodo.eu/blog/react-query-render-optimizations)에서 더 자세히 다룬다)

---

오늘은 여기까지다 👋. 궁금한 점이 있다면 [블루스카이](https://bsky.app/profile/tkdodo.eu)로 편하게 연락하거나, 원문 글에 댓글을 남겨도 좋다.
