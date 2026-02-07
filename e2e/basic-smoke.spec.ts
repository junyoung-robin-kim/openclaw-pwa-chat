/**
 * E2E 기본 스모크 테스트
 * PWA가 실행되고 기본적인 UI가 렌더링되는지 확인
 */

import { test, expect } from "@playwright/test";

test.describe("PWA Chat 기본 스모크 테스트", () => {
  test("페이지가 로드되고 타이틀이 표시됨", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/PWA Chat|OpenClaw/i);
  });

  test("메시지 입력창이 존재함", async ({ page }) => {
    await page.goto("/");

    const input = page.locator('textarea, input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 10000 });
  });

  test("연결 상태가 표시됨", async ({ page }) => {
    await page.goto("/");

    // 연결 상태 또는 메시지 리스트가 보이면 성공
    const hasConnectionStatus = await page.locator(".status-indicator").count();
    const hasMessageList = await page.locator(".messages-container").count();

    expect(hasConnectionStatus + hasMessageList).toBeGreaterThan(0);
  });

  test("WebSocket 연결이 성공함", async ({ page }) => {
    let wsConnected = false;

    page.on("websocket", (ws) => {
      console.log(`WebSocket opened: ${ws.url()}`);
      wsConnected = true;
    });

    await page.goto("/");
    await page.waitForTimeout(3000); // WebSocket 연결 대기

    expect(wsConnected).toBe(true);
  });
});
