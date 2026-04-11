import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function App() {
  // Auth state
  const [token, setToken] = useState<string>(localStorage.getItem("token") || "");
  const [email, setEmail] = useState<string>(localStorage.getItem("email") || "");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // App state
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // AUTH HANDLER
  async function handleAuth() {
    setAuthLoading(true);
    setAuthError("");
    try {
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const data = await response.json();
      if (!response.ok) {
        setAuthError(data.error || "Something went wrong");
        return;
      }
      // Store token and email
      localStorage.setItem("token", data.token);
      localStorage.setItem("email", data.email);
      setToken(data.token);
      setEmail(data.email);
    } catch (err) {
      setAuthError("Could not connect to server");
    } finally {
      setAuthLoading(false);
    }
  }

  // LOGOUT
  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("email");
    setToken("");
    setEmail("");
    setFileName("");
    setMessages([]);
  }

  // UPLOAD
  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const response = await fetch("/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`    // ← send token
        },
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

  // ASK
  async function handleAsk() {
    if (!question.trim() || !fileName) return;
    const userMessage: Message = { role: "user", content: question };
    setMessages(prev => [...prev, userMessage]);
    setQuestion("");
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`    // ← send token
        },
        body: JSON.stringify({
          question,
          fileName,
          topK: 3,
          history: messages.slice(-6)
        })
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.chunk) {
                assistantMessage += parsed.chunk;
                setMessages(prev => [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: assistantMessage }
                ]);
              }
            } catch { }
          }
        }
      }
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

  // SHOW AUTH SCREEN if not logged in
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <h1 className="text-3xl font-bold mb-8 text-purple-400">📄 Personal AI Tutor</h1>
        <div className="w-full max-w-md bg-gray-800 rounded-xl p-8">
          <h2 className="text-xl font-semibold mb-6 text-center">
            {isRegister ? "Create Account" : "Welcome Back"}
          </h2>
          <input
            type="email"
            placeholder="Email"
            value={authEmail}
            onChange={e => setAuthEmail(e.target.value)}
            className="w-full bg-gray-700 text-white rounded-xl px-4 py-3 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={authPassword}
            onChange={e => setAuthPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAuth()}
            className="w-full bg-gray-700 text-white rounded-xl px-4 py-3 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {authError && <p className="text-red-400 text-sm mb-4">❌ {authError}</p>}
          <button
            onClick={handleAuth}
            disabled={authLoading}
            className="w-full py-3 bg-purple-600 rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {authLoading ? "Please wait..." : isRegister ? "Register" : "Login"}
          </button>
          <p className="text-center text-gray-400 text-sm mt-4">
            {isRegister ? "Already have an account?" : "Don't have an account?"}
            <button
              onClick={() => { setIsRegister(!isRegister); setAuthError(""); }}
              className="text-purple-400 ml-1 hover:underline"
            >
              {isRegister ? "Login" : "Register"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // MAIN APP (logged in)
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4">
      {/* Header */}
      <div className="w-full max-w-2xl flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-purple-400">📄 Personal AI Tutor</h1>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">{email}</span>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-700 rounded-lg text-sm hover:bg-gray-600 transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Upload Section */}
      <div className="w-full max-w-2xl bg-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-200">Upload PDF</h2>
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
        {fileName && <p className="mt-3 text-green-400 text-sm">✅ Ready to chat with: {fileName}</p>}
        {error && <p className="mt-3 text-red-400 text-sm">❌ {error}</p>}
      </div>

      {/* Chat Section */}
      {fileName && (
        <div className="w-full max-w-2xl flex flex-col bg-gray-800 rounded-xl overflow-hidden">
          <div className="flex-1 p-4 space-y-4 max-h-96 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-gray-500 text-center text-sm">Ask anything about your PDF!</p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm ${
                  msg.role === "user"
                    ? "bg-purple-600 text-white rounded-br-none"
                    : "bg-gray-700 text-gray-200 rounded-bl-none"
                }`}>
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
