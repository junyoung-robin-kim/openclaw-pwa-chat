import { useCallback, useRef, useState } from "react";

export type ImageAttachment = { data: string; mimeType: string };

type Props = {
  onSend: (text: string, images?: ImageAttachment[]) => void;
};

const MAX_BASE64_SIZE = 4 * 1024 * 1024; // 4MB base64 (< 5MB API limit)
const MAX_DIMENSION = 2048;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function resizeImage(file: File): Promise<{ data: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.85;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      // Reduce quality until under limit
      while (dataUrl.length * 0.75 > MAX_BASE64_SIZE && quality > 0.3) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      const base64 = dataUrl.split(",")[1];
      resolve({ data: base64, mimeType: "image/jpeg", dataUrl });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

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

    Array.from(files).forEach(async (file) => {
      if (!ACCEPTED_TYPES.includes(file.type)) return;

      try {
        const result = await resizeImage(file);
        setImages((prev) => [...prev, { data: result.data, mimeType: result.mimeType }]);
        setPreviews((prev) => [...prev, result.dataUrl]);
      } catch {
        alert("이미지를 처리할 수 없습니다.");
      }
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
