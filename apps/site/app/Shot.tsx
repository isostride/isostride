/**
 * A screenshot of the whole app in a window frame, with a caption of what it shows; a click opens it
 * full size. The screens show demo data of a sample runner (apps/app/lib/demo), taken
 * at 1440 × 900 at twice the size.
 */
export function Shot({ name, dir = '/shots', alt, open, wide = false, eager = false, children }: { name: string; dir?: string; alt: string; open: string; wide?: boolean; eager?: boolean; children: React.ReactNode }) {
  return (
    <figure className={wide ? 'shot wide' : 'shot'}>
      <a href={`${dir}/${name}.webp`} aria-label={`${alt} ${open}`}>
        <img src={`${dir}/${name}.webp`} width={1440} height={900} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      </a>
      <figcaption>{children}</figcaption>
    </figure>
  );
}
