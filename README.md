# WillYouBeMine 💗

A responsive, romantic proposal-page builder starter. Pick a style, personalize the wording, preview the page, and download a standalone proposal HTML file to host or share.

## Current features

- Responsive landing page with animated hero, template cards, process section, and clear calls to action.
- Three visual themes: Sweet & Soft, Midnight Magic, and Cute & Playful.
- Proposal editor with names, question, personal message, theme, and button text.
- Live preview and interactive Yes / No buttons.
- Celebration effect for the YES preview.
- Optional playful NO-button movement; a normal choice remains available.
- Downloadable standalone proposal HTML file. The downloaded page works without the builder running.
- Reduced-motion support, keyboard escape to close the editor, accessible labels, and mobile navigation.
- No framework build step required for the first static version.

## Run locally

Open `index.html` in a modern browser. For a local web-server workflow, run:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Deploy on Vercel

Import this repository into Vercel and deploy it as a static site. No build command is required for this plain HTML/CSS/JavaScript starter; use the repository root as the output directory if prompted.

## Current limitation: public proposal links

The editor currently downloads a standalone `my-willyoubemine-proposal.html` file. It does **not** yet create a hosted `/p/slug` URL, persist proposals across devices, or provide an account dashboard. Those features require a persistence and publishing layer (for example, a Supabase database with appropriate security rules and a server-side/API route to create and retrieve proposals). Don't put database service-role keys in client-side JavaScript.

## Manual smoke-test checklist

1. Open the home page and navigate to Templates.
2. Open each template and confirm that the correct theme is selected.
3. Edit both names, question, message, and YES button copy; verify the preview changes.
4. Switch themes and confirm the preview colors and greeting/message change.
5. Click YES and verify a celebration and response appear.
6. Click NO and confirm a respectful response; try both NO-button modes.
7. Reset the form and verify default values return.
8. Download the standalone HTML and open it locally; check that the message and buttons work.
9. Test the menu and builder at mobile and desktop widths.
10. Check that Escape closes the editor and reduced-motion preferences suppress decorative animation.

## Project files

- `index.html` — page structure and proposal builder dialog.
- `styles.css` — responsive visual system and animations.
- `app.js` — editor behavior, themes, preview, standalone file export, and interactions.

## Privacy note

Drafts are processed in the visitor's browser and aren't sent to a server by this starter. Anyone with a downloaded proposal file can open it, so the creator should share it only with their intended recipient. A public publishing feature should include explicit consent, unpublish/delete controls, validation, rate limits, and secure database access.