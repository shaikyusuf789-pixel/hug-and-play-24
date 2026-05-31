const url = "https://eozteueesaemhcmbqcxt.supabase.co/rest/v1/app_settings?select=count";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`Testing URL: ${url}`);
console.log(`Using key: ${key?.slice(0, 15)}...`);

const res = await fetch(url, {
  headers: {
    "apikey": key,
    "Authorization": `Bearer ${key}`
  }
});

console.log(`Status: ${res.status}`);
const text = await res.text();
console.log(`Body: ${text}`);
