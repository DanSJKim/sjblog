---
title: "SSE vs WebSockets (and polling): picking a real-time transport on the front end"
url: "https://mariosassine.com/blog/sse-vs-websockets-frontend"
pubDate: 2026-11-26
tags:
  - networking
  - frontend
---

전문 번역은 [SSE vs WebSocket (그리고 폴링)](/sjblog/posts/sse-vs-websockets-frontend/)에 있다. 실시간 갱신 방식을 고를 때 기준으로 삼을 것만 추렸다.

- 클라이언트가 서버로 보낼 일이 없으면 폴링 폴백을 둔 SSE로 충분하다. WebSocket은 양방향 통신, 낮은 지연, 바이너리 전송 중 하나가 정말 필요할 때 고른다.
- 몇 초 늦어도 되는 데이터라면 폴링이 비용이 가장 적게 든다. TanStack Query의 `refetchInterval`로 바로 적용할 수 있다.
- 브라우저는 `EventSource`에도 WebSocket 핸드셰이크에도 `Authorization` 헤더를 붙이지 못한다. 쿠키나 몇 분 안에 만료되는 쿼리 토큰으로 인증한다.
- `EventSource`는 404를 받아도 재시도를 멈추지 않는다. 언마운트와 라우트 변경 때 직접 닫는다.
- WebSocket을 쓰면 재연결(지수 백오프와 지터), 하트비트, 재구독을 직접 만들어야 한다.
