import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://eozteueesaemhcmbqcxt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8_LFpheRbnwNiecH1oHujQ_6HHrydgh";

async function checkStatuses() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  
  console.log("Checking status distribution in raw_content...");
  
  const { data, error } = await supabase
    .from("raw_content")
    .select("status");
      
  if (error) {
    console.error(`Error checking statuses:`, error.message);
  } else {
    const counts = data.reduce((acc: any, row: any) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    console.log("Status distribution:", JSON.stringify(counts, null, 2));
  }
}

checkStatuses();
