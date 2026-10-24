import { useEffect, useRef, useState } from "react";
import { api } from "./api";

type Msg = {
  role: "me" | "bot";
  text: string;
  items?: { productId: number; quantity: number }[];
  source?: string;
};
const QUICK = [
  "Something spicy under ₹60",
  "Which payment methods can I use?",
  "Snacks for two people",
];

export default function Chat({
  orderId,
  seed,
  onAdd,
}: {
  orderId: string | null;
  seed: { text: string; n: number } | null;
  onAdd: (i: { productId: number; quantity: number }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "bot",
      text: "Hi! Tell me what you feel like and I’ll suggest snacks, or ask about payment and pickup.",
    },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [msgs, open]);

  async function send(message: string) {
    if (message.trim().length < 2 || busy) return;
    setMsgs((m) => [...m, { role: "me", text: message }]);
    setText("");
    setBusy(true);
    try {
      const r = await api<{
        reply: string;
        items: Msg["items"];
        source: string;
      }>("/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message, orderId: orderId ?? undefined }),
      });
      setMsgs((m) => [
        ...m,
        { role: "bot", text: r.reply, items: r.items, source: r.source },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        {
          role: "bot",
          text: "The assistant is unavailable right now. You can still order and pay without it.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (seed) {
      setOpen(true);
      send(seed.text);
    }
  }, [seed?.n]);

  if (!open)
    return (
      <button className="chat-fab primary" onClick={() => setOpen(true)}>
        Help me choose
      </button>
    );
  return (
    <aside className="chat" aria-label="Assistant">
      <div className="chat-head">
        <strong>Assistant</strong>
        <button onClick={() => setOpen(false)} aria-label="Close assistant">
          Close
        </button>
      </div>
      <div className="chat-body" role="log" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.text}
            {m.items && m.items.length > 0 && !orderId && (
              <div>
                <button onClick={() => onAdd(m.items!)}>Add to my cart</button>
              </div>
            )}
            {m.source && (
              <div className="muted">
                {m.source === "ai" ? "AI answer" : "Quick answer"}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble bot muted">Thinking…</div>}
        <div ref={end} />
      </div>
      <div className="chips">
        {QUICK.map((q) => (
          <button key={q} disabled={busy} onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <div className="row" style={{ borderBottom: 0 }}>
        <input
          aria-label="Message"
          maxLength={300}
          placeholder="Ask anything…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(text)}
        />
        <button
          className="primary"
          disabled={busy || text.trim().length < 2}
          onClick={() => send(text)}
        >
          Send
        </button>
      </div>
    </aside>
  );
}
