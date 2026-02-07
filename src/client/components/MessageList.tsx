import { useEffect, useRef } from "react";
import type { StoredMessage } from "../types";
import { Message } from "./Message";
import { StreamingMessage } from "./StreamingMessage";
import { TypingIndicator } from "./TypingIndicator";

type Props = {
  messages: StoredMessage[];
  streamingText: string | null;
  waitingForReply: boolean;
};

export function MessageList({ messages, streamingText, waitingForReply }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  function checkNearBottom() {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 100;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  function scrollToBottom(force = false) {
    if (!force && !isNearBottom.current) return;
    const el = containerRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }

  useEffect(() => {
    // Always force scroll when message count changes
    scrollToBottom(true);
  }, [messages.length]);

  useEffect(() => {
    scrollToBottom();
  }, [streamingText]);

  return (
    <div className="messages-container" ref={containerRef} onScroll={checkNearBottom}>
      <div id="messages">
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {streamingText !== null && <StreamingMessage text={streamingText} />}
        {streamingText === null && waitingForReply && <TypingIndicator />}
      </div>
    </div>
  );
}
