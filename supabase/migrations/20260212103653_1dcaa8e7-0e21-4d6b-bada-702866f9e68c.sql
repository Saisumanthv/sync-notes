
-- Create notes table for shared notepad
CREATE TABLE public.notes (
  id TEXT PRIMARY KEY DEFAULT 'default',
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (public access since no auth)
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Anyone can read notes
CREATE POLICY "Anyone can read notes" ON public.notes FOR SELECT USING (true);

-- Anyone can insert notes
CREATE POLICY "Anyone can insert notes" ON public.notes FOR INSERT WITH CHECK (true);

-- Anyone can update notes
CREATE POLICY "Anyone can update notes" ON public.notes FOR UPDATE USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;

-- Insert default note
INSERT INTO public.notes (id, content) VALUES ('default', '');
