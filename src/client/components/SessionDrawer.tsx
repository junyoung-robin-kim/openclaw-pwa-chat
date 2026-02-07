import type { SessionInfo } from "../hooks/useSessions";

type Props = {
  sessions: SessionInfo[];
  currentSessionId: string;
  onSwitch: (sessionId: string) => void;
  onCreate: () => void;
  onDelete: (sessionId: string) => void;
  onClose: () => void;
};

function formatSessionName(sessionId: string): string {
  if (sessionId === "default") return "기본 대화";
  const parts = sessionId.split(":");
  if (parts.length > 1) {
    const ts = parseInt(parts[1], 36);
    if (!isNaN(ts)) {
      const d = new Date(ts);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
    }
  }
  return sessionId;
}

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function SessionDrawer({
  sessions,
  currentSessionId,
  onSwitch,
  onCreate,
  onDelete,
  onClose,
}: Props) {
  return (
    <div className="session-drawer">
      <div className="session-drawer-header">
        <span>대화 목록</span>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="session-new-btn" onClick={onCreate}>
            + 새 대화
          </button>
          <button className="session-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      <div className="session-list">
        {sessions.length === 0 && <div className="session-empty">대화가 없습니다</div>}
        {sessions.map((s) => (
          <div
            key={s.sessionId}
            className={`session-item ${s.sessionId === currentSessionId ? "active" : ""}`}
            onClick={() => onSwitch(s.sessionId)}
          >
            <div className="session-item-info">
              <div className="session-item-name">{formatSessionName(s.sessionId)}</div>
              <div className="session-item-meta">
                {s.messageCount}개 · {formatTime(s.lastTimestamp)}
              </div>
            </div>
            {s.sessionId !== "default" && (
              <button
                className="session-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(s.sessionId);
                }}
              >
                🗑
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
