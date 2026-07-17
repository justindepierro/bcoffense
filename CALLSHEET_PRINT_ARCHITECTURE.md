# Call Sheet Print Architecture

Call Sheet printing has one authority: the normalized print job created by the
print modal. Screen layout settings may describe the current board, but they
do not control paper orientation, columns, margin, page selection, or density.

## Print job contract

`normalizeCallSheetPrintOptions()` is the single normalization path for saved
settings, the modal summary, Print Studio presets, and the final job passed to
the renderer. It guarantees these values:

- paper: Letter, Legal, or Tabloid
- orientation: portrait or landscape
- pages: both, current, front, or back
- columns: 2, 3, or 4
- margin: tight, normal, or wide

`_csRunPrint()` creates that job once and passes it into each rendered page,
category, and play. Density decisions therefore use the actual selected paper
orientation rather than the live Call Sheet screen state.

## Boundaries

- `js/callsheet-print.js` owns print-job normalization, modal controls, print
  rendering, and cleanup.
- `js/print-studio.js` may set a preset through the same print-option setter;
  it does not render its own Call Sheet output.
- `css/print.css` owns paper-only geometry and type scaling.
- Screen layout and Call Sheet display settings remain separate inputs to the
  screen renderer and to the call-text choices, not the paper job itself.

## Verification

Test Front + Back, Current page, 2-column portrait, 4-column landscape, and
a long call while the on-screen board orientation differs from the selected
paper orientation. The paper job must remain internally consistent.
