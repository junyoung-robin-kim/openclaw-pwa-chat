import ReactMarkdown from "react-markdown";
import type { StoredMessage } from "../types";

type Props = {
  message: StoredMessage;
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function Message({ message }: Props) {
  return (
    <div className={`message ${message.role}-message`}>
      <div className="message-content">
        <div className="message-text">
          {message.role === "assistant" ? (
            <ReactMarkdown>{message.text}</ReactMarkdown>
          ) : (
            message.text
          )}
        </div>
        <div className="message-time">{formatTime(message.timestamp)}</div>
      </div>
    </div>
  );
}
