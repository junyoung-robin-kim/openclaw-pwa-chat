import ReactMarkdown from "react-markdown";

type Props = {
  text: string;
};

export function StreamingMessage({ text }: Props) {
  return (
    <div className="message assistant-message" id="streaming-message">
      <div className="message-content">
        <div className="message-text">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
