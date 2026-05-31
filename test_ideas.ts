import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://klhcrdacefntzqwqwiiu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_aITpoyEkEtU60jzenvS3ig_wCGXYVGz";

async function checkIdeas() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  
  console.log("Checking raw_content join...");
  
  const { data, error } = await supabase
    .from("raw_content")
    .select("*, sources_master(channel_name)")
    .order("created_at", { ascending: false });
      
  if (error) {
    console.error(`Error:`, error.message);
  } else {
    console.log(`Ideas count: ${data?.length}`);
    const counts = data.reduce((acc: any, row: any) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    console.log("Status distribution:", JSON.stringify(counts, null, 2));
  }
}

checkIdeas();
