import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  import.meta.env.VITE_SUPABASE_ANON_KEY !== "your-anon-key"
);

if (!isSupabaseConfigured) {
  console.warn(
    "⚠️ Supabase credentials missing or invalid!\n" +
    "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in your .env or Vercel Environment Variables.\n" +
    "Without them, authentication requests will fail with 'Invalid API key'."
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

