---
title: "[번역] 더 강력해진 React Query 셀렉터"
description: "select를 최대한 활용하는 방법과 몇 가지 TypeScript 팁. TkDodo의 React Query Selectors, Supercharged 번역."
pubDate: 2026-11-24
tags:
  - translation
  - react-query
  - frontend
  - performance
---

> 이 글은 TkDodo(Dominik Dorfmeister)의 [React Query Selectors, Supercharged](https://tkdodo.eu/blog/react-query-selectors-supercharged)를 번역한 글이다. 원문은 2025-08-04에 발행됐다.

아, [`select`](https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations#select). React Query에서 내가 가장 좋아하는 기능 중 하나이자, 바라건대 당신에게는 영영 필요 없을 기능이다. 하지만 필요해지면 구세주가 되어 줄 수 있다.

> **주의**
>
> `select`는 작은 애플리케이션에서 React Query를 막 시작하는 단계라면 아마 필요 없을 최적화다. 특히 여기서 쓰는 작위적인 예시에서는 굳이 쓰는 게 말이 안 될 수도 있다. 늘 그렇듯 고급 개념을 보여주는 것과 몇 줄을 넘지 않아야 하는 단순한 코드 예시 사이에서 균형을 잡아야 한다.

## 전역 상태와 구독

[#18: Inside React Query](https://tkdodo.eu/blog/inside-react-query#querycache)에서 설명했듯이 React Query는 하나의 전역 상태, 즉 **QueryCache**로 이루어져 있다. QueryCache에는 모든 쿼리에 대한 정보가 담겨 있다. 쿼리에서 무언가 바뀔 때마다 우리는 모든 **QueryObserver**(`useQuery`로 만들어지는 것들)에게 그 변경을 알리고 싶다.

이상적으로는 모든 컴포넌트가 모든 것을 구독하는 상황은 피하고 싶다. `todos` 쿼리의 변경이 `profile` 쿼리에만 관심 있는 컴포넌트를 리렌더시켜서는 안 된다. 그럴 거라면 최상위에 `useState`를 두고 `React Context`로 애플리케이션 전체에 뿌리면 그만이었을 것이다. 구독을 제어하고 세밀하게 만드는 것, 그것이 애초에 상태 관리 솔루션이 존재하는 이유다.

## QueryHash

알다시피 React Query에는 위에서 말한 기능이 내장되어 있다. 당연히 `useQuery`는 QueryCache 전체를 구독하지 않는다. `useQuery`에 전달한 QueryKey는 결정적으로(deterministically) 해시되어 **QueryHash**가 되고 `useQuery`는 그 쿼리의 변경에 대해서만 알림을 받는다.

본질적으로는 관심 있는 쿼리로 미리 걸러내는 것과 같다. 그리고 대부분은 이걸로 충분하다. 한 엔드포인트의 데이터가 바뀌면 컴포넌트가 리렌더된다. 다른 엔드포인트의 데이터가 바뀌면 리렌더되지 않는다. 그럼 뭐가 더 필요할까?

## 세밀한 구독

때로는 엔드포인트가 많은 데이터를 반환하는데 그 전부에 관심이 있지는 않다. 특히 자주 바뀌는 필드와 드물게 바뀌는 필드가 섞여 있는 상황에서는 전체 응답은 캐시에 그대로 저장하면서도 더 세밀하게 구독하고 싶을 수 있다. 그때 `select`를 쓸 수 있다.

## `select`란 무엇인가?

`select`는 `useQuery`에 전달할 수 있는 옵션으로, 컴포넌트가 구독할 결과를 고르거나 변환하거나 그 밖의 방식으로 계산할 때 쓴다. 파생 상태를 얻는 방법으로, redux에서 [셀렉터로 데이터를 파생하는 방식](https://redux.js.org/usage/deriving-data-selectors)과 *매우* 비슷하다.

> **redux?**
>
> 셀렉터는 `redux`에만 있는 것이 아니다. 다만 flux 아키텍처와 아주 잘 맞아서 react에서 그런 식으로 대중화됐을 뿐이다. [zustand](https://zustand.docs.pmnd.rs/) 같은 다른 상태 관리 솔루션에도 셀렉터가 있다.
>
> 내 생각에 셀렉터는 어떤 데이터에 접근하고 싶은지를 기술하는 가장 명시적인 방법이다. React도 shim을 통해 [useSyncExternalStoreWithSelector](https://github.com/facebook/react/blob/c499adf8c89bbfd884f4d3a58c4e510001383525/packages/use-sync-external-store/src/useSyncExternalStoreWithSelector.js)를 노출하고 있다.

우리 API에서 상품 데이터를 가져온다고 해보자.

```ts
const productOptions = (id: string) => {
  return queryOptions({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(id),
  })
}
```

그리고 상품 제목만 렌더링하는 컴포넌트를 만들고 싶다.

```tsx
function ProductTitle({ id }: Props) {
  const productQuery = useSuspenseQuery(productOptions(id))

  return <h1>{productQuery.data.title}</h1>
}
```

이 코드는 분명 동작하고 대부분의 상황에서는 이걸로 충분할 것이다. 하지만 엔드포인트가 구매 수나 댓글 수처럼 제목보다 훨씬 자주 바뀔 수 있는 정보도 함께 반환할 수 있다.

물론 관련 없는 무언가가 바뀌었다고 이 단순한 컴포넌트가 가끔 리렌더된다고 세상이 끝나는 건 아니다. 하지만 이걸 정말로 최적화하고 싶다고 가정해 보자.

여기서 `select`가 도움이 된다. 컴포넌트가 모든 상품 데이터를 구독하게 하는 대신, 관심 있는 필드(들)만 골라내는 것이다.

```tsx
function ProductTitle({ id }: Props) {
  const productTitleQuery = useSuspenseQuery({
    ...productOptions(id),
    select: (data) => data.title,
  })

  return <h1>{productTitleQuery.data}</h1>
}
```

`select`를 사용하는 컴포넌트는 `select` 함수의 결과만 구독하므로 그 결과가 바뀔 때만 리렌더된다. 이 예시에서 제목은 아마 자주 바뀌지 않을 테니 상품 데이터의 다른 프로퍼티가 자주 바뀌더라도 컴포넌트는 거의 리렌더될 필요가 없다.

더 좋은 점도 있다. 원한다면 여러 프로퍼티를 "골라낼" 수도 있고 참조 안정성을 걱정할 필요도 없다. React Query가 `select` 결과에 [구조적 공유](https://tkdodo.eu/blog/react-query-render-optimizations#structural-sharing)를 적용하기 때문이다. 이 점에서 `zustand` 같은 다른 라이브러리와 다르다. 그런 라이브러리는 [원자적 셀렉터](https://tkdodo.eu/blog/working-with-zustand#prefer-atomic-selectors)를 선호한다.

그래서 이런 코드도 기대한 대로 동작한다.

```tsx
function Product({ id }: Props) {
  const productQuery = useSuspenseQuery({
    ...productOptions(id),
    select: (data) => ({
      title: data.title,
      description: data.description,
    }),
  })

  return (
    <main>
      <h1>{productQuery.data.title}</h1>
      <p>{productQuery.data.description}</p>
    </main>
  )
}
```

`title`이나 `description` 중 하나라도 바뀌면 리렌더되고 그렇지 않으면 리렌더되지 않는다. 꽤 멋지다.😎

## Select 추상화에 타입 붙이기

위 예시들에서 눈치채지 못했을 수도 있지만 모두 유효한 TypeScript 코드다. 사실 유효할 뿐만 아니라 타입 안전하고 추론까지 된다. 즉 `useQuery`가 돌려주는 객체의 `data` 필드는 `select`가 반환하는 타입으로 지정된다.

다만 이건 타입 추론이 마법을 부리도록 🪄 내버려 둘 때만 동작한다. 그러려면 `useQuery`에 제네릭 타입 파라미터를 수동으로 "제공"하지 않아야 한다. 아직 읽지 않았다면 [#6: React Query and TypeScript](https://tkdodo.eu/blog/react-query-and-type-script#infer-all-the-things)에서 더 자세한 내용을 읽어 보길 바란다.

이건 비교적 지키기 쉽지만 한 가지 질문이 생긴다. `select`를 포함하는 재사용 가능한 추상화를 TypeScript로 어떻게 작성할 수 있을까? 예를 들어 `select`를 인자로 받는 `productOptions`를 만들려면 어떤 타입 마법이 필요할까?

```ts
const productOptions = (id: string, select) => {
  return queryOptions({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(id),
    // ⬇️ select의 타입은 어떻게 지정하지?
    select,
  })
}
```

내 평소 대답은 이렇다. 하지 마라! 우리는 공유 옵션을 추상화하기 쉽게 하면서도 사용처에서 추가 옵션을 직접 지정할 수 있도록 하려고 [Query Options API](https://tkdodo.eu/blog/the-query-options-api)를 만들었다. 지금까지 본 모든 코드에서 TypeScript를 쓰고 있다는 티가 거의 나지 않는 것도 그 때문이다. 멋지지 않은가?

하지만 TkDodo, 내가 *정말로* 원한다면? 좋다, 꼭 해야겠다면 조금 더 손이 간다. 특히 `select`를 선택적으로 만들고 싶다면 더 그렇다.

```ts
const productOptions = <TData = ProductData>(
  id: string,
  select?: (data: ProductData) => TData,
) => {
  return queryOptions({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(id),
    select,
  })
}
```

여기서 요령은 타입 파라미터 `TData`를 추가해 기본값을 `queryFn`이 반환하는 타입으로 두고 `select`를 그 타입에서 `TData`로 가는 함수로 정의하는 것이다. 이렇게 하면 `select`를 제공하지 않을 때 `data`는 `ProductData`가 되고 변환 함수를 제공하면 그 함수가 반환하는 값을 돌려받는다. 궁금하다면 [TypeScript Playground](https://www.typescriptlang.org/play/?#code/JYWwDg9gTgLgBAbzgRwK4FMoE8DyYbAQB2AzgDRyonoDKVY6p6AihtnAL5wBmUEIcAEQABGAENS4gMYBrAPRR0YqTAC0aTFkEBuAFC6YWBnDgAFPgBNUKgCJjxcALyJdJgjAA26AFxwSMKGAiAHNXOAt0EilA-EIiX39AkN0OfQipDzFFHlQiFTiedBgpAAtzCCsVAApgCwSAoOCASl9ykGBqAB5yypg7cQA+fSlifzgwS2sYPAJRpzhOgBV+sXmeqZWBqrDa+qTgsjDqLxUAfl8qi3sxVsnba6anAbhl691Hx2eEMMUYVCgiCg2LhYqMqt8TCYNNgANLoLC+ADaAHIJhUpsiKLUALqHSFAzQAMXicCqH2e3CKpXW1VqTTxkOO6BUDI4TRSw1G8CQVwcXGcVFo9EY1FYmiqaN6MziJCqyNqqgAjJjwtcnqrxAA6dxeOBNdlyOT4kwAPVOuiAA)를 보자.

## 메모이제이션으로 `select` 강화하기

이왕 최적화하는 김에 한 걸음 더 나아가서 `select`에서 실행하는 함수가 *정말로* 비싸다고 가정해 보자. 이를테면 큰 상품 목록을 순회하면서 수천 개의 사용자 리뷰를 바탕으로 상품별 평균 평점을 계산하고 유효하지 않은 항목을 걸러내고 평점이 높은 순으로 정렬하는 일을 한 번에 하는 식이다. 이제부터 이걸 `expensiveSuperTransformation`이라고 부르자. `select`로 평범하게 코드를 작성하면 이렇게 된다.

```tsx
function ProductList({ filters }: Props) {
  const productsQuery = useSuspenseQuery({
    ...productListOptions(filters),
    select: (data) => expensiveSuperTransformation(data),
  })

  return (
    <ul>
      {productsQuery.data.map((product) => (
        <li>{product.summary}</li>
      ))}
    </ul>
  )
}
```

잘 동작하겠지만 한 가지 함정이 있다. 이제 `expensiveSuperTransformation`이 원인이 무엇이든 모든 렌더마다 실행된다. 이유를 이해하려면 React Query가 `select` 함수를 다시 실행하는 두 가지 경우를 알아야 한다.

1. `data`가 바뀔 때.

   당연하다. 새 `data`를 받으면 변환 결과도 달라질 수 있으니 실행해야 한다. 이건 괜찮다.

2. `select` 함수 자체가 바뀔 때.

   React Query는 추가적인 성능 대책으로 `select` 함수의 참조 동일성을 추적한다. "같은 함수"가 전달되면 같은 결과만 나올 수 있다는 걸 알기 때문에 다시 실행하는 것을 건너뛸 수 있다(함수 안에서 공유된 가변 상태에 의존하지 않는 한 그렇다. 그러니 그러지 말자 😅).

하지만 인라인 함수는 렌더마다 항상 새로 만들어지므로 이 최적화가 적용되지 않는다. 사실 이건 좋은 기능이다. 추가 props를 클로저로 감싸도 오래된(stale) 결과를 걱정할 필요가 없기 때문이다.

```tsx
function ProductList({ filters, minRating }: Props) {
  const productsQuery = useSuspenseQuery({
    ...productListOptions(filters),
    select: (data) => expensiveSuperTransformation(data, minRating),
  })

  return (
    <ul>
      {productsQuery.data.map((product) => (
        <li>{product.summary}</li>
      ))}
    </ul>
  )
}
```

이제 `minRating`이 바뀌면 `select` 함수가 다시 실행되어 최신 계산 결과를 주니 아주 만족스럽다. 그렇다면 첫 번째 예시에서는 계산을 건너뛰어도 되지만 두 번째에서는 안 된다는 걸 React Query에 어떻게 알려줄 수 있을까?

### `select` 안정화하기

핵심은 `select`에 안정적인 참조를 전달하는 것이고 React에는 이를 위한 좋은 내장 수단이 있다. `useCallback`이다.

> **쓸모 있는 useCallback**
>
> 얼마 전에 [The Useless useCallback](https://tkdodo.eu/blog/the-useless-use-callback)이라는 글을 쓴 걸 생각하면 이 상황의 아이러니를 나도 모르지 않는다. 하지만 여기서는 실제로 꽤 좋다. 😂

```tsx
function ProductList({ filters, minRating }: Props) {
  const productsQuery = useSuspenseQuery({
    ...productListOptions(filters),
    select: React.useCallback(
      (data) => expensiveSuperTransformation(data, minRating),
      [minRating],
    ),
  })

  return (
    <ul>
      {productsQuery.data.map((product) => (
        <li>{product.summary}</li>
      ))}
    </ul>
  )
}
```

이제 `minRating`이 바뀌지 않는 한 `select`에 안정적인 참조가 전달되고 그게 바로 우리가 원하는 것이다. 의존성이 전혀 없다면 함수를 컴포넌트 밖으로 옮기기만 해도 안정적으로 만들 수 있다. 빈 의존성 배열을 가진 `useCallback`은 필요 없다.

```tsx
const select = (data: Array<Product>) =>
  expensiveSuperTransformation(data)

function ProductList({ filters }: Props) {
  const productsQuery = useSuspenseQuery({
    ...productListOptions(filters),
    select,
  })

  return (
    <ul>
      {productsQuery.data.map((product) => (
        <li>{product.summary}</li>
      ))}
    </ul>
  )
}
```

## 최종 보스

여기까지는 잘 동작한다. 하지만 잠깐, 아직 남았다. 이제 같은 컴포넌트를 여러 번 렌더링하면 어떻게 될까? `select`가 몇 번 실행될 것 같은가?

컴포넌트당 한 번 실행된다. 정확히는 `QueryObserver`당 한 번인데 `select`의 결과가 거기에 캐시되기 때문이다. `useQuery`를 호출할 때마다 `QueryObserver`가 하나씩 만들어지므로 각각에 대해 `select`를 적어도 한 번은 실행해야 한다.

아쉬운 일이다. `expensiveSuperTransformation`이 여전히 `data` 하나당 한 번 넘게 실행될 수 있다는 뜻인데 우리는 그걸 *정말로* 원하지 않는다. 어떻게 해야 할까?

당연히 메모이제이션을 더 추가한다!

### 메모이제이션 더하기

우리가 정말 원하는 건 `expensiveSuperTransformation`을 입력값 기준으로 메모이제이션하는 것뿐이다. 하지만 React Query는 이를 옵저버별로 캐시하므로 이 작업은 React Query 바깥에서 이뤄져야 한다. 그래서 바로 그 일을 해주는 [fast memoize](https://www.npmjs.com/fast-memoize) 같은 라이브러리를 가져올 수 있다.

```tsx
import memoize from 'fast-memoize'

const select = memoize((data: Array<Product>) =>
  expensiveSuperTransformation(data),
)

function ProductList({ filters }: Props) {
  const productsQuery = useSuspenseQuery({
    ...productListOptions(filters),
    select,
  })

  return (
    <ul>
      {productsQuery.data.map((product) => (
        <li>{product.summary}</li>
      ))}
    </ul>
  )
}
```

이제 `ProductList`를 세 번 렌더링한다고 해보자. `select`는 세 번 모두 실행되지만(`QueryObserver`당 한 번이고 이건 피할 방법이 없다), `expensiveSuperTransformation`은 한 번만 실행된다. 같은 `data`로 실행되므로 `fast-memoize`의 캐시에 두 번 적중하기 때문이다. `data`가 바뀌어도 마찬가지다. `select`는 세 번 실행되지만 `expensiveSuperTransformation`은 한 번만 실행된다.

이것이 우리가 할 수 있는 최대한의 최적화다.

---

오늘은 여기까지다. 궁금한 점이 있다면 [블루스카이](https://bsky.app/profile/tkdodo.eu)로 편하게 연락하거나 원문 글에 댓글을 남겨도 좋다.
