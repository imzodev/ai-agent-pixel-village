// The Proof of Traction listing (proofoftraction.com/p/thegroove): the link
// becomes its badge and the script counts pageviews. Both have to be in the
// server-rendered HTML, so this is a server component. Shown only on the home
// page to visitors who aren't signed in (src/app/page.tsx), never in the game:
// the script watches the whole page for changes and wraps history, and every
// way in (sign in, Play now, sign up) reloads the page, which drops it.
// Bottom right, clear of the pitch card; hidden on phones, where the card
// takes the whole width.

export default function TractionBadge() {
  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-10 hidden sm:block">
      <a href="https://proofoftraction.com/p/thegroove" target="_blank" rel="noopener" data-pot-badge data-pot-size="m" data-pot-theme="auto">Launched on Proof of Traction</a>
      <script async src="https://proofoftraction.com/b.js" data-pot="m2R3UNU6b1ti"></script>
    </div>
  );
}
