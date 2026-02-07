import type { usePushNotification } from "../hooks/usePushNotification";
import type { ConnectionState } from "../types";

const BUILD_VERSION = "v2.5";

type PushHook = ReturnType<typeof usePushNotification>;

type Props = {
  connectionState: ConnectionState;
  onDebugToggle?: () => void;
  showDebug?: boolean;
  push?: PushHook;
  onSessionsToggle?: () => void;
};

export function ChatHeader({
  connectionState,
  onDebugToggle,
  showDebug,
  push,
  onSessionsToggle,
}: Props) {
  const pushIcon =
    !push || push.pushState === "unsupported"
      ? null
      : push.pushState === "subscribed"
        ? "🔔"
        : push.pushState === "denied"
          ? "🔕"
          : "🔕";

  return (
    <header className="chat-header">
      <div className="header-left">
        <button
          className="icon-btn"
          onClick={onSessionsToggle}
          aria-label="Sessions"
          style={{ fontSize: "14px" }}
          title="대화 목록"
        >
          ☰
        </button>
        <div className={`status-indicator ${connectionState === "connected" ? "connected" : ""}`} />
        <button
          className="icon-btn"
          onClick={onDebugToggle}
          aria-label="Debug"
          style={{ fontSize: "14px", opacity: showDebug ? 1 : 0.4 }}
        >
          🐛
        </button>
      </div>
      <div className="header-title">
        OpenClaw <span style={{ fontSize: "0.6em", opacity: 0.5 }}>{BUILD_VERSION}</span>
      </div>
      <div className="header-right" style={{ display: "flex", gap: "4px" }}>
        {pushIcon && (
          <button
            className="icon-btn"
            onClick={() => {
              if (push!.pushState === "subscribed") push!.unsubscribe();
              else push!.subscribe();
            }}
            aria-label="Push notifications"
            style={{ fontSize: "14px" }}
            title={push!.pushState === "subscribed" ? "알림 끄기" : "알림 켜기"}
          >
            {pushIcon}
          </button>
        )}
        <button className="icon-btn" onClick={() => location.reload()} aria-label="Refresh">
          🔄
        </button>
      </div>
    </header>
  );
}
