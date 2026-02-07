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
  // Convert mediaUrl to displayable URL
  let mediaSrc: string | undefined;
  if (message.mediaUrl) {
    if (message.mediaUrl.startsWith("http://") || message.mediaUrl.startsWith("https://")) {
      // HTTP URL: use as-is
      mediaSrc = message.mediaUrl;
    } else {
      // Local file: serve via /api/media
      mediaSrc = `/api/media?path=${encodeURIComponent(message.mediaUrl)}`;
    }
  }

  return (
    <div className={`message ${message.role}-message`}>
      <div className="message-content">
        {message.images && message.images.length > 0 && (
          <div className="message-images">
            {message.images.map((src, i) => (
              <img key={i} src={src} alt={`첨부 ${i + 1}`} className="message-image" />
            ))}
          </div>
        )}
        {mediaSrc && (
          <div className="message-images">
            <img src={mediaSrc} alt="미디어" className="message-image" />
          </div>
        )}
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
