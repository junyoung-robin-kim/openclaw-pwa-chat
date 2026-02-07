/**
 * E2E 테스트: 메시지 유실 버그 재현
 *
 * 핵심 버그: localhost에서도 메시지 유실
 * - dots → 사라짐 → 새로고침하면 있음
 * - 서버는 저장했는데 WS broadcast가 클라이언트에 안 도착하거나 렌더링 실패
 */

import { test, expect, type Page } from "@playwright/test";

test.describe("PWA Chat 메시지 유실 버그", () => {
  test.beforeEach(async ({ page }) => {
    // PWA 접속
    await page.goto("/");

    // 연결 대기 (status-indicator가 connected 클래스를 가질 때까지)
    await page
      .waitForSelector(".status-indicator.connected", {
        state: "visible",
        timeout: 5000,
      })
      .catch(() => {
        // fallback: 입력창이 활성화되면 연결된 것으로 간주
        return page.waitForSelector('textarea, input[type="text"]', {
          state: "visible",
          timeout: 5000,
        });
      });
  });

  test("메시지 전송 후 DOM에 즉시 표시되어야 함", async ({ page }) => {
    const testMessage = `테스트 메시지 ${Date.now()}`;

    // WebSocket 프레임 로깅
    page.on("websocket", (ws) => {
      console.log(`WS opened: ${ws.url()}`);
      ws.on("framesent", (event) => console.log("→ SENT:", event.payload));
      ws.on("framereceived", (event) => console.log("← RECV:", event.payload));
      ws.on("close", () => console.log("WS closed"));
    });

    // 메시지 입력
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill(testMessage);
    await input.press("Enter");

    // 메시지가 DOM에 즉시 나타나는지 확인 (최대 2초 대기)
    const userMessage = page.locator(`text=${testMessage}`).first();
    await expect(userMessage).toBeVisible({ timeout: 2000 });

    // 응답이 오는지 확인 (최대 30초 대기 — AI 응답 시간)
    // typing indicator 또는 스트리밍 메시지가 보여야 함
    const streamingIndicator = page.locator(".typing-indicator, #streaming-message").first();
    await expect(streamingIndicator).toBeVisible({ timeout: 30000 });

    // 최종 응답이 표시되는지 확인
    const assistantMessages = page.locator(".assistant-message");
    await expect(assistantMessages).not.toHaveCount(0, { timeout: 60000 });

    // 페이지 새로고침 후에도 메시지가 유지되는지 확인
    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(testMessage).first()).toBeVisible({ timeout: 5000 });
  });

  test("스트리밍 응답이 사라지지 않고 최종 메시지로 변환되어야 함", async ({ page }) => {
    const testMessage = `스트리밍 테스트 ${Date.now()}`;

    // 메시지 전송
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill(testMessage);
    await input.press("Enter");

    // 스트리밍 시작 대기 (스트리밍 메시지 또는 typing indicator)
    const streamingElement = page.locator("#streaming-message, .typing-indicator").first();
    await expect(streamingElement).toBeVisible({ timeout: 30000 });

    // 스트리밍이 실제로 진행 중인지 확인 (streaming-message가 있으면)
    const streamingMessage = page.locator("#streaming-message");
    const hasStreaming = await streamingMessage.count();

    if (hasStreaming > 0) {
      // 스트리밍 텍스트 확인
      await expect(streamingMessage).toBeVisible();
    }

    // 스트리밍 종료 후 최종 메시지가 표시되는지 확인
    await page.waitForFunction(
      () => {
        const elem = document.querySelector("#streaming-message");
        return elem === null; // 스트리밍 요소가 사라져야 함
      },
      { timeout: 60000 },
    );

    // 최종 assistant 메시지가 존재하는지 확인
    const finalMessages = page.locator(".assistant-message");
    await expect(finalMessages).not.toHaveCount(0);

    // **버그 재현 지점**: 최종 메시지가 DOM에 없으면 실패
    const finalMessageCount = await finalMessages.count();
    expect(finalMessageCount).toBeGreaterThan(0);
  });

  test.skip("여러 탭에서 메시지가 동기화되어야 함 (known: 멀티탭 seq 동기화 미구현)", async ({
    page,
    context,
  }) => {
    const testMessage = `멀티탭 테스트 ${Date.now()}`;

    // 두 번째 탭 열기 + WS 연결 대기
    const page2 = await context.newPage();

    const ws2Connected = new Promise<void>((resolve) => {
      page2.on("websocket", (ws) => {
        ws.on("framereceived", (frame) => {
          try {
            const msg = JSON.parse(frame.payload as string);
            if (msg.type === "hello" || msg.type === "history") resolve();
          } catch {}
        });
      });
    });

    await page2.goto("/");
    await ws2Connected;

    // 첫 번째 탭에서 메시지 전송
    const input1 = page.locator('textarea, input[type="text"]').first();
    await input1.fill(testMessage);
    await input1.press("Enter");

    // 첫 번째 탭에 메시지 표시 확인
    await expect(page.getByText(testMessage).first()).toBeVisible({ timeout: 5000 });

    // 두 번째 탭에도 메시지가 broadcast되는지 확인
    await expect(page2.getByText(testMessage).first()).toBeVisible({ timeout: 10000 });

    await page2.close();
  });

  test("연결 끊김 후 재연결 시 메시지 복구", async ({ page, context }) => {
    const testMessage = `재연결 테스트 ${Date.now()}`;

    // 메시지 전송
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill(testMessage);
    await input.press("Enter");

    await expect(page.getByText(testMessage).first()).toBeVisible({ timeout: 2000 });

    // 네트워크를 오프라인으로 전환 (WebSocket 연결 끊김)
    await context.setOffline(true);
    await page.waitForTimeout(2000);

    // 네트워크 복구
    await context.setOffline(false);

    // 재연결 대기 (status-indicator.connected가 보일 때까지)
    await page
      .waitForSelector(".status-indicator.connected", {
        state: "visible",
        timeout: 10000,
      })
      .catch(() => {
        console.log("status-indicator 재연결 확인 실패, 계속 진행");
      });

    // 이전 메시지가 여전히 표시되는지 확인
    await expect(page.getByText(testMessage).first()).toBeVisible();

    // 새 메시지 전송 가능한지 확인
    const newMessage = `재연결 후 ${Date.now()}`;
    await input.fill(newMessage);
    await input.press("Enter");

    await expect(page.getByText(newMessage).first()).toBeVisible({ timeout: 2000 });
  });

  test("빠르게 여러 메시지를 보내도 모두 표시되어야 함", async ({ page }) => {
    const messages = [
      `빠른 메시지 1 ${Date.now()}`,
      `빠른 메시지 2 ${Date.now()}`,
      `빠른 메시지 3 ${Date.now()}`,
    ];

    const input = page.locator('textarea, input[type="text"]').first();

    // 빠르게 연속으로 전송
    for (const msg of messages) {
      await input.fill(msg);
      await input.press("Enter");
      await page.waitForTimeout(100); // 최소 딜레이
    }

    // 모든 메시지가 DOM에 표시되는지 확인
    for (const msg of messages) {
      await expect(page.getByText(msg).first()).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe("PWA Chat UI 상태", () => {
  test("연결 상태 표시", async ({ page }) => {
    await page.goto("/");

    // 연결 상태 표시 확인 (status-indicator.connected가 보여야 함)
    const statusIndicator = page.locator(".status-indicator.connected");
    await expect(statusIndicator).toBeVisible({ timeout: 10000 });
  });

  test("입력창이 비활성화되지 않아야 함", async ({ page }) => {
    await page.goto("/");

    const input = page.locator('textarea, input[type="text"]').first();
    await expect(input).toBeEnabled({ timeout: 5000 });
    await expect(input).not.toBeDisabled();
  });

  test("메시지 히스토리 렌더링", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 메시지 리스트 컨테이너가 존재하는지 확인
    const messageList = page.locator(".messages-container").first();
    await expect(messageList).toBeVisible({ timeout: 5000 });
  });
});
