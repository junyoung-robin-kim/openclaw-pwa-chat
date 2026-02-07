import { useEffect } from "react";

export function useViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const app = document.getElementById("app");
    if (!app) return;

    function onResize() {
      const h = vv!.height;
      app!.style.height = `${h}px`;
      document.documentElement.style.height = `${h}px`;
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;

      // 키보드가 올라오면 메시지 목록도 스크롤 바텀으로
      requestAnimationFrame(() => {
        const container = document.querySelector(".messages-container");
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }

    function onScroll() {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
    }

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onScroll);
    onResize();

    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onScroll);
    };
  }, []);
}
