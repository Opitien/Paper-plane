/**
 * Dev-only overlay used to render the social-card image (`public/og.png`)
 * from a live scene: `npm run dev`, open `/?og=1&phase=playing&skip=30` at
 * 1200x630 and screenshot. Never shown in production.
 */
export function OgCard() {
  return (
    <div className="og-card">
      <div className="og-card__title">Paper Plane</div>
      <div className="og-card__tagline">Fold, throw, ride the wind.</div>
      <div className="og-card__note">Play in your browser</div>
    </div>
  );
}
