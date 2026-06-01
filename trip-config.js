'use strict';

// Local mode keeps checklist status in each browser.
// To make booking/checklist status universal, replace this with the Supabase
// values from README.md and redeploy the site.
window.TRIP_SYNC_CONFIG = {
  provider: 'local',

  // provider: 'supabase',
  // url: 'https://YOUR_PROJECT.supabase.co',
  // anonKey: 'YOUR_PUBLIC_ANON_KEY',
  // table: 'trip_state',
  // id: 'west-coast-roadtrip-2026',
};
