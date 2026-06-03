import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://eozteueesaemhcmbqcxt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BJbO0kFxuujPXn0dsqId-A_PCX-f5gv";

async function checkData() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  
  console.log("Checking tables in project eozteueesaemhcmbqcxt with NEW keys...");
  
  const tables = ["sources_master", "raw_content", "scripts"];
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
      
    if (error) {
      console.error(`Error checking table ${table}:`, error.message);
    } else {
      console.log(`Table ${table} count: ${count}`);
    }
  }
}

checkData();
