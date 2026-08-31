# tiny_dimanalysis

An authoring aid for the TinyMCE editor that live-highlights text which
`filter_dimanalysis` will render as stacked, cancelling fractions. It is
the editor-side companion to that filter.

- **No toolbar button, no menu item.** The plugin only needs to be
  enabled; it registers editor event handlers and nothing else.
- **Never mutates content.** Highlighting is drawn with the CSS Custom
  Highlight API over the existing text — the source is untouched. The
  conversion to fraction layout happens only at display time, in
  `filter_dimanalysis`.
- **Silent no-op** where the Custom Highlight API is unavailable
  (needs Chrome/Edge/Safari, or Firefox 140+).

The recogniser (`amd/src/detector.js`) is a direct port of the detect +
validate half of the filter's PHP parser, so what lights up in the editor
is what the filter will actually format.

## Requirements

- `filter_dimanalysis` installed and enabled (this plugin is only useful
  alongside it).
- A browser with the CSS Custom Highlight API.

## Build

AMD sources live in `amd/src/`; built modules in `amd/build/` are
committed. After changing a source file:

```
npx grunt amd --root=public/lib/editor/tiny/plugins/dimanalysis
```

## Tests

```
npm install
npm test
```

Jest specs are in `tests/jest/`.
