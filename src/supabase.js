import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fyupirswsvojdswpzvjm.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_QTL5aaRNRBJfS9Jc_-17Pg_GlIN5_92'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)