import { useCallback, useRef, useState } from "react";

export type ImageAttachment = { data: string; mimeType: string };

type Props = {
  onSend: (text: string, images?: ImageAttachment[]) => void;
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function MessageInput({ onSend }: Props) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;
    onSend(trimmed || "(이미지)", images.length > 0 ? images : undefined);
    setText("");
    setImages([]);
    setPreviews([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, images, onSend]);

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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!ACCEPTED_TYPES.includes(file.type)) return;
      if (file.size > MAX_IMAGE_SIZE) {
        alert("이미지 크기는 5MB 이하여야 합니다.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        setImages((prev) => [...prev, { data: base64, mimeType: file.type }]);
        setPreviews((prev) => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input so same file can be selected again
    e.target.value = "";
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="input-container">
      {previews.length > 0 && (
        <div className="image-preview-bar">
          {previews.map((src, i) => (
            <div key={i} className="image-preview-item">
              <img src={src} alt={`첨부 ${i + 1}`} />
              <button className="image-preview-remove" onClick={() => removeImage(i)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="input-wrapper">
        <button
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          aria-label="이미지 첨부"
          title="이미지 첨부"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
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
        <button
          className="send-btn"
          disabled={!text.trim() && images.length === 0}
          onClick={handleSend}
          aria-label="Send"
        >
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
