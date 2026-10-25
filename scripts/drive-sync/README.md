# Jarvis local Google Drive sync agent

The agent mirrors project folders between Supabase and the Google Drive for
Desktop directory. Only the host holding the database lease performs work, so
the same setup can be installed on several PCs.

1. Copy `.env.drive-sync.example` to `.env.drive-sync.local` on each PC.
2. Fill in the production Supabase URL and service-role key. Never commit or
   send this file: the key bypasses RLS.
3. Run `npm run drive-sync:once` for the bootstrap pass.
4. Run `npm run drive-sync` for foreground watch mode, or launch
   `scripts/drive-sync/start-drive-sync.vbs` for a hidden background process.

Every project uses the same four category folders as the Jarvis file tabs:
`01_Zadanie`, `02_Projekt`, `03_Krój`, and `04_Montaż`. Before scanning files,
the agent automatically renames the former `01_Zlecenie`, `02_Rozrys`, and
`03_Rozkrój` directories in place. Their contents and category-relative sync
metadata remain intact, so this migration does not create uploads or deletions.

The background log is stored at `%LOCALAPPDATA%\Jarvis\drive-sync.log`.
Use a distinct `JARVIS_DRIVE_SYNC_HOST` for every PC if Windows host names are
not unique. The default root is `G:\Mój dysk\_Jarvis\Projekty`.

Files removed in Jarvis are moved locally to `_Usunięte`. Local deletions are
not propagated to Supabase; the server copy is restored on the next pass.
