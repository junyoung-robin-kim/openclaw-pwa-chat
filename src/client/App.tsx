import { useState } from "react";
import { ChatHeader } from "./components/ChatHeader";
import { MessageInput } from "./components/MessageInput";
import { MessageList } from "./components/MessageList";
import { usePushNotification } from "./hooks/usePushNotification";
import { useTheme } from "./hooks/useTheme";
import { useViewportFix } from "./hooks/useViewportFix";
import { useWebSocket } from "./hooks/useWebSocket";

export function App() {
  const { messages, streamingText, connectionState, waitingForReply, sendMessage, debugLog } =
    useWebSocket();
  const push = usePushNotification();
  const [showDebug, setShowDebug] = useState(false);
  useTheme();
  useViewportFix();

  return (
    <div id="chat-screen" className="screen">
      <ChatHeader
        connectionState={connectionState}
        onDebugToggle={() => setShowDebug((v) => !v)}
        showDebug={showDebug}
        push={push}
      />
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
            {waitingForReply ? "yes" : "no"}
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
