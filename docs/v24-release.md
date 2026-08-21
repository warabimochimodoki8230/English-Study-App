# v24 release

v24 is rebuilt from the stable v20-8 runtime/data baseline and re-applies the v21/v22 vocabulary features without replacing the working quiz engine.

- 6,034 vocabulary records with normalized POS labels.
- Vocabulary question types available at every level: English→Japanese, Japanese→English, context, synonym, family/derivative.
- Family questions prefer distractors with the same target part of speech and hide the POS label.
- Tag search is omitted.
- Mobile reset button is available.
- Next-question button remains visible but disabled until the current answer is submitted.
- Idiom/grammar/reading data are preserved byte-for-byte from v20-8.
- The ZIP root contains `public/` directly; deploy by replacing the existing `public/` directory.
