import { useCallback, useRef, useState } from "react";

type Props = {
  onSend: (text: string) => void;
};

export function MessageInput({ onSend }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (e.key === "Enter" && !e.shiftKey && !isMobile) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="input-container">
      <div className="input-wrapper">
        <textarea
          ref={textareaRef}
          id="message-input"
          placeholder="메시지를 입력하세요..."
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setTimeout(() => {
              window.scrollTo(0, 0);
            }, 300);
          }}
        />
        <button className="send-btn" disabled={!text.trim()} onClick={handleSend} aria-label="Send">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M22 2L11 13M22 2L15 22L11 13M22 2L2 8L11 13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
