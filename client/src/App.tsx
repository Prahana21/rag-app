import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // auto scroll to bottom when new message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const response = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Upload failed");
        return;
      }

      setFileName(data.fileName);
      setMessages([]);
    } catch (err) {
      setError("Could not connect to server!");
    } finally {
      setUploading(false);
    }
  }

  async function handleAsk() {
    if (!question.trim() || !fileName) return;
    const userMessage: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    setLoading(true);
    setError("");

    try {
      const response = await fetch("http://localhost:5000/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          fileName,
          topK: 3,
          history: messages.slice(-6),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: data.answer,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError("Could not connect to server!");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4">
      {/* Header */}
      <h1 className="text-3xl font-bold mb-6 text-purple-400">📄 Your Personal AI Tutor</h1>

      {/* Upload Section */}
      <div className="w-full max-w-2xl bg-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-200">
          Upload PDF
        </h2>
        <div className="flex gap-3">
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="flex-1 text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
          />
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-6 py-2 bg-purple-600 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>

        {/* Success message */}
        {fileName && (
          <p className="mt-3 text-green-400 text-sm">
            ✅ Ready to chat with: {fileName}
          </p>
        )}

        {/* Error message */}
        {error && <p className="mt-3 text-red-400 text-sm">❌ {error}</p>}
      </div>

      {/* Chat Section */}
      {fileName && (
        <div className="w-full max-w-2xl flex flex-col bg-gray-800 rounded-xl overflow-hidden">
          {/* Messages */}
          <div className="flex-1 p-4 space-y-4 max-h-96 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-gray-500 text-center text-sm">
                Ask anything about your PDF!
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-purple-600 text-white rounded-br-none"
                      : "bg-gray-700 text-gray-200 rounded-bl-none"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-700 px-4 py-2 rounded-2xl rounded-bl-none text-sm text-gray-400">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-700 flex gap-3">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your PDF..."
              rows={1}
              className="flex-1 bg-gray-700 text-white rounded-xl px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={handleAsk}
              disabled={!question.trim() || loading}
              className="px-6 py-2 bg-purple-600 rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
