---
title: "React Query v5에서 Query Factory 패턴으로 쿼리 관리하기"
description: "커스텀 훅 안에 숨긴 query 정의와 캐시 정책을 Query Factory로 다시 꺼내본 기록입니다."
pubDate: 2026-06-11
tags:
  - react-query
  - frontend
  - architecture
commentsUrl: "https://github.com/DanSJKim/sjblog-comments/discussions/2"
---

React Query를 어느 정도 쓰다 보면 커스텀 훅이 오히려 답답해지는 순간이 온다. 처음에는 요청 코드를 감싸두는 정도로 충분해 보인다.

```ts
const useUsersQuery = (params: UserSearchParams) => {
  const queryKey = ["users", "list", params]

  return useQuery({
    queryKey,
    queryFn: () => fetchUsers(params),
  })
}
```

`useUsersQuery(params)`만 호출하면 컴포넌트는 단순해지고, 요청 코드도 한곳에 모이는 것처럼 보였다. 하지만 query가 늘고 `invalidateQueries`나 `getQueryData`를 쓰기 시작하자 같은 key를 바깥에서 다시 만들고 있었다. 훅 안에 숨겨둔 건 요청 코드만이 아니라 query의 정의와 캐시를 다루는 기준이기도 했다.

처음에 신경 쓰였던 건 `queryFn`보다 `queryKey`였다. 훅 안에서 key를 만들다 보니 `invalidateQueries`나 `setQueryData`를 쓸 때 같은 key를 바깥에서 다시 만들어야 했다. 문자열을 손으로 맞추는 코드가 늘수록 어느 한쪽이 어긋날 가능성도 커졌다.

그래서 먼저 찾아본 건 Query Key Factory 패턴이었다. 나중에 다시 읽어보니 TkDodo의 "Effective React Query Keys" 글에서도 feature마다 query key factory를 두는 방식을 제안하고 있었다. key를 한곳에서 만들고, 목록/상세/검색처럼 계층을 나누면 캐시 조작을 더 안전하게 만들 수 있어 보였다.

```ts
const userKeys = {
  all: () => ["users"] as const,
  lists: () => [...userKeys.all(), "list"] as const,
  list: (params: UserSearchParams) => [...userKeys.lists(), params] as const,
  detail: (id: number) => [...userKeys.all(), "detail", id] as const,
}
```

그런데 key만 밖으로 빼고 나니 다음 문제가 보였다. `queryKey`는 재사용할 수 있게 됐지만, 그 key로 어떤 데이터를 가져오는지는 여전히 훅 안에 숨어 있었다. `useQuery`에서는 쓸 수 있지만 `prefetchQuery`, `fetchQuery`, `getQueryData`, `setQueryData`, `invalidateQueries` 같은 API와 연결하려면 query definition을 다시 조립해야 했다.

이 지점에서 TkDodo의 "The Query Options API"를 다시 읽었다. 그는 예전에 제안했던 Query Key Factory를 돌아보면서, `queryKey`와 `queryFn`을 분리한 것이 실수였다고 쓴다. key는 queryFn의 의존성을 표현하는데, 정작 key는 factory에 있고 queryFn은 커스텀 훅 안에 떨어져 있으면 둘 사이의 관계가 코드에 잘 남지 않는다.

그래서 TkDodo가 Query Options API 글에서 보여준 것처럼, key helper와 `queryOptions`로 만든 query definition을 같은 객체 안에 두는 쪽으로 방향을 틀었다.

결국 같은 query를 두 군데에서 조립하고 있었다. key만 체계적으로 관리하면 충분한지, 아니면 query 정의 자체를 밖으로 꺼내야 하는지 다시 보게 된 것도 그때였다.

## queryOptions가 해주는 일

TanStack Query v5에는 `queryOptions`라는 helper가 있다.

```ts
import { queryOptions } from "@tanstack/react-query"

const usersQuery = queryOptions({
  queryKey: ["users"],
  queryFn: fetchUsers,
  staleTime: 5_000,
})
```

런타임에서 특별한 처리를 하는 함수는 아니다. 입력한 option 객체를 거의 그대로 돌려주지만, TypeScript를 쓸 때는 이야기가 조금 달라진다.

먼저 option 객체를 따로 빼도 타입 검사가 유지된다. 그냥 객체로 빼면 `staleTime`을 `stallTime`처럼 잘못 적어도 놓칠 수 있다. `queryOptions`로 감싸면 query option을 만드는 시점에 타입 검사가 걸린다.

더 중요한 점은 `queryKey`와 `queryFn`의 반환 타입이 함께 따라온다는 데 있다. queryClient API를 쓰면 이 차이가 더 잘 드러난다.

```ts
const userDetailQuery = (id: number) =>
  queryOptions({
    queryKey: ["users", "detail", id] as const,
    queryFn: () => fetchUser(id),
  })

const data = queryClient.getQueryData(userDetailQuery(1).queryKey)
// data: User | undefined
```

예전에는 `getQueryData<User>(["users", "detail", id])`처럼 generic을 직접 적거나 key를 다시 만들어야 했다. `queryOptions`가 반환한 `queryKey`를 쓰면 key 자체에 queryFn의 결과 타입이 따라온다.

## Query Factory로 묶기

그래서 커스텀 훅 안에 query 정의를 숨기기보다, TkDodo가 제안한 Query Factory처럼 key와 queryFn을 같이 묶는 쪽이 더 맞다고 봤다.

```ts
import { keepPreviousData, queryOptions, skipToken } from "@tanstack/react-query"

interface User {
  id: number
  name: string
  email: string
}

interface UserSearchParams {
  keyword?: string
  page: number
  pageSize: number
}

interface UserListResponse {
  totalCount: number
  users: User[]
}

export const userQueries = {
  all: () => ["users"] as const,
  lists: () => [...userQueries.all(), "list"] as const,
  details: () => [...userQueries.all(), "detail"] as const,

  list: (params: UserSearchParams) =>
    queryOptions({
      queryKey: [...userQueries.lists(), params] as const,
      queryFn: () => fetchUsers(params),
      placeholderData: keepPreviousData,
    }),

  detail: (id: number | null) =>
    queryOptions({
      queryKey: [...userQueries.details(), id] as const,
      queryFn: id !== null ? () => fetchUser(id) : skipToken,
    }),
}
```

여기서 `all`, `lists`, `details`는 key-only helper다. 실제 요청을 만들지는 않고, 캐시 조작을 할 때 prefix로 쓴다. 반면 `list`, `detail`은 실제 query option을 만든다.

컴포넌트에서는 이렇게 쓴다.

```tsx
const UserListPage = () => {
  const [params, setParams] = useState<UserSearchParams>({
    page: 1,
    pageSize: 20,
  })
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

  const { data, isFetching } = useQuery(userQueries.list(params))
  const { data: selectedUser } = useQuery(userQueries.detail(selectedUserId))

  return (...)
}
```

커스텀 훅을 완전히 금지하자는 이야기는 아니다. 화면에서 반복되는 view 전용 가공이 있다면 얇은 훅을 둘 수 있다. 다만 query의 원본 정의는 훅 안에 숨기지 않는 쪽이 관리하기 쉬웠다.

`select`도 마찬가지다. 여러 화면이 공유해야 하는 변환이면 factory에서 다룰 수 있지만, 특정 화면에서만 필요한 가공이라면 호출부에 두는 편이 경계가 더 선명했다.

```tsx
const { data: options = [] } = useQuery({
  ...userQueries.list(params),
  select: (data) =>
    data.users.map((user) => ({
      label: user.name,
      value: user.id,
    })),
})
```

이렇게 두면 query definition은 서버에서 받은 데이터에 맞춰 유지되고, 화면이 원하는 모양은 화면 가까이에 둔다.

## 캐시 조작에서 덜 불안해진 부분

Query Factory를 쓰면서 가장 체감이 컸던 건 캐시 조작이다.

```ts
await queryClient.invalidateQueries({
  queryKey: userQueries.lists(),
})

await queryClient.invalidateQueries({
  queryKey: userQueries.detail(userId).queryKey,
})
```

목록 전체를 무효화할 때는 `lists()`를 쓰고, 특정 상세만 무효화할 때는 `detail(id).queryKey`를 쓴다. key 구조가 factory 안에 모여 있으면 캐시 정책을 따라가기 쉽고, key를 손으로 다시 만들 일도 줄어든다.

`setQueryData`에서도 같은 장점이 이어진다.

```ts
queryClient.setQueryData(userQueries.detail(updatedUser.id).queryKey, updatedUser)
```

여기서 `updatedUser` 타입이 `detail` query의 반환 타입과 맞물린다. query key가 단순한 배열이 아니라, query definition과 연결된 값처럼 동작하는 셈이다.

## nullable id는 enabled보다 skipToken

상세 query를 만들다 보면 id가 없을 때가 많다. 예를 들어 모달이 열렸을 때만 상세를 가져오거나, 선택된 행이 있을 때만 요청해야 하는 경우다.

예전에는 이런 코드를 자주 썼다.

```ts
useQuery({
  queryKey: ["users", "detail", id],
  queryFn: () => fetchUser(id ?? 0),
  enabled: id !== null,
})
```

동작은 하지만 마음에 걸리는 부분이 있다. `id ?? 0` 같은 dummy 값이 들어가고, `queryFn` 안에서는 여전히 `id`가 nullable처럼 남아 있다.

v5에서는 이 조건을 `skipToken`으로 표현할 수 있다.

```ts
detail: (id: number | null) =>
  queryOptions({
    queryKey: [...userQueries.details(), id] as const,
    queryFn: id !== null ? () => fetchUser(id) : skipToken,
  })
```

이렇게 하면 id가 없을 때 queryFn 자체가 실행되지 않아 호출부도 단순해진다.

```tsx
const { data: selectedUser } = useQuery(userQueries.detail(selectedUserId))
```

`enabled`가 필요 없는 건 아니다. 다만 nullable parameter 때문에 query를 막는 경우라면 `skipToken`이 타입과 실행 조건을 한곳에서 드러내준다.

## 어떤 경우에 꺼낼 만했나

Query Factory가 항상 필요한 건 아니다. 작은 화면에서 query가 한두 개뿐이고 캐시 조작도 없다면 커스텀 훅 하나로도 충분하다.

다음 조건이 겹치면 factory 분리를 검토할 만하다.

- 같은 query definition을 `useQuery`, `useSuspenseQuery`, `prefetchQuery`, `getQueryData` 등에서 재사용한다.
- 목록/상세/검색처럼 key 계층이 생긴다.
- nullable id detail query가 많다.
- 화면 전용 select와 서버 데이터 원형을 분리하고 싶다.

처음에는 커스텀 훅이 코드를 숨겨줘서 편했다. 시간이 지나고 보니 그 안에는 요청 함수뿐 아니라 key 구조와 캐시를 다루는 기준까지 같이 들어가 있었다. Query Factory를 쓰면서 그 기준을 다시 밖으로 꺼낸 셈이다.

이건 React Query를 더 잘 쓰는 요령이라기보다 서버 상태의 이름과 경계를 어디에 둘지 정하는 문제에 가까웠다. 지금은 queryKey와 queryFn을 한곳에 두고, 그 정의를 여러 API가 같이 쓰게 만드는 쪽이 더 납득된다.

query 쪽을 이렇게 정리하고 나니 mutation에서도 비슷한 질문이 남았다. 요청 정의는 밖으로 꺼낼 수 있겠는데, 성공 이후의 캐시 갱신이나 toast 같은 반응은 어디에 둬야 할까. 이 질문은 다음 글에서 따로 정리했다.

## 참고한 문서

- [TanStack Query v5 Query Options](https://tanstack.com/query/v5/docs/framework/react/guides/query-options)
- [TanStack Query v5 Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
- [TanStack Query v5 Disabling Queries](https://tanstack.com/query/v5/docs/framework/react/guides/disabling-queries)
- [TkDodo: Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)
- [TkDodo: The Query Options API](https://tkdodo.eu/blog/the-query-options-api)
