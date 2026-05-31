
import { createClient } from '@supabase/supabase-js';

const EXTERNAL_URL = "https://eozteueesaemhcmbqcxt.supabase.co";
const EXTERNAL_KEY = process.env.CUSTOM_SUPABASE_SERVICE_ROLE_KEY; // I'll check if I can use the anon key if not

async function dump() {
  if (!EXTERNAL_KEY) {
    console.error("Missing CUSTOM_SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(EXTERNAL_URL, EXTERNAL_KEY);
  
  const tables = ['sources_master', 'raw_content', 'scripts', 'script_chunks', 'app_settings', 'notifications', 'youtube_seo'];
  const data = {};

  for (const table of tables) {
    const { data: rows, error } = await supabase.from(table).select('*');
    if (error) {
      console.error(`Error fetching ${table}:`, error);
    } else {
      data[table] = rows;
    }
  }

  console.log(JSON.stringify(data));
}

dump();
