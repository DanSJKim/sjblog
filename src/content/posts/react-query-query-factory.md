---
title: "React Query v5에서 Query Factory 패턴으로 쿼리 관리하기"
description: "커스텀 훅 안에 숨겨둔 queryKey와 queryFn을 밖으로 꺼내면 무엇이 달라지는지 정리해본다."
pubDate: 2026-06-11
tags:
  - react-query
  - frontend
  - architecture
---

React Query를 쓰다 보면 처음에는 커스텀 훅을 만들게 된다.

```ts
const useUsersQuery = (params: UserSearchParams) => {
  const queryKey = ["users", "list", params]

  return useQuery({
    queryKey,
    queryFn: () => fetchUsers(params),
  })
}
```

컴포넌트에서는 `useUsersQuery(params)`만 호출하면 되니 얼핏 보기에는 깔끔하다. 나도 한동안 이 방식이 자연스럽다고 생각했다. 그런데 query가 늘어나고, 캐시를 직접 만져야 하는 상황이 많아지면서 같은 불편함을 반복해서 만났다.

훅 안에 `queryKey`와 `queryFn`이 같이 들어가 있으면, 그 query definition을 다른 곳에서 쓰기 어렵다. `useQuery`에서는 쓸 수 있지만 `prefetchQuery`, `fetchQuery`, `getQueryData`, `setQueryData`, `invalidateQueries` 같은 API와 연결하려면 결국 같은 key를 다시 만들거나 훅 밖으로 빼야 한다.

그때부터 질문이 바뀌었다.

커스텀 훅을 더 잘 만들 문제가 아니라, query 정의를 어디에 두는 게 맞을까?

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

런타임에서 특별한 일을 많이 하는 함수는 아니다. 입력한 option 객체를 거의 그대로 돌려준다. 이 helper의 가치는 TypeScript 쪽에서 더 잘 보인다.

먼저 option 객체를 따로 빼도 타입 검사가 유지된다. 그냥 객체로 빼면 `staleTime`을 `stallTime`처럼 잘못 적어도 놓치는 경우가 생길 수 있다. `queryOptions`로 감싸면 query option을 만드는 시점에 타입 검사가 걸린다.

더 크게 느껴지는 부분은 `queryKey`와 `queryFn`의 반환 타입이 연결된다는 점이다.

```ts
const userDetailQuery = (id: number) =>
  queryOptions({
    queryKey: ["users", "detail", id] as const,
    queryFn: () => fetchUser(id),
  })

const { data } = useQuery(userDetailQuery(1))
// data: User | undefined
```

여기까지만 보면 `useQuery`를 조금 편하게 쓰는 정도로 보인다. 차이는 queryClient API를 쓸 때 더 분명해진다.

```ts
const data = queryClient.getQueryData(userDetailQuery(1).queryKey)
// data: User | undefined
```

예전에는 `getQueryData<User>(["users", "detail", id])`처럼 generic을 직접 적거나 key를 다시 만들어야 했다. `queryOptions`가 반환한 `queryKey`를 쓰면 key 자체에 queryFn의 결과 타입이 따라온다. key를 재사용하는 코드가 많아질수록 이 차이가 꽤 크게 느껴진다.

## Query Factory로 묶기

그래서 query를 커스텀 훅이 아니라 factory 객체로 묶는 쪽이 더 낫다고 판단했다.

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

여기서 `all`, `lists`, `details`는 key-only helper다. 실제 요청을 만들지는 않고, 캐시 조작을 할 때 prefix로 쓴다.

`list`, `detail`은 실제 query option을 만든다. 컴포넌트에서는 이렇게 쓴다.

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

커스텀 훅을 완전히 금지하자는 이야기는 아니다. 화면에서 반복되는 view 전용 가공이 있다면 얇은 훅을 둘 수 있다. 다만 query의 원본 정의는 훅 안에 숨기지 않는 쪽이 더 나았다.

`select`도 마찬가지다. 여러 화면이 공유해야 하는 변환이면 factory에서 다룰 수 있지만, 특정 화면에서만 필요한 가공이라면 호출부에 두는 편이 더 명확했다.

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

이렇게 두면 query definition은 서버 데이터의 원형에 가깝게 남고, 화면이 원하는 모양은 화면 가까이에 남는다.

## 캐시 조작이 단순해진다

Query Factory를 쓰면서 가장 체감이 컸던 건 캐시 조작이다.

```ts
await queryClient.invalidateQueries({
  queryKey: userQueries.lists(),
})

await queryClient.invalidateQueries({
  queryKey: userQueries.detail(userId).queryKey,
})
```

목록 전체를 무효화할 때는 `lists()`를 쓰고, 특정 상세만 무효화할 때는 `detail(id).queryKey`를 쓴다. key 구조가 factory 안에 모여 있으니 캐시 정책을 읽기도 쉽고, key를 손으로 다시 만들 일도 줄어든다.

이 차이는 `getQueryData`나 `setQueryData`에서 더 잘 보인다.

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

동작은 할 수 있지만 마음에 걸리는 부분이 있다. `id ?? 0` 같은 dummy 값이 들어가고, `queryFn` 안에서는 여전히 `id`가 nullable처럼 남아 있다.

v5에서는 이 조건을 `skipToken`으로 표현할 수 있다.

```ts
detail: (id: number | null) =>
  queryOptions({
    queryKey: [...userQueries.details(), id] as const,
    queryFn: id !== null ? () => fetchUser(id) : skipToken,
  })
```

이렇게 하면 id가 없을 때 queryFn 자체가 실행되지 않는다. 호출부도 단순해진다.

```tsx
const { data: selectedUser } = useQuery(userQueries.detail(selectedUserId))
```

`enabled`가 필요 없는 건 아니다. 다만 nullable parameter 때문에 query를 막는 경우라면 `skipToken`이 타입과 실행 조건을 한곳에서 드러내준다.

## mutation은 정의와 후속 처리를 나눈다

query를 factory로 빼기 시작하면 mutation도 비슷한 모양으로 정리하고 싶어진다. v5에는 `mutationOptions`도 있다.

```ts
import { mutationOptions } from "@tanstack/react-query"

interface UpdateUserVariables {
  id: number
  request: {
    name: string
    email: string
  }
}

export const userMutations = {
  update: () =>
    mutationOptions({
      mutationFn: ({ id, request }: UpdateUserVariables) =>
        updateUser(id, request),
    }),
}
```

여기서 의도적으로 `onSuccess`, `onError`, `onSettled`를 넣지 않았다. mutation definition에는 “어떻게 요청할 것인가”만 둔다. 후속 처리는 컴포넌트에서 두 층으로 나눈다.

```tsx
const queryClient = useQueryClient()

const { mutate: updateUser, isPending } = useMutation({
  ...userMutations.update(),
  onSuccess: async () => {
    await queryClient.invalidateQueries({
      queryKey: userQueries.lists(),
    })
  },
})

const handleSubmit = (values: UpdateUserVariables) => {
  updateUser(values, {
    onSuccess: () => {
      toast.success("저장했어요")
      closeModal()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })
}
```

내 기준은 이렇다.

`useMutation`의 options-level callback에는 데이터 정합성을 맞추는 처리를 둔다. 캐시 무효화, optimistic update, rollback처럼 이 mutation이 성공하거나 실패했을 때 항상 필요한 일이다.

`mutate` 호출부의 callback에는 UI 반응을 둔다. toast, modal close, navigation, form reset처럼 이 버튼 클릭 한 번에 붙어 있는 일이다.

TanStack Query 문서에서도 `useMutation`에 넘긴 callback이 먼저 실행되고, `mutate` 호출 시 넘긴 callback이 나중에 실행된다고 설명한다. invalidate를 `async`로 처리하고 `await`하면 캐시 갱신이 끝난 뒤 UI 반응을 이어가게 만들 수 있다.

이 구분이 없으면 mutation definition이 어느새 UI 사정까지 알게 된다. 반대로 모든 걸 `mutate` 호출부에 넣으면 호출부가 여러 개일 때 invalidate를 빠뜨리기 쉽다. 요청 정의, 캐시 정합성, UI 반응을 나눠두는 편이 유지보수하기 좋았다.

## mutateAsync는 필요할 때만

대부분은 `mutate`와 callback으로 충분했다. `mutateAsync`는 결과를 `await`해서 다음 흐름에 직접 써야 할 때만 쓴다.

```ts
try {
  const user = await updateUserAsync(values)
  navigate(`/users/${user.id}`)
} catch (error) {
  if (error instanceof Error) {
    toast.error(error.message)
  }
}
```

`mutateAsync`를 쓰면 `try/catch`가 같이 따라와야 한다. 단순 성공/실패 UI만 필요하다면 `mutate` 쪽이 더 가볍다.

## Suspense 화면에서 필터 변경 다루기

마지막으로 Suspense 화면에서 필터를 바꾸는 경우가 있었다.

일반 `useQuery`라면 `placeholderData: keepPreviousData`로 이전 데이터를 유지하면서 새 데이터를 가져올 수 있다. 그런데 `useSuspenseQuery`를 쓰는 화면에서는 이야기가 조금 다르다. `useSuspenseQuery`에는 `placeholderData` 옵션이 없고, 새 query가 suspend되면 이미 보이던 화면이 다시 fallback으로 바뀔 수 있다.

React 문서에서는 이미 드러난 UI가 fallback으로 가려지는 것을 막고 싶을 때 상태 업데이트를 transition으로 표시하라고 설명한다. 이 패턴을 query 필터 변경에도 적용할 수 있다.

```tsx
const UserBoard = () => {
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [isPending, startTransition] = useTransition()

  const handleSearch = (nextParams: UserSearchParams) => {
    startTransition(() => {
      setParams(nextParams)
    })
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <UserBoardContent
        params={params}
        isPending={isPending}
        onSearch={handleSearch}
      />
    </Suspense>
  )
}
```

자식 컴포넌트는 `useSuspenseQuery`를 호출하고, transition 중에는 기존 화면 위에 overlay를 올린다.

```tsx
const UserBoardContent = ({ params, isPending, onSearch }: Props) => {
  const { data } = useSuspenseQuery(userQueries.list(params))

  return (
    <section className="content">
      <SearchForm onSearch={onSearch} />
      <UserTable users={data.users} />
      {isPending && <LoadingOverlay />}
    </section>
  )
}
```

처음 진입할 때는 Suspense fallback이 뜬다. 그건 괜찮다. 아직 보여줄 화면이 없기 때문이다.

문제는 이미 목록을 보고 있는 상태에서 필터만 바꿀 때다. 이때 전체 fallback으로 돌아가면 화면이 깜빡인다. `startTransition`으로 업데이트를 감싸면 React가 이전 화면을 유지한 채 새 데이터를 기다릴 수 있다. 사용자는 이전 데이터를 보면서 “지금 갱신 중이구나”만 overlay로 알게 된다.

이 패턴은 모든 화면에 필요하지 않다. Suspense를 쓰고 있고, 필터 변경 때 이전 화면을 유지해야 할 때만 쓴다. 일반 `useQuery` 화면이라면 `placeholderData: keepPreviousData`가 더 단순하다.

## 언제 이 패턴이 맞을까

Query Factory가 항상 필요한 건 아니다. 작은 화면에서 query가 한두 개뿐이고 캐시 조작도 없다면 커스텀 훅 하나로도 충분하다.

다음 조건이 겹치면 factory로 빼는 편이 좋아진다.

- 같은 query definition을 `useQuery`, `useSuspenseQuery`, `prefetchQuery`, `getQueryData` 등에서 재사용한다.
- 목록/상세/검색처럼 key 계층이 생긴다.
- mutation 후 invalidate 범위를 일관되게 관리해야 한다.
- nullable id detail query가 많다.
- 화면 전용 select와 서버 데이터 원형을 분리하고 싶다.

처음에는 커스텀 훅이 코드를 숨겨줘서 편했다. 하지만 시간이 지나니 내가 숨긴 건 코드가 아니라 query의 정의와 캐시 정책이었다. Query Factory는 그걸 다시 꺼내는 방식에 가깝다.

React Query를 더 잘 쓰는 문제라기보다, 서버 상태의 이름과 경계를 어디에 둘 것인가에 가까운 문제였다. 지금은 queryKey와 queryFn을 한곳에 두고, 그 정의를 여러 API가 같이 쓰게 만드는 쪽이 더 납득된다.

## 참고한 문서

- [TanStack Query v5 Query Options](https://tanstack.com/query/v5/docs/framework/react/guides/query-options)
- [TanStack Query v5 mutationOptions](https://tanstack.com/query/v5/docs/framework/react/reference/mutationOptions)
- [TanStack Query v5 Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
- [TanStack Query v5 Disabling Queries](https://tanstack.com/query/v5/docs/framework/react/guides/disabling-queries)
- [TanStack Query v5 Suspense](https://tanstack.com/query/v5/docs/framework/react/guides/suspense)
- [React Suspense: preventing already revealed content from hiding](https://react.dev/reference/react/Suspense#preventing-already-revealed-content-from-hiding)
- [TkDodo: The Query Options API](https://tkdodo.eu/blog/the-query-options-api)
