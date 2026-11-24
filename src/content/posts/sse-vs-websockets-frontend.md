---
title: "[번역] SSE vs WebSocket (그리고 폴링): 프론트엔드에서 실시간 전송 방식 고르기"
description: "Server-Sent Events, WebSocket, 폴링이 클라이언트 쪽에서 어떻게 다른지, 인증과 재연결에서 각각 어떤 함정이 있는지, 프로젝트별로 무엇을 고르면 되는지 정리한 Mario Sassine의 글 번역."
pubDate: 2026-11-24
tags:
  - translation
  - frontend
  - networking
---

> 이 글은 Mario Sassine의 [SSE vs WebSockets (and polling): picking a real-time transport on the front end](https://mariosassine.com/blog/sse-vs-websockets-frontend)를 번역한 글이다. 원문은 2026-09-05에 발행됐다.

사용자가 새로고침을 누르지 않아도 UI가 갱신되어야 한다. 선택지는 "타이머를 걸어 다시 물어보기"부터 "세션 내내 소켓을 열어 두기"까지 걸쳐 있다. 너무 무거운 쪽을 고르면 필요하지도 않았던 소켓 인프라를 운영하게 된다. 너무 가벼운 쪽을 고르면 UI가 한 박자씩 늦거나 API를 두들겨 대게 된다. 이 글은 세 가지 선택지를 클라이언트 쪽에서 살펴보고 각각 언제 맞는지 정리한다.

## 선택지

- **폴링.** 일정 간격으로 fetch한다. 새 인프라가 전혀 필요 없고 어디서나 동작한다.
- **롱 폴링.** 서버가 데이터가 생기거나 타임아웃이 날 때까지 요청을 열어 둔다. SSE가 있는 지금은 대부분 레거시지만 일부 폴백은 여전히 이 방식을 쓴다.
- **Server-Sent Events(SSE).** 서버가 계속 써 내려가는, 수명이 긴 HTTP 응답 하나다. 방향은 서버에서 클라이언트로 한쪽뿐이다. 브라우저 API는 `EventSource`다. 텍스트만 보낼 수 있다. 자동 재연결과 이어받기가 기본으로 들어 있다.
- **WebSocket.** HTTP 업그레이드를 거친 뒤 자체 프로토콜 위에서 동작하는 전이중(full-duplex) 연결이다. 텍스트와 바이너리를 모두 보낼 수 있다. 메시지 프로토콜, 재연결, 인증 흐름은 직접 만들어야 한다.

매니지드 실시간 서비스(Pusher, Ably, Supabase Realtime, Firebase)와 GraphQL 구독은 내부를 들여다보면 거의 항상 WebSocket이다. HTTP/3 기반의 WebTransport도 있고 알아 둘 만하지만 아직 이게 필요한 프론트엔드는 드물다.

## SSE와 WebSocket 나란히 비교하기

| | SSE | WebSocket |
| --- | --- | --- |
| 방향 | 서버에서 클라이언트로만 | 양방향 |
| 프로토콜 | 일반 HTTP(1.1 또는 2) | ws/wss로 업그레이드, 별도 프로토콜 |
| 브라우저 API | `EventSource`. 작지만 많은 일을 대신 해 준다 | `WebSocket`. 작고 나머지는 전부 그 위에 직접 만든다 |
| 재연결 | 자동 | 직접 구현 |
| 끊긴 뒤 이어받기 | `Last-Event-ID` 헤더. 서버가 놓친 이벤트를 다시 보내 줄 수 있다 | 직접 설계 |
| 페이로드 | UTF-8 텍스트. `data:` / `event:` / `id:` 형식으로 프레이밍된다 | 텍스트 또는 바이너리 프레임 |
| 브라우저에서 커스텀 인증 헤더 | 네이티브 `EventSource`로는 불가 | 핸드셰이크에서는 마찬가지로 불가 |
| 인프라 | 평범한 HTTP. 다만 버퍼링하는 프록시가 스트리밍을 깨뜨릴 수 있다 | WebSocket을 이해하는 로드 밸런서가 필요하고 때로는 스티키 세션도 필요하다 |
| HTTP/1.1 연결 수 제한 | 브라우저에서 도메인당 약 6개. HTTP/2 멀티플렉싱을 쓰면 사라진다 | 연결 하나. 6개 제한의 영향을 받지 않는다 |
| 확장 모델 | 클라이언트마다 열어 둔 HTTP 연결 하나 | 클라이언트마다 열어 둔 소켓 하나. 보통 pub/sub 팬아웃 계층이 더 붙는다 |

## 폴링이 여전히 맞는 자리

데이터가 느리게 또는 예측할 수 없게 바뀌고 몇 초쯤 오래된 값을 보여 줘도 괜찮다면, 폴링이 정답이고 가장 싸다.

- 대시보드, "새 항목" 배지, CI 상태, 1분에 한 번 갱신되는 IoT 패널.
- TanStack Query라면 `refetchInterval`과 `refetchOnWindowFocus`를 쓰면 되고 엣지의 `stale-while-revalidate`와도 잘 맞는다([캐싱 글](https://mariosassine.com/blog/cdn-and-frontend-caching-strategies) 참고).
- 상황에 맞춰 조절한다. 탭이 숨겨지면 간격을 늘리거나 멈추고 사용자 액션 직후에는 더 자주 폴링한다.
- 간격에 지터(jitter)를 준다. 클라이언트 천 개가 같은 초에 한꺼번에 폴링하지 않게 하기 위해서다.

대가는 두 가지다. 지연이 폴링 간격 밑으로는 내려가지 않고 아무것도 돌려받지 못하는 요청이 자주 생긴다.

## SSE가 맞는 경우

- 단방향 업데이트: 알림, 라이브 피드, 오래 걸리는 작업의 진행 상황, 읽기만 하는 가격 티커, "다른 사람이 이 문서를 수정했다"는 식의 알림.
- LLM의 토큰 스트리밍. 어시스턴트형 UI가 SSE를 쓰는 이유가 이것이다. 서버가 텍스트를 스트리밍하고 클라이언트는 그걸 이어 붙이며 클라이언트의 다음 프롬프트는 평범한 POST로 보낸다.
- 빌드·배포 로그를 패널에 스트리밍할 때.
- 자동 재연결과 이벤트 재전송을 직접 짜지 않고 쓰고 싶을 때.
- 인프라를 최소로 가져가고 싶을 때. SSE는 그냥 HTTP 응답이다.

```js
const es = new EventSource("/api/notifications", { withCredentials: true });

es.addEventListener("notification", (e) => {
  addToInbox(JSON.parse(e.data));
});

es.onerror = () => {
  // EventSource는 알아서 재연결한다. 상태만 반영하면 된다.
  setConnectionState("reconnecting");
};
es.onopen = () => setConnectionState("live");

// EventSource는 404가 떨어져도 끝없이 재시도한다. 다 썼으면 직접 닫는다.
// 언마운트 / 라우트 변경 시:  es.close();
```

## WebSocket이 맞는 경우

- 정말로 양방향이고 지연이 낮아야 할 때: 채팅, 협업 편집(커서 위치, 프레즌스, CRDT나 OT 연산), 멀티플레이어 게임, 실시간 드로잉, 주문까지 넣는 트레이딩 터미널.
- 바이너리 페이로드: 오디오·비디오 프레임, protobuf나 msgpack, 압축해 담은 게임 상태.
- 클라이언트가 워낙 자주 보내서 메시지마다 POST를 날리면 낭비일 때.

```ts
class RealtimeSocket {
  private ws?: WebSocket;
  private attempt = 0;
  private heartbeat?: number;

  connect() {
    this.ws = new WebSocket("wss://api.example.com/realtime?token=" + getToken());

    this.ws.onopen = () => {
      this.attempt = 0;
      this.send({ type: "subscribe", channels: currentChannels() });
      this.heartbeat = window.setInterval(() => this.send({ type: "ping" }), 25000);
    };

    this.ws.onclose = () => {
      clearInterval(this.heartbeat);
      const delay = Math.min(1000 * 2 ** this.attempt++, 30000) + Math.random() * 1000;
      setTimeout(() => this.connect(), delay); // 백오프 + 지터
    };

    this.ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
  }

  send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
```

## 인증의 함정

브라우저는 `EventSource`에도, `WebSocket` 핸드셰이크에도 임의의 헤더를 붙이지 못하게 한다. 그래서 `Authorization: Bearer`는 둘 다에서 쓸 수 없다. 흔히 쓰는 우회 방법은 이렇다.

- **쿠키.** 연결이 same-site라면 둘 다 쿠키를 보낸다(SSE는 `withCredentials: true`가 필요하다). httpOnly 세션 쿠키가 있다면 그게 가장 깔끔하다.
- **쿼리 스트링에 넣는 단기 토큰.** 둘 다에서 통한다. 다만 서버 액세스 로그와 프록시 로그에 남으므로, 몇 분 안에 만료되고 이 연결에만 쓸 수 있는 토큰을 발급한다.
- **fetch 기반 SSE 클라이언트.** `@microsoft/fetch-event-source` 같은 라이브러리는 네이티브 `EventSource` 대신 `fetch`를 쓴다. 그래서 헤더와 POST 본문을 보낼 수 있지만 재연결은 직접 구현해야 한다.
- **연결 직후 보내는 인증 메시지.** WebSocket에서 쓰는 패턴이다. 연결하자마자 첫 메시지로 토큰을 보내고 1~2초 안에 토큰이 오지 않거나 유효하지 않으면 서버가 소켓을 닫는다.

## 클라이언트에서 본 재연결과 복원력

### SSE

- `EventSource`는 자동으로 재시도하고 서버는 `retry:` 필드로 대기 시간을 알려 줄 수 있다.
- 그래도 직접 챙겨야 할 것이 있다. 재전송 뒤에 이벤트 중복을 걸러 내고 앱 상태를 다시 구독하고 "재연결 중" 표시를 띄워야 한다. 리소스가 사라졌다면 재시도를 멈춰야 하는데, `EventSource`는 404를 받아도 끝없이 두들기기 때문이다.

### WebSocket

- 지수 백오프에 지터를 더하고 재시도 상한을 둔 재연결을 만든다.
- 20~30초마다 하트비트 ping을 보낸다. 연결이 조용히 죽었을 때 브라우저가 `onclose`를 항상 제때 발생시키는 것은 아니어서 하트비트가 있어야 그 사실을 알 수 있다.
- 재연결할 때마다 채널을 다시 구독한다. 서버는 당신을 기억하지 않는다.
- 연결이 끊긴 동안 보내려던 메시지를 어떻게 할지 정한다. 큐에 쌓아 두거나, 버리고 재구독 때 상태를 다시 맞춘다.

### 둘 다

- `document.hidden`일 때는 일시 중지하거나 닫고 포커스가 돌아오면 재개한다.
- 컴포넌트가 언마운트될 때와 페이지를 이동할 때 닫는다.
- 뒤로/앞으로 캐시(bfcache)가 페이지를 얼렸다가 되살리는 경우를 살핀다.

## 점진적 전략

클라이언트가 보낼 일이 없다면 곧장 SSE에 폴링 폴백을 붙이는 쪽으로 간다. 이것만으로 거의 모든 경우를 감당하고 단순함도 유지된다. "WebSocket, 안 되면 SSE, 그것도 안 되면 롱 폴링"으로 이어지는 전체 사다리(socket.io가 하는 방식)는 정말로 양방향이 필요하고 까다로운 프록시까지 지원해야 할 때만 꺼낸다.

## 프로젝트별로 무엇을 고를까

| 프로젝트 | 선택 | 이유 |
| --- | --- | --- |
| 채팅 / 메시징 | WebSocket | 클라이언트가 자주 보내고 지연이 낮아야 하고 프레즌스가 있다 |
| 협업 문서 편집기 | WebSocket | 양방향 연산, 커서, 프레즌스 |
| 멀티플레이어 게임 | WebSocket (나중에 + WebTransport) | 빈도가 높고 바이너리인 경우가 많고 클라이언트 입력이 있다 |
| LLM 채팅 스트리밍 | SSE | 서버가 토큰을 스트리밍하고 프롬프트는 평범한 POST로 보낸다 |
| 알림 벨 | SSE | 서버에서 클라이언트로만 가고 자동 재연결이 필요하다 |
| 라이브 피드 / 타임라인 업데이트 | SSE | 단방향이고 재연결 때 재전송이 되면 좋다 |
| 오래 걸리는 내보내기 / 가져오기 진행률 바 | SSE | 작업 하나에 스트림 하나, 그러고 끝 |
| CI/CD 파이프라인 상태 페이지 | SSE 또는 폴링 | 빈도가 낮고 조금 오래된 값이어도 괜찮다 |
| 읽기 전용 가격 / 점수 티커 | SSE | 순수한 서버 푸시. 클라이언트도 뭔가 한다면 WebSocket을 쓴다 |
| "새 글이 있습니다" 배지 | 폴링 | 몇 초 늦어도 괜찮고 인프라가 필요 없다 |
| IoT 대시보드, 분당 약 1회 갱신 | 폴링 또는 SSE | 클라이언트 수와 지연 요구가 얼마나 빡빡한지에 달렸다 |
| 공유 커서 / 프레즌스 | WebSocket | 작은 양방향 메시지가 끊임없이 오간다 |

## 요약

몇 초쯤 오래된 값이 허용되고 새 인프라를 들이고 싶지 않다면 폴링이 기본값이다. SSE는 서버에서 클라이언트로 흐르는 스트림(알림, 피드, 작업 진행 상황, LLM 토큰)의 답이다. 평범한 HTTP이고 자동 재연결과 재전송이 되며 텍스트만 보낸다. WebSocket은 정말로 양방향이거나, 지연이 낮아야 하거나, 바이너리인 트래픽(채팅, 협업, 게임, 프레즌스)을 위한 것이고 재연결과 하트비트와 인증 흐름은 직접 책임져야 한다. SSE도 WebSocket 핸드셰이크도 브라우저에서 커스텀 인증 헤더를 실어 보낼 수 없으니, 쿠키나 단기 쿼리 토큰을 쓸 계획을 세워 둔다. 클라이언트가 보낼 일이 없다면 SSE에 폴링 폴백을 붙이고 거기서 멈춘다.
