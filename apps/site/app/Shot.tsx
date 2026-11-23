/**
 * A screenshot of the whole app in a window frame, with a caption of what it shows; a click opens it
 * full size. The screens show demo data of a made-up runner (apps/app/scripts/make-demo.mjs), taken
 * at 1440 × 900 at twice the size.
 */
export function Shot({ name, alt, wide = false, eager = false, children }: { name: string; alt: string; wide?: boolean; eager?: boolean; children: React.ReactNode }) {
  return (
    <figure className={wide ? 'shot wide' : 'shot'}>
      <a href={`/shots/${name}.webp`} aria-label={`${alt} Open full size.`}>
        <img src={`/shots/${name}.webp`} width={1440} height={900} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      </a>
      <figcaption>{children}</figcaption>
    </figure>
  );
}
