import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Wifi, WifiOff } from "lucide-react";

const NOTE_ID = "default";

const Notepad = () => {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"saved" | "saving" | "synced" | "offline">("synced");
  const [charCount, setCharCount] = useState(0);
  const isLocalChange = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load initial content
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("notes")
        .select("content")
        .eq("id", NOTE_ID)
        .single();
      if (data) {
        setContent(data.content);
        setCharCount(data.content.length);
      }
    };
    load();
  }, []);

  // Subscribe to realtime changes
  useEffect(() => {
    const channel = supabase
      .channel("notes-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notes", filter: `id=eq.${NOTE_ID}` },
        (payload) => {
          if (!isLocalChange.current) {
            const newContent = (payload.new as { content: string }).content;
            setContent(newContent);
            setCharCount(newContent.length);
            setStatus("synced");
          }
          isLocalChange.current = false;
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setStatus("synced");
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setStatus("offline");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const saveContent = useCallback(async (text: string) => {
    setStatus("saving");
    isLocalChange.current = true;
    const { error } = await supabase
      .from("notes")
      .update({ content: text, updated_at: new Date().toISOString() })
      .eq("id", NOTE_ID);
    
    if (error) {
      setStatus("offline");
    } else {
      setStatus("saved");
      setTimeout(() => setStatus("synced"), 1500);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);
    setCharCount(text.length);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveContent(text), 300);
  };

  const statusConfig = {
    saved: { text: "Saved", color: "bg-primary" },
    saving: { text: "Saving…", color: "bg-muted-foreground" },
    synced: { text: "Live", color: "bg-green-500" },
    offline: { text: "Offline", color: "bg-destructive" },
  };

  const { text: statusText, color: dotColor } = statusConfig[status];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b px-4 sm:px-8 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold font-sans tracking-tight text-foreground">
              Shared Notepad
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="save-indicator text-muted-foreground flex items-center gap-2">
              <span className={`pulse-dot ${dotColor}`} />
              {statusText}
            </span>
            {status === "offline" ? (
              <WifiOff className="w-4 h-4 text-destructive" />
            ) : (
              <Wifi className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </header>

      {/* Editor */}
      <main className="flex-1 px-4 sm:px-8 py-8">
        <div className="max-w-3xl mx-auto">
          <textarea
            className="notepad-textarea"
            value={content}
            onChange={handleChange}
            placeholder="Start typing… your notes sync instantly across all devices."
            spellCheck={false}
            autoFocus
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="sticky bottom-0 backdrop-blur-md bg-background/80 border-t px-4 sm:px-8 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">
            {charCount} characters
          </span>
          <span className="text-xs text-muted-foreground font-sans">
            Open this page on another device to sync
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Notepad;
