# WillYouBeMine ♥

A multi-page proposal platform. One person creates and publishes a personalized proposal, the recipient opens its link on this same site and answers without creating an account, and the creator can see replies in a private dashboard.

## Pages

- `index.html` — marketing homepage and template discovery.
- `create.html` — creator workflow, theme selection, and live preview.
- `proposal.html?id=<uuid>` — public recipient page with Yes/No and an optional note.
- `dashboard.html` — creator's published pages, copy-link actions, response counts, and delete controls.
- `inbox.html` — responses received for the creator's proposals.
- `login.html` — account creation and sign-in.

## Enable real cross-device sharing

The homepage's standalone builder works without a backend and can export a self-contained proposal HTML file. The account-based creator, dashboard, inbox, and sign-in flows require Supabase configuration; until it is configured, those pages cannot publish shareable proposals or store cross-device replies. To enable real publishing and responses:

1. Create a free project at https://supabase.com.
2. Run `supabase-schema.sql` in the Supabase SQL Editor.
3. Run `add-proposal-photos.sql` in the same SQL Editor to enable the optional photo gallery. This migration is repeatable and is required for existing projects as well as fresh projects.
4. In Supabase Project Settings / API, copy the Project URL and public anon/publishable key.
5. Add those two values to `config.js` as `supabaseUrl` and `supabaseAnonKey`. Never use the service-role key in client-side code.
6. Enable email/password authentication. Set the Site URL and allowed redirect URLs to your deployed domain.
7. Deploy the repository as a static site. Redeploy after changing `config.js`.

The creator can optionally add up to five JPG, PNG, or WebP photos (maximum 5 MB each) with captions. New uploads are resized to at most 1600 pixels on their longest edge and converted to WebP when supported. The dashboard also offers **Optimize photos** for older galleries that were uploaded before this compression was added. Photos appear as a separate page between the fixed introduction and the extra questions. The gallery uses a private Storage bucket and short-lived signed URLs; photo access is restricted to published proposals within the existing 15-day lifetime. Deleting a proposal from the dashboard removes its stored photos. When the owner next opens the dashboard, it also best-effort cleans up photo folders left behind by the 15-day automatic proposal expiry.

After setup, a creator signs up, publishes a proposal, and copies its unique link from the dashboard. The recipient opens the link on another device without signing in, chooses an answer, and may leave a note. The response is stored and appears in the creator's inbox. Each creator's dashboard and responses are restricted with row-level security policies.

## Local development

Use Node.js 18+ and run `npm test`. To serve the static pages locally, run `python -m http.server 8000` and visit `http://localhost:8000`.

## Security and launch notes

Row-level security is enabled in the supplied SQL schema. Creators can manage only their own proposals and read replies for their proposals. Public visitors can read published proposal content and submit an answer without an account. For a public launch, add rate limiting or CAPTCHA for anonymous responses and consider email verification, abuse reporting, and proposal expiry/unpublish controls. The proposal page displays only information the creator chooses to publish.
