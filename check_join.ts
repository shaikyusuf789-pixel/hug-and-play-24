import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://klhcrdacefntzqwqwiiu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_aITpoyEkEtU60jzenvS3ig_wCGXYVGz";

async function checkData() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  
  console.log("Checking raw_content join in project klhcrdacefntzqwqwiiu...");
  
  const { data, error } = await supabase
    .from("raw_content")
    .select("*, sources_master(channel_name)")
    .limit(5);
      
  if (error) {
    console.error(`Error checking join:`, error.message);
    
    console.log("Checking individual raw_content rows...");
    const { data: rawData, error: rawError } = await supabase.from("raw_content").select("*").limit(5);
    if (rawError) console.error("Error checking raw_content:", rawError.message);
    else console.log("Raw content sample:", JSON.stringify(rawData, null, 2));
    
  } else {
    console.log(`Join successful. Found ${data?.length} rows.`);
    console.log("Sample row:", JSON.stringify(data?.[0], null, 2));
  }
}

checkData();
