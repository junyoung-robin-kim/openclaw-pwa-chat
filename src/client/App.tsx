import { useState } from "react";
import { ChatHeader } from "./components/ChatHeader";
import { MessageInput } from "./components/MessageInput";
import { MessageList } from "./components/MessageList";
import { SessionDrawer } from "./components/SessionDrawer";
import { usePushNotification } from "./hooks/usePushNotification";
import { useSessions } from "./hooks/useSessions";
import { useTheme } from "./hooks/useTheme";
import { useViewportFix } from "./hooks/useViewportFix";
import { useWebSocket } from "./hooks/useWebSocket";

export function App() {
  const sessionHook = useSessions();
  const { messages, streamingText, connectionState, waitingForReply, sendMessage, debugLog } =
    useWebSocket(sessionHook.currentSessionId);
  const push = usePushNotification();
  const [showDebug, setShowDebug] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  useTheme();
  useViewportFix();

  return (
    <div id="chat-screen" className="screen">
      <ChatHeader
        connectionState={connectionState}
        onDebugToggle={() => setShowDebug((v) => !v)}
        showDebug={showDebug}
        push={push}
        sessionId={sessionHook.currentSessionId}
        onSessionsToggle={() => {
          sessionHook.fetchSessions();
          setShowSessions((v) => !v);
        }}
      />
      {showSessions && (
        <SessionDrawer
          sessions={sessionHook.sessions}
          currentSessionId={sessionHook.currentSessionId}
          onSwitch={(id) => {
            sessionHook.switchSession(id);
            setShowSessions(false);
          }}
          onCreate={() => {
            sessionHook.createSession();
            setShowSessions(false);
          }}
          onDelete={sessionHook.deleteSession}
          onClose={() => setShowSessions(false)}
        />
      )}
      {showDebug && (
        <div
          style={{
            background: "#111",
            color: "#0f0",
            fontSize: "10px",
            fontFamily: "monospace",
            padding: "4px",
            maxHeight: "100px",
            overflow: "auto",
            borderBottom: "1px solid #333",
          }}
        >
          <button
            style={{ fontSize: "10px", marginBottom: "2px" }}
            onClick={() => {
              const text =
                debugLog.join("\n") +
                "\nmsgs=" +
                messages.length +
                " stream=" +
                (streamingText !== null ? "yes" : "no") +
                " wait=" +
                (waitingForReply ? "yes" : "no");
              navigator.clipboard.writeText(text).then(() => alert("copied!"));
            }}
          >
            📋 Copy
          </button>
          {debugLog.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
          <div style={{ color: "#ff0" }}>
            msgs={messages.length} stream={streamingText !== null ? "yes" : "no"} wait=
            {waitingForReply ? "yes" : "no"} session={sessionHook.currentSessionId}
          </div>
        </div>
      )}
      <MessageList
        messages={messages}
        streamingText={streamingText}
        waitingForReply={waitingForReply}
      />
      <MessageInput onSend={sendMessage} />
    </div>
  );
}
