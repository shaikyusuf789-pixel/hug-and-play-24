import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://eozteueesaemhcmbqcxt.supabase.co";
const NEW_KEY = "sb_secret_qSkSoKYu9J_u9z9oUwnaKA__Qss9AvM";
const OLD_KEY = process.env.CUSTOM_SUPABASE_SERVICE_ROLE_KEY;

async function test(key, name) {
  const client = createClient(SUPABASE_URL, key);
  const { data, error } = await client.from('app_settings').select('count').limit(1);
  if (error) {
    console.log(`${name} FAILED: ${error.message}`);
  } else {
    console.log(`${name} SUCCESS`);
  }
}

console.log("Testing keys...");
await test(NEW_KEY, "NEW_KEY (sb_secret)");
if (OLD_KEY) {
  await test(OLD_KEY, "OLD_KEY (JWT)");
} else {
  console.log("OLD_KEY not found in env");
}
