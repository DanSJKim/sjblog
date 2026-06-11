---
title: "React Query 후속 처리는 어디에 둘까"
description: "useQuery와 useMutation을 보다 보니 서버 데이터의 원형, 캐시 정합성, 화면 반응을 어디에 둘지 계속 헷갈렸습니다."
pubDate: 2026-06-11
tags:
  - react-query
  - frontend
  - architecture
commentsUrl: "https://github.com/DanSJKim/sjblog-comments/discussions/3"
---

Query Factory를 정리한 뒤에는 후속 처리 쪽이 신경 쓰였다.

`queryKey`와 `queryFn`을 한곳에 두는 건 알겠는데, 그 다음 처리는 어디에 두는 게 좋을까?

처음에는 이 질문을 query와 mutation에서 따로 봤다. query에서는 `select`를 어디에 둘지 고민했고, mutation에서는 `onSuccess`를 어디에 둘지 고민했다. 그런데 코드를 보다 보니 둘 다 비슷한 문제였다.

서버에서 데이터를 가져오거나 바꾼 다음, 그 결과를 화면과 캐시에 어떻게 반영할 것인가.

지금은 대략 이렇게 나눠 보고 있다.

- 서버 데이터의 원형과 요청 정의는 컴포넌트 밖에 둔다.
- 캐시 정합성처럼 항상 필요한 처리는 공통 경계에 둔다.
- 화면마다 달라지는 데이터 가공과 UI 반응은 호출부 가까이에 둔다.

이 글은 그 고민을 query와 mutation 양쪽에서 나눠본 기록이다.

## query에서는 원형과 화면용 가공을 나눈다

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

여기까지는 서버에서 어떤 데이터를 가져올지에 가까운 정의다. 내가 헷갈렸던 건 `select`였다.

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

하지만 이렇게 두면 query definition이 화면의 모양까지 알게 된다. 이 변환을 여러 화면에서 공통으로 쓴다면 괜찮다. 반대로 특정 화면에서만 필요한 모양이라면 호출부에 남기는 편이 더 명확했다.

그래서 query 쪽은 이렇게 나눴다.

- 서버 데이터의 원형에 가까운 정의는 factory에 둔다.
- 여러 화면이 공유하는 변환은 factory에 둘 수 있다.
- 특정 화면만 필요한 가공은 호출부에 둔다.

query 이후 처리에서 중요한 건 “이 데이터가 서버 상태의 일부인가, 아니면 화면이 잠깐 원하는 모양인가”였다.

이 생각은 mutation을 볼 때도 이어졌다. 다만 query가 "가져온 데이터를 어떤 모양으로 볼 것인가"에 가깝다면, mutation은 "바꾼 뒤 무엇을 항상 맞춰야 하고, 무엇은 화면마다 달라지는가"에 더 가까웠다.

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

이런 코드는 key를 손으로 다시 만들기 시작하면 금방 불안해진다. `["users", "list"]`를 여기저기 적어두면 어느 순간 목록 key 구조를 바꿨을 때 같이 고쳐야 할 곳이 생긴다.

그래서 query 이후의 캐시 처리는 factory가 만든 key를 쓰는 쪽이 낫다. 캐시를 어떻게 갱신할지는 호출부에서 결정하더라도, 어떤 key를 대상으로 할지는 factory를 통해 가져오는 편이 안전했다.

query 쪽 처리는 결국 두 갈래로 나뉘었다.

- 화면용 데이터 가공: 호출부에 가까울수록 좋다.
- 캐시 대상 식별: factory의 key helper를 쓸수록 좋다.

## mutation에서는 요청과 후속 처리를 나눈다

mutation도 비슷한 고민이 있었다. 예전에는 커스텀 mutation 훅 안에 많은 것을 넣곤 했다.

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

처음에는 편하다. 그런데 시간이 지나면 이 훅이 요청 정의, 캐시 정합성, UI 반응을 모두 알게 된다.

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

`mutationOptions`에 대한 글은 `useMutation`이나 optimistic update 글에 비해 많지 않았다. 공식 문서도 짧은 편이다. 그래서 처음에는 이 helper가 어디까지 필요한지 애매했다.

써보면서 느낀 역할은 단순했다. `mutationOptions`는 mutation 훅을 대체한다기보다 mutation의 요청 정의를 컴포넌트 밖으로 꺼내는 도구에 가깝다.

## 항상 필요한 일과 화면마다 달라지는 일을 나눈다

요청 정의를 분리하고 나면 후속 처리를 어디에 둘지 정해야 한다.

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

여기서 invalidate는 UI 반응이라기보다 데이터 정합성에 가깝다. 이 mutation이 성공하면 사용자 목록 캐시는 다시 맞춰야 한다. 어떤 버튼에서 호출했는지와 상관없이 필요한 일이다.

반면 toast를 띄우거나 modal을 닫는 일은 특정 사용자 행동에 더 가깝다.

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

같은 `updateUser` mutation을 다른 화면에서 쓴다면 toast 문구나 이동 경로는 달라질 수 있다. 그래서 화면마다 달라지는 반응은 `mutate` 호출부에 남기는 편이 자연스러웠다.

지금은 이렇게 보고 있다.

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

다만 이 훅에는 UI 반응을 넣지 않으려고 한다. toast, modal close, navigation, form reset이 들어가기 시작하면 훅이 화면의 사정을 알게 된다.

내 기준에서 커스텀 mutation 훅은 요청 정의와 항상 필요한 캐시 정합성까지만 감싸는 얇은 층이다.

## mutateAsync는 흐름 제어가 필요할 때만

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

`mutateAsync`를 쓰면 `try/catch`도 같이 따라온다. 흐름을 직접 제어해야 하는 상황이면 괜찮지만, 단순히 성공하면 toast를 띄우고 실패하면 에러를 보여주는 정도라면 `mutate` 쪽이 더 가볍다.

## 지금은 이렇게 정리했다

query와 mutation을 같이 놓고 보니 기준은 비슷했다.

- 서버 데이터의 원형과 요청 정의는 컴포넌트 밖에 둔다.
- 화면마다 달라지는 데이터 가공과 UI 반응은 호출부 가까이에 둔다.
- 캐시 key는 손으로 다시 만들지 않고 factory helper를 쓴다.
- 항상 필요한 캐시 정합성 처리는 `useMutation` options나 얇은 커스텀 훅에 둔다.
- 특정 사용자 행동에 붙은 반응은 `mutate` callback에 둔다.

처음에는 `queryOptions`와 `mutationOptions`를 같은 종류의 helper로 이해하려고 했다. 그런데 실제로는 조금 달랐다.

query에서는 같은 query definition을 여러 읽기 API에서 재사용하는 일이 중요했다. mutation에서는 요청 정의보다 그 이후의 경계를 나누는 일이 더 크게 느껴졌다.

결국 React Query 코드를 정리한다는 건 훅을 줄이는 문제가 아니었다. 서버 상태의 원형, 캐시 정합성, 화면 반응을 어디까지 분리할지 정하는 문제에 가까웠다.

## 참고한 문서

- [TanStack Query v5 Query Options](https://tanstack.com/query/v5/docs/framework/react/guides/query-options)
- [TanStack Query v5 mutationOptions](https://tanstack.com/query/v5/docs/framework/react/reference/mutationOptions)
- [TanStack Query v5 Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)
- [TanStack Query v5 Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
- [TanStack Query v5 Updates from Mutation Responses](https://tanstack.com/query/v5/docs/framework/react/guides/updates-from-mutation-responses)
- [TkDodo: Mastering Mutations in React Query](https://tkdodo.eu/blog/mastering-mutations-in-react-query)
