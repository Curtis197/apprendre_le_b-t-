import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env vars manually for the script
const supabaseUrl = 'https://agdqbzbjcxrzfhkvempe.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnZHFiemJqY3hyemZoa3ZlbXBlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODczMzMwMCwiZXhwIjoyMDk0MzA5MzAwfQ.Dy8uB0aZFEM5n-BvD9gXbLAXRY_0T-LFG08u0sAmsIs';

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
