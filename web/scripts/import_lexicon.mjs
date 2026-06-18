import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importLexicon() {
  const jsonPath = path.resolve('../../corpus/lexicon_base/lexicon_target_words.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const entriesToInsert = data.map(item => ({
    top_french: item.french,
    bete_word: `_pending_${item.french}_${Math.random().toString(36).substring(2,7)}`,
    bete_phonetic: '',
    french_candidates: [],
    probability: 0,
    pos: [item.pos],
    validated: false,
    dialect: 'eastern',
    upvotes: 0
  }));

  console.log(`Importing ${entriesToInsert.length} entries...`);

  const { data: result, error } = await supabase
    .from('lexicon')
    .insert(entriesToInsert)
    .select();

  if (error) {
    console.error('Error inserting data:', error);
  } else {
    console.log(`Successfully imported ${result.length} entries.`);
  }
}

importLexicon().catch(console.error);
