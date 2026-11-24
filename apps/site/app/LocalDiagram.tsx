/**
 * Where the data is and where it goes: the watch exports FIT files into a folder on the runner's
 * disk; IsoStride, in the runner's browser, reads them and writes its results back. The folder and
 * the browser are inside the runner's computer; the line to a server is crossed out: there is none.
 */
import type { Content } from './content';

export function LocalDiagram({ text }: { text: Content['diagram'] }) {
  return (
    <svg className="diag" viewBox="0 0 400 272" role="img"
      aria-label={text.label}>
      {/* The runner's computer: the folder and the browser inside it */}
      <rect className="diag-frame" x="126" y="14" width="264" height="136" rx="12" />
      <rect className="diag-tab" x="140" y="5" width="98" height="18" />
      <text className="diag-small" x="146" y="18">{text.computer}</text>

      {/* The watch */}
      <path className="diag-line" d="M41,42 L43,30 H61 L63,42 M41,82 L43,94 H61 L63,82" />
      <rect className="diag-icon" x="35" y="42" width="34" height="40" rx="10" />
      <polyline className="diag-accent" points="41,62 46,62 49,54 54,70 57,62 63,62" />
      <text className="diag-title" x="52" y="118" textAnchor="middle">{text.watch}</text>
      <text className="diag-small" x="52" y="134" textAnchor="middle">{text.exports}</text>
      <path className="diag-line" d="M78,62 H152 M152,62 l-7,-4.5 M152,62 l-7,4.5" />

      {/* The folder */}
      <path className="diag-icon" d="M162,43 a4,4 0 0 1 4,-4 h17 l7,7 h36 a4,4 0 0 1 4,4 v33 a4,4 0 0 1 -4,4 h-60 a4,4 0 0 1 -4,-4 z" />
      <text className="diag-mono" x="196" y="72" textAnchor="middle">*.fit</text>
      <text className="diag-title" x="196" y="118" textAnchor="middle">{text.folder}</text>
      <text className="diag-small" x="196" y="134" textAnchor="middle">{text.folderHolds}</text>

      <text className="diag-small" x="260" y="45" textAnchor="middle">{text.reads}</text>
      <path className="diag-accent" d="M240,55 H280 M280,55 l-7,-4.5 M280,55 l-7,4.5" />
      <path className="diag-accent" d="M280,71 H240 M240,71 l7,-4.5 M240,71 l7,4.5" />
      <text className="diag-small" x="260" y="91" textAnchor="middle">{text.writes}</text>

      {/* The browser, a chart in it */}
      <rect className="diag-icon" x="290" y="36" width="80" height="52" rx="6" />
      <path className="diag-line" d="M290,49 H370" />
      <circle className="diag-dot" cx="299" cy="42.5" r="2.2" />
      <circle className="diag-dot" cx="307" cy="42.5" r="2.2" />
      <circle className="diag-dot" cx="315" cy="42.5" r="2.2" />
      <polyline className="diag-accent" points="300,78 313,69 326,73 341,58 360,62" />
      <text className="diag-title" x="330" y="118" textAnchor="middle">{text.browser}</text>
      <text className="diag-small" x="330" y="134" textAnchor="middle">{text.runsHere}</text>

      {/* No server: the line out of the computer is crossed, the cloud is not there */}
      <path className="diag-none" d="M258,150 V180" />
      <path className="diag-knock" d="M251,158 l14,14 M265,158 l-14,14" />
      <path className="diag-cross" d="M251,158 l14,14 M265,158 l-14,14" />
      <path className="diag-none" transform="translate(254 208)" d="M-22,18 a15,15 0 0 1 3,-30 a22,22 0 0 1 42,-7 a18,18 0 0 1 7,37 z" />
      <text className="diag-title" x="258" y="248" textAnchor="middle">{text.nothing}</text>
      <text className="diag-small" x="258" y="264" textAnchor="middle">{text.noServer}</text>
    </svg>
  );
}
