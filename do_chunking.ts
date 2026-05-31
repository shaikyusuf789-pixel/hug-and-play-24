
import { createClient } from '@supabase/supabase-js';

const URL = "https://eozteueesaemhcmbqcxt.supabase.co";
const KEY = "sb_secret_053AliSJ53V10QLhdvPq8Q_m8YRHj9d";

async function chunk() {
  const supabase = createClient(URL, KEY);
  const { data: scripts, error } = await supabase.from('scripts').select('id, content').limit(5);
  
  if (error) {
    console.error(error);
    return;
  }

  for (const script of scripts) {
    const words = script.content.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += 180) {
      chunks.push(words.slice(i, i + 180).join(' '));
    }

    const chunksToInsert = chunks.map((content, index) => ({
      script_id: script.id,
      chunk_index: index,
      content,
      word_count: content.split(/\s+/).length,
      status: 'PENDING'
    }));

    const { error: insErr } = await supabase.from('script_chunks').insert(chunksToInsert);
    if (insErr) {
      console.error(`Error inserting chunks for ${script.id}:`, insErr);
    } else {
      console.log(`Inserted ${chunks.length} chunks for script ${script.id}`);
    }
  }
}

chunk();
