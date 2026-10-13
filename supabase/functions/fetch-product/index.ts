import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchPinnedProductPage } from "../_shared/pinned-fetch.ts";
import { createProductImportHandler } from "../_shared/product-import-handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const transport = {
  connect: async (address: string, port: number) => await Deno.connect({ hostname: address, port }),
  startTls: async (socket: Deno.TcpConn, hostname: string) => await Deno.startTls(socket, { hostname }),
};

const handler = createProductImportHandler({
  authenticate: async (authorization) => {
    if (!supabaseUrl || !anonKey) return false;
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data, error } = await supabase.auth.getUser();
    return !error && Boolean(data.user);
  },
  reserveImport: async (authorization) => {
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data, error } = await supabase.rpc("reserve_product_import");
    if (error) throw error;
    return data === true;
  },
  resolveDns: (hostname, recordType) => Deno.resolveDns(hostname, recordType),
  transport,
  fetchPage: fetchPinnedProductPage,
});

serve(handler);
