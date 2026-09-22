# Os Draconis Multimodal Quality Grader

Static web app for **lot-level quality grading** of Longgu (*Os Draconis*) using transparent **late fusion** of traditional and instrumental modalities.

This is a **research / QC decision-support tool**, not a medical device and not a trained black-box classifier.

## Open locally

Double-click `index.html`, or from this folder:

```bash
npx --yes serve .
```

Then open the printed local URL in a browser.

## Modalities & weights

Weights are pre-specified and **renormalised** if a modality is missing:

| Modality | Weight |
|----------|--------|
| Fire assay | 0.18 |
| Fluorescence (fracture-plane UV) | 0.18 |
| Photograph (image morphometrics) | 0.22 |
| Micro-XRF / elemental profile | 0.22 |
| GC-MS | 0.20 |

**Hard rule:** fire-assay **fail** → **Counterfeit/Inferior**, regardless of other scores.

## Grades

| Grade | Rule |
|-------|------|
| **Counterfeit/Inferior** | Fire assay fail, or fusion score &lt; 0.70 |
| **Grade II** | Fusion score ≥ 0.70 and &lt; 0.80 |
| **Grade I** | Fusion score ≥ 0.80 and &lt; 0.85 |
| **Premium** | Fusion score ≥ 0.85 |

Reference parameters for continuous modalities are stored in `data/model_params.json` (derived from authentic lots in the LG1–LG9 panel). Example lot scores: `data/lot_fused.csv`.

## Accepted uploads

| Modality | Types | Limit |
|----------|-------|------|
| Photograph | `.jpg` `.jpeg` `.png` `.webp` `.bmp` | 15 MB |
| Micro-XRF / XRD | `.csv` `.txt` `.xlsx` `.xls` | 5 MB |
| GC-MS | `.csv` `.tsv` `.txt` `.xlsx` `.xls` | 8 MB |

CSV/XLSX templates: `data/templates/`.

## Layout

```
os-draconis-grader/
  index.html
  README.md
  css/app.css
  js/app.js
  js/score.js
  js/image.js
  js/certificate.js
  js/vendor/jspdf.umd.min.js
  data/
    model_params.json
    lot_fused.csv
    demos.json
    templates/
```

## Citation

If you use this grader in a publication, please cite the accompanying Os Draconis multimodal authentication / gut–brain study (manuscript in preparation) and this repository URL.
