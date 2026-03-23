import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FileText, Plus, Trash2, Wifi, WifiOff, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

interface Note {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

const Notepad = () => {
  const { user, signOut } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"saved" | "saving" | "synced" | "offline">("synced");
  const [charCount, setCharCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isLocalChange = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load notes list
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("notes")
        .select("id, title, content, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (data && data.length > 0) {
        setNotes(data);
        setActiveId(data[0].id);
        setContent(data[0].content);
        setTitle(data[0].title);
        setCharCount(data[0].content.length);
      }
    };
    load();
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notes-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notes" },
        (payload) => {
          if (isLocalChange.current) {
            isLocalChange.current = false;
            return;
          }
          const newRecord = payload.new as Note & { user_id: string };
          if (newRecord?.user_id !== undefined && newRecord.user_id !== user.id) return;

          if (payload.eventType === "INSERT") {
            setNotes((prev) => [newRecord, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setNotes((prev) => prev.map((n) => (n.id === newRecord.id ? { ...n, ...newRecord } : n)));
            if (newRecord.id === activeId) {
              setContent(newRecord.content);
              setTitle(newRecord.title);
              setCharCount(newRecord.content.length);
            }
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            setNotes((prev) => prev.filter((n) => n.id !== oldId));
            if (oldId === activeId) {
              setActiveId(null);
              setContent("");
              setTitle("");
              setCharCount(0);
            }
          }
          setStatus("synced");
        }
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("synced");
        if (s === "CLOSED" || s === "CHANNEL_ERROR") setStatus("offline");
      });

    return () => { supabase.removeChannel(channel); };
  }, [user, activeId]);

  const saveContent = useCallback(async (noteId: string, text: string) => {
    setStatus("saving");
    isLocalChange.current = true;
    const { error } = await supabase
      .from("notes")
      .update({ content: text, updated_at: new Date().toISOString() })
      .eq("id", noteId);
    if (error) setStatus("offline");
    else { setStatus("saved"); setTimeout(() => setStatus("synced"), 1500); }
  }, []);

  const saveTitle = useCallback(async (noteId: string, newTitle: string) => {
    isLocalChange.current = true;
    await supabase.from("notes").update({ title: newTitle }).eq("id", noteId);
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, title: newTitle } : n)));
  }, []);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);
    setCharCount(text.length);
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, content: text } : n)));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (activeId) debounceRef.current = setTimeout(() => saveContent(activeId, text), 300);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    if (activeId) titleDebounceRef.current = setTimeout(() => saveTitle(activeId, newTitle), 500);
  };

  const createNote = async () => {
    if (!user) return;
    isLocalChange.current = true;
    const { data } = await supabase
      .from("notes")
      .insert({ user_id: user.id, title: "Untitled", content: "" })
      .select()
      .single();
    if (data) {
      setNotes((prev) => [data, ...prev]);
      setActiveId(data.id);
      setContent("");
      setTitle("Untitled");
      setCharCount(0);
    }
  };

  const deleteNote = async (noteId: string) => {
    isLocalChange.current = true;
    await supabase.from("notes").delete().eq("id", noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (noteId === activeId) {
      const remaining = notes.filter((n) => n.id !== noteId);
      if (remaining.length > 0) {
        selectNote(remaining[0]);
      } else {
        setActiveId(null);
        setContent("");
        setTitle("");
        setCharCount(0);
      }
    }
  };

  const selectNote = (note: Note) => {
    setActiveId(note.id);
    setContent(note.content);
    setTitle(note.title);
    setCharCount(note.content.length);
    setSidebarOpen(false); // close sidebar on mobile after selecting
  };

  const statusConfig = {
    saved: { text: "Saved", color: "bg-primary" },
    saving: { text: "Saving…", color: "bg-muted-foreground" },
    synced: { text: "Live", color: "bg-green-500" },
    offline: { text: "Offline", color: "bg-destructive" },
  };
  const { text: statusText, color: dotColor } = statusConfig[status];

  return (
    <div className="min-h-screen flex relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 border-r bg-card flex flex-col shrink-0
          transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Notes</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={createNote}>
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 md:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notes.map((note) => (
            <div
              key={note.id}
              onClick={() => selectNote(note)}
              className={`flex items-center justify-between px-4 py-3 cursor-pointer border-b border-border transition-colors group ${
                note.id === activeId ? "bg-accent" : "hover:bg-muted"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate text-foreground">{note.title}</p>
                <p className="text-xs text-muted-foreground truncate">{note.content.slice(0, 40) || "Empty"}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 p-1 hover:text-destructive text-muted-foreground"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {notes.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notes yet. Click + to create one.
            </div>
          )}
        </div>
        <div className="p-3 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={signOut}>
            <LogOut className="w-3.5 h-3.5 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main editor */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 md:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-4 h-4" />
              </Button>
              {activeId ? (
                <input
                  value={title}
                  onChange={handleTitleChange}
                  className="text-lg font-semibold bg-transparent border-none outline-none text-foreground w-full font-sans"
                  placeholder="Note title…"
                />
              ) : (
                <span className="text-lg font-semibold text-muted-foreground truncate">Select or create a note</span>
              )}
            </div>
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <span className="save-indicator text-muted-foreground flex items-center gap-2">
                <span className={`pulse-dot ${dotColor}`} />
                <span className="hidden sm:inline">{statusText}</span>
              </span>
              {status === "offline" ? (
                <WifiOff className="w-4 h-4 text-destructive" />
              ) : (
                <Wifi className="w-4 h-4 text-muted-foreground hidden sm:block" />
              )}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-6 py-4 md:py-6">
          {activeId ? (
            <textarea
              className="notepad-textarea"
              value={content}
              onChange={handleContentChange}
              placeholder="Start typing… your notes sync instantly across all devices."
              spellCheck={false}
              autoFocus
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Select a note or create a new one to get started.</p>
            </div>
          )}
        </main>

        <footer className="sticky bottom-0 backdrop-blur-md bg-background/80 border-t px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">{charCount} characters</span>
            <span className="text-xs text-muted-foreground font-sans hidden sm:block">
              Open on another device to sync
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Notepad;
