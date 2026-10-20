---
title: "React Query 요청 이후에 남는 코드들"
description: "Query Factory로 요청 정의를 분리한 뒤에도 남는 select, invalidate, toast의 경계를 나눠본 기록입니다."
pubDate: 2026-06-11
tags:
  - react-query
  - frontend
  - architecture
commentsUrl: "https://github.com/DanSJKim/sjblog-comments/discussions/3"
---

Query Factory로 `queryKey`와 `queryFn`을 컴포넌트 밖으로 꺼내고 나면 React Query 코드가 꽤 정리된 것처럼 보인다. 나도 처음엔 그 정도면 충분하다고 생각했지만 실제 화면 코드는 거기서 끝나지 않았다. `select`, `invalidateQueries`, toast, modal close 같은 코드들이 남았다.

겉으로는 서로 달라 보인다. `select`는 query 쪽 코드이고 toast나 modal close는 mutation의 `onSuccess` 주변에 붙는다. 그래도 한 번 더 들여다보면 질문은 비슷하다.

이 코드는 서버 상태의 규칙에 가까운가, 아니면 지금 화면의 반응에 가까운가.

내 기준은 대략 세 갈래다. 서버 데이터의 원형과 요청 정의는 컴포넌트 밖으로 꺼내고 캐시 정합성처럼 항상 필요한 일은 공통으로 처리하되 화면마다 달라지는 데이터 가공과 UI 반응은 호출부 가까이에 남긴다.

그 기준을 query와 mutation 양쪽에 대입해봤다.

## select는 화면이 원하는 모양에 가깝다

Query Factory를 쓰면 query definition을 컴포넌트 밖으로 꺼낼 수 있다.

```ts
export const userQueries = {
  lists: () => ["users", "list"] as const,

  list: (params: UserSearchParams) =>
    queryOptions({
      queryKey: [...userQueries.lists(), params] as const,
      queryFn: () => fetchUsers(params),
      placeholderData: keepPreviousData,
    }),
}
```

여기까지는 서버에서 어떤 데이터를 가져올지 정하는 코드다. 애매했던 건 `select`였다.

예를 들어 사용자 목록을 select box option으로 바꿔야 한다고 해보자.

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

이 `select`를 factory 안에 넣을 수도 있다.

```ts
options: (params: UserSearchParams) =>
  queryOptions({
    queryKey: [...userQueries.lists(), params, "options"] as const,
    queryFn: () => fetchUsers(params),
    select: (data) =>
      data.users.map((user) => ({
        label: user.name,
        value: user.id,
      })),
  })
```

하지만 이렇게 두면 query definition이 화면의 모양까지 떠안게 된다. 이 변환을 여러 화면에서 공통으로 쓴다면 괜찮다. 반대로 특정 화면에서만 필요한 모양이라면 호출부에 남기는 편이 읽기 쉬웠다.

그래서 query 쪽에서는 대략 이렇게 나누고 있다.

- 서버 데이터의 원형에 가까운 정의는 factory가 관리한다.
- 여러 화면이 공유하는 변환은 factory로 올릴 수 있다.
- 특정 화면만 필요한 가공은 호출부에 남긴다.

여기서 봐야 할 건 “이 데이터가 서버 상태의 일부인가, 아니면 화면이 잠깐 원하는 모양인가”였다.

이 생각은 mutation을 볼 때도 이어졌다. 다만 query가 "가져온 데이터를 어떤 모양으로 볼 것인가"를 묻는다면 mutation은 "바꾼 뒤 무엇을 항상 맞춰야 하고 무엇은 화면마다 달라지는가"를 묻게 된다.

## query의 캐시 조작은 key 구조와 붙어 있어야 한다

데이터 가공과 달리 캐시 조작은 query key 구조를 알아야 한다.

```ts
await queryClient.invalidateQueries({
  queryKey: userQueries.lists(),
})

queryClient.setQueryData(
  userQueries.detail(updatedUser.id).queryKey,
  updatedUser,
)
```

이런 코드는 key를 손으로 다시 만들기 시작하면 금방 불안해진다. `["users", "list"]`를 여기저기 적어두면 목록 key 구조를 바꿀 때 수정 지점이 늘어난다.

그래서 query 이후의 캐시 처리는 factory가 만든 key를 기준으로 삼는다. 캐시를 어떻게 갱신할지는 호출부에서 결정하더라도, 어떤 key를 대상으로 할지는 factory에서 가져오는 쪽이 안전했다.

여기서는 query 쪽 기준이 두 갈래로 나뉜다.

- 화면용 데이터 가공: 호출부 가까이에 둔다.
- 캐시 대상 식별: factory의 key helper에서 가져온다.

## mutationOptions는 요청 정의만 남긴다

mutation도 비슷했다. 예전에는 커스텀 mutation 훅 안에 많은 것을 넣곤 했다.

```ts
const useUpdateUserMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, request }: UpdateUserVariables) =>
      updateUser(id, request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: userQueries.lists(),
      })
      toast.success("저장했어요")
      closeModal()
    },
  })
}
```

처음에는 편하지만 시간이 지나면 이 훅이 요청 정의, 캐시 정합성, UI 반응을 모두 떠안는다.

v5에는 `mutationOptions`가 있다.

```ts
export const userMutations = {
  update: () =>
    mutationOptions({
      mutationFn: ({ id, request }: UpdateUserVariables) =>
        updateUser(id, request),
    }),
}
```

`mutationOptions`에 대한 글은 `useMutation`이나 optimistic update 글에 비해 많지 않았고 공식 문서도 짧은 편이라 처음에는 이 helper의 역할이 애매했다.

써보면서 느낀 역할은 단순했다. `mutationOptions`는 mutation 훅을 대체한다기보다, mutation의 요청 정의를 컴포넌트 밖으로 꺼내는 도구에 가까웠다.

## invalidate와 toast는 같은 onSuccess가 아니다

요청 정의를 분리하고 나면 `onSuccess`에 남는 일이 둘로 갈린다.

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
```

여기서 invalidate는 UI 반응이 아니라 데이터 정합성을 맞추는 일이다. 이 mutation이 성공하면 사용자 목록 캐시는 다시 맞춰야 한다. 어떤 버튼에서 호출했는지와 상관없이 필요한 일이다.

반면 toast를 띄우거나 modal을 닫는 일은 특정 사용자 행동에 붙는다.

```tsx
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

같은 `updateUser` mutation을 다른 화면에서 쓴다면 toast 문구나 이동 경로는 달라질 수 있다. 그래서 화면마다 달라지는 반응은 `mutate` 호출부에 남길 때 흐름이 더 잘 읽혔다.

이렇게 나누면 `onSuccess` 안에 섞이던 일이 조금 분리된다.

- `mutationOptions`: 서버에 어떤 요청을 보낼지
- `useMutation` options: 성공/실패 시 항상 필요한 데이터 정합성 처리
- `mutate` callback: 특정 화면이나 사용자 행동에 붙은 UI 반응

## 커스텀 훅은 얇게 남길 수 있다

그렇다고 커스텀 mutation 훅을 아예 쓰지 말자는 뜻은 아니다. 같은 invalidate 처리가 여러 화면에서 반복된다면 얇은 훅이 더 나을 수 있다.

```ts
const useUpdateUserMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    ...userMutations.update(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: userQueries.lists(),
      })
    },
  })
}
```

다만 이 훅에는 UI 반응을 넣지 않으려고 한다. toast, modal close, navigation, form reset이 들어가기 시작하면 화면의 사정이 훅으로 밀려 들어온다.

내가 쓰는 커스텀 mutation 훅은 요청 정의와 항상 필요한 캐시 정합성까지만 감싸는 얇은 층으로 두려고 한다. 화면의 행동까지 가져가지 않는 것이 기준이다.

## 지금은 이렇게 보고 있다

query와 mutation을 따로 보려고 했지만 막상 나눠보니 기준은 비슷했다.

- 서버 데이터의 원형과 요청 정의는 컴포넌트 밖으로 뺀다.
- 화면마다 달라지는 데이터 가공과 UI 반응은 호출부 가까이에 남긴다.
- 캐시 key는 손으로 다시 만들지 않고 factory helper에서 가져온다.
- 항상 필요한 캐시 정합성 처리는 `useMutation` options나 얇은 커스텀 훅이 맡는다.
- 특정 사용자 행동에 붙은 반응은 `mutate` callback에서 처리한다.

처음에는 `queryOptions`와 `mutationOptions`를 같은 종류의 helper로 이해하려고 했다. 실제로 써보니 둘의 무게중심은 조금 달랐다.

query에서는 같은 query definition을 여러 읽기 API에서 재사용하는 일이 중요했다. 반면 mutation에서는 요청 정의 자체보다, 성공 이후에 어떤 코드를 공통으로 둘지와 어떤 코드를 화면에 남길지가 더 크게 다가왔다.

그래서 React Query 코드를 손본다는 건 훅을 줄이는 문제만은 아니었다. 서버 상태의 원형, 캐시 정합성, 화면 반응을 한곳에 밀어 넣지 않으려면 어디에서 끊어야 하는지 계속 확인하는 일에 가까웠다.

## 참고한 문서

- [TanStack Query v5 Query Options](https://tanstack.com/query/v5/docs/framework/react/guides/query-options)
- [TanStack Query v5 mutationOptions](https://tanstack.com/query/v5/docs/framework/react/reference/mutationOptions)
- [TanStack Query v5 Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)
- [TanStack Query v5 Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
- [TanStack Query v5 Updates from Mutation Responses](https://tanstack.com/query/v5/docs/framework/react/guides/updates-from-mutation-responses)
- [TkDodo: Mastering Mutations in React Query](https://tkdodo.eu/blog/mastering-mutations-in-react-query)
