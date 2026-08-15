# Trading OS — Production Hardening Patch

Replace the files in this patch with the same paths in your project.

Included:
- auth refresh/session hardening
- server-side Supabase error sanitization
- screenshot cleanup when a trade is deleted
- HSTS security header
- production security audit SQL
- deployment checklist update

After replacement:
1. Run the SQL audit in `sql/production_security_audit.sql` in Supabase.
2. Send me the full SQL output.
3. Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
