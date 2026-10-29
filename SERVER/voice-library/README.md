# ETMW Voice Reference Library

The WAV files in this folder are curated reference clips for host voice cloning.

## Source

- **CSTR VCTK Corpus** — 110 English speakers, CC-BY-4.0.
- Dataset: https://huggingface.co/datasets/CSTR-Edinburgh/vctk
- Viewer copy used for the clips: https://huggingface.co/datasets/sanchit-gandhi/vctk
- Citation: Christophe Veaux, Junichi Yamagishi, Kirsten MacDonald.
  *CSTR VCTK Corpus: English Multi-speaker Corpus for CSTR Voice Cloning Toolkit*, 2017.

Each clip is a concatenation of clean VCTK studio utterances, normalized to 24 kHz mono.
The stage names are ETMW library labels, not the speakers' real names. Attribution is stored
in the database for each reference with `speaker_id`.

## Import

Run from `SERVER/`:

```bash
node --env-file=.env.production scripts/seed-voice-library.mjs
```

The script upserts built-in references by `builtinKey`; re-running it is safe. User uploads are
stored separately and are not touched.
