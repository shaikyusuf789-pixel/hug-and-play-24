import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://klhcrdacefntzqwqwiiu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_aITpoyEkEtU60jzenvS3ig_wCGXYVGz";

async function checkCountHeader() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  
  console.log("Checking if count is returned for raw_content...");
  
  const { count, error } = await supabase
    .from("raw_content")
    .select('*', { count: 'exact' });
      
  if (error) {
    console.error(`Error:`, error.message);
  } else {
    console.log(`Count: ${count}`);
  }
}

checkCountHeader();
