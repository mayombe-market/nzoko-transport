import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Client côté serveur (pour les API routes / Server Components)
// Utilise la service_role key pour les opérations admin
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient<Database>(supabaseUrl, supabaseServiceKey)
    : null;
