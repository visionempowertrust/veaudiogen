# VE-Vani Studio production audio backend

The public site never receives provider API keys. Supabase Vault stores the
Sarvam key, and the `generate-audio` Edge Function reads it server-side.

## Deploy

1. Run `migrations/20261002_secure_ai_service_keys.sql` and
   `migrations/20261002_selected_audio_renditions.sql` in the Supabase SQL Editor.
2. Store the production Sarvam key in Vault:

   ```sql
   select public.upsert_ai_service_key('sarvam', 'PASTE_REAL_SARVAM_KEY_HERE');
   ```

3. Deploy the function from an authenticated Supabase CLI:

   ```sh
   supabase functions deploy generate-audio --project-ref mabvfybqdobhrfoxetba --no-verify-jwt
   ```

4. Verify that the safe public registry returns `sarvam`:

   ```sql
   select * from public.list_configured_ai_services();
   ```

The function accepts requests only from the GitHub Pages site and local preview.
For every generation it assembles the fixed introduction, submitted story, and
fixed closing, translates that entire narration with Sarvam Translate, and sends
the translated result to the selected Bulbul model and voice. It also stores a
volunteer's selected rendition in `selected_audio_renditions`. Browser roles have
no direct access to that table. A global quota allows 60 generations per hour and
300 per day.
