/**
 * Os Draconis multimodal fusion scoring engine.
 */
(function (global) {
  const DEFAULTS = {
    weights: { fire: 0.18, fluo: 0.18, image: 0.22, xrf: 0.22, gcms: 0.2 },
    thresholds: { premium: 0.85, grade_i: 0.8, grade_ii: 0.7 },
    image: {
      lab_mean_L: { mean: 174.5139, std: 17.4769 },
      lab_mean_b_centered: { mean: 8.8613, std: 7.0428 },
      lbp_entropy: { mean: 3.1636, std: 0.0723 },
    },
    xrf: {
      Ca: { mean: 71.1671, std: 3.9941 },
      CaP_mol: { mean: 3.0308, std: 0.7659 },
      SiAl: { mean: 5.2743, std: 5.2656 },
    },
    gcms: {
      log10_tic: { mean: 9.6599, std: 0.0778 },
      n_peaks_filt: { mean: 90.0, std: 1.0 },
    },
  };

  let P = JSON.parse(JSON.stringify(DEFAULTS));

  function setParams(raw) {
    if (!raw) return;
    P.weights = Object.assign({}, DEFAULTS.weights, raw.weights || {});
    P.thresholds = Object.assign({}, DEFAULTS.thresholds, raw.thresholds || {});
    P.image = Object.assign({}, DEFAULTS.image, raw.image || {});
    P.xrf = Object.assign({}, DEFAULTS.xrf, raw.xrf || {});
    P.gcms = Object.assign({}, DEFAULTS.gcms, raw.gcms || {});
  }

  function z(value, ref) {
    if (value == null || !Number.isFinite(value) || !ref) return null;
    return (value - ref.mean) / Math.max(ref.std, 1e-6);
  }

  function zclip(zv) {
    if (zv == null || !Number.isFinite(zv)) return null;
    return Math.max(0, Math.min(1, 1 - Math.abs(zv) / 3));
  }

  function scoreL(zv) {
    if (zv == null) return null;
    return Math.max(0, Math.min(1, (zv + 1.5) / 3));
  }

  function avg(arr) {
    const v = arr.filter((x) => x != null && Number.isFinite(x));
    if (!v.length) return null;
    return v.reduce((a, b) => a + b, 0) / v.length;
  }

  function scoreImage(f) {
    if (!f) return null;
    return avg([
      scoreL(z(f.lab_mean_L, P.image.lab_mean_L)),
      zclip(z(f.lab_mean_b_centered, P.image.lab_mean_b_centered)),
      zclip(z(f.lbp_entropy, P.image.lbp_entropy)),
    ]);
  }

  function scoreXrf(x) {
    if (!x) return null;
    let caP = x.CaP_mol;
    let siAl = x.SiAl;
    if (caP == null && x.Ca != null && x.P != null && x.P > 0) {
      caP = x.Ca / 40.078 / (x.P / 30.973762);
    }
    if (siAl == null && (x.Si != null || x.Al != null)) {
      siAl = (Number(x.Si) || 0) + (Number(x.Al) || 0);
    }
    if (x.Ca == null && caP == null && siAl == null) return null;
    return avg([
      zclip(z(caP, P.xrf.CaP_mol)),
      zclip(z(siAl, P.xrf.SiAl)),
      zclip(z(x.Ca, P.xrf.Ca)),
    ]);
  }

  function scoreGcms(g) {
    if (!g) return null;
    let logT = g.log10_tic;
    if (logT == null && g.tic != null && g.tic > 0) logT = Math.log10(g.tic + 1);
    return avg([
      zclip(z(logT, P.gcms.log10_tic)),
      zclip(z(g.n_peaks_filt, P.gcms.n_peaks_filt)),
    ]);
  }

  function gradeOf(score, fireFailed) {
    if (fireFailed) {
      return {
        grade: "Counterfeit/Inferior",
        css: "inferior",
        reason: "Fire assay failed — automatic Counterfeit/Inferior assignment",
      };
    }
    if (score == null) return { grade: "—", css: "", reason: "Insufficient input" };
    const t = P.thresholds;
    if (score >= t.premium)
      return { grade: "Premium", css: "premium", reason: "Fusion score ≥ " + (t.premium * 100).toFixed(0) };
    if (score >= t.grade_i)
      return { grade: "Grade I", css: "grade-i", reason: "Fusion score ≥ " + (t.grade_i * 100).toFixed(0) };
    if (score >= t.grade_ii)
      return { grade: "Grade II", css: "grade-ii", reason: "Fusion score ≥ " + (t.grade_ii * 100).toFixed(0) };
    return {
      grade: "Counterfeit/Inferior",
      css: "inferior",
      reason: "Fusion score < " + (t.grade_ii * 100).toFixed(0),
    };
  }

  function pct(s) {
    return s == null ? null : Math.round(s * 1000) / 10;
  }

  function buildCommentary(modules, fusion, grade, fireFailed) {
    const byKey = {};
    modules.forEach((m) => (byKey[m.key] = m));
    const bullets = [];
    const weak = [];
    const strong = [];

    modules.forEach((m) => {
      if (m.score == null) {
        bullets.push(m.label + " was not provided and did not contribute to the fusion score.");
        return;
      }
      const p = pct(m.score);
      if (m.score >= 0.8) strong.push(m.label + " (" + p + ")");
      else if (m.score < 0.55) weak.push(m.label + " (" + p + ")");
    });

    let summary = "";
    const scoreTxt =
      fusion == null ? "no fusion score" : (pct(fusion).toFixed(1) + " / 100");

    if (fireFailed) {
      summary =
        "This lot is graded Counterfeit/Inferior because the fire assay failed (charring and/or offensive odour). " +
        "Under the quality rules, a failed fire assay overrides other modalities. Current fusion reading: " +
        scoreTxt +
        ".";
      bullets.unshift(
        "Fire assay fail is a hard stop: authentic Longgu should remain largely unchanged with no offensive odour."
      );
      if (byKey.fluo && byKey.fluo.score === 0) {
        bullets.push("Fluorescence was also negative, which further supports a non-authentic profile.");
      }
      if (byKey.gcms && byKey.gcms.score != null && byKey.gcms.score < 0.5) {
        bullets.push("GC-MS chemistry is far from the authentic centre (abnormal TIC / peak profile).");
      }
      if (byKey.xrf && byKey.xrf.score != null && byKey.xrf.score < 0.55) {
        bullets.push("Mineralogy (Ca/P or silicate load) departs from authentic hydroxyapatite-like lots.");
      }
    } else if (grade === "Premium") {
      summary =
        "Premium grade reflects a high multimodal fusion score (" +
        scoreTxt +
        "). Traditional assays and instrument profiles align closely with authentic Longgu reference lots.";
      if (strong.length) bullets.push("Strong modalities: " + strong.join(", ") + ".");
      if (byKey.fire && byKey.fire.score === 1) bullets.push("Fire assay passed.");
      if (byKey.fluo && byKey.fluo.score === 1) bullets.push("Fluorescence was positive.");
    } else if (grade === "Grade I") {
      summary =
        "Grade I indicates a solid authentic-like profile (" +
        scoreTxt +
        ") with only mild deviation from the Premium band.";
      if (strong.length) bullets.push("Supportive modalities: " + strong.join(", ") + ".");
      if (weak.length) bullets.push("Slightly weaker modalities: " + weak.join(", ") + ".");
      else bullets.push("No major modality failure; score sits just below the Premium threshold.");
    } else if (grade === "Grade II") {
      summary =
        "Grade II means the lot remains within an acceptable band (" +
        scoreTxt +
        ") but one or more modalities pull the fusion score down relative to Premium / Grade I material.";
      if (weak.length) bullets.push("Main drag factors: " + weak.join(", ") + ".");
      if (byKey.fluo && byKey.fluo.score === 0) {
        bullets.push("Negative fluorescence reduces traditional-assay confidence.");
      }
      if (byKey.xrf && byKey.xrf.score != null && byKey.xrf.score < 0.6) {
        bullets.push("XRF/XRD suggests elevated silicate (Si+Al) or atypical Ca/P relative to clean bone mineral.");
      }
      if (byKey.image && byKey.image.score != null && byKey.image.score < 0.6) {
        bullets.push("Image features (whiteness / yellowness / texture) deviate from preferred authentic appearance.");
      }
      if (byKey.gcms && byKey.gcms.score != null && byKey.gcms.score < 0.6) {
        bullets.push("GC-MS total ion current or peak count is away from the authentic centre.");
      }
    } else {
      summary =
        "Counterfeit/Inferior is assigned because the multimodal fusion score is low (" +
        scoreTxt +
        ") and/or key authenticity signals are missing or adverse.";
      if (byKey.fluo && byKey.fluo.score === 0) {
        bullets.push("Fluorescence was negative — a frequent marker of non-authentic material in this panel.");
      }
      if (weak.length) bullets.push("Weak modalities: " + weak.join(", ") + ".");
      if (byKey.xrf && byKey.xrf.score != null && byKey.xrf.score < 0.55) {
        bullets.push("Mineral composition does not match authentic hydroxyapatite-dominated Longgu.");
      }
      if (byKey.gcms && byKey.gcms.score != null && byKey.gcms.score < 0.5) {
        bullets.push("Organic GC-MS profile is inconsistent with authentic lots (too depleted or abnormally high).");
      }
      if (byKey.image && byKey.image.score != null && byKey.image.score < 0.55) {
        bullets.push("Appearance features do not support a high-quality authentic grade.");
      }
    }

    if (!bullets.length) {
      bullets.push("Grade follows the weighted fusion of the modalities that were provided.");
    }

    return { summary, bullets };
  }

  function evaluate(input) {
    const w = P.weights;
    const fireFailed = input.firePass === false;
    const modules = [
      {
        key: "fire",
        label: "Fire assay",
        weight: w.fire,
        score: fireFailed ? 0 : input.firePass === true ? 1 : null,
      },
      {
        key: "fluo",
        label: "Fluorescence",
        weight: w.fluo,
        score:
          input.fluoPositive === true ? 1 : input.fluoPositive === false ? 0 : null,
      },
      {
        key: "image",
        label: "Image morphology",
        weight: w.image,
        score: scoreImage(input.imageFeats),
      },
      {
        key: "xrf",
        label: "Micro-XRF / XRD",
        weight: w.xrf,
        score: scoreXrf(input.xrf),
      },
      {
        key: "gcms",
        label: "GC-MS",
        weight: w.gcms,
        score: scoreGcms(input.gcms),
      },
    ];

    const present = modules.filter((m) => m.score != null);
    const missing = modules.filter((m) => m.score == null).map((m) => m.label);
    let fusion = null;
    if (present.length) {
      const ws = present.reduce((a, m) => a + m.weight, 0);
      fusion = present.reduce((a, m) => a + (m.weight / ws) * m.score, 0);
    }
    if (fireFailed) fusion = Math.min(fusion == null ? 0 : fusion, 0.35);

    const g = gradeOf(fusion, fireFailed);
    const commentary = buildCommentary(modules, fusion, g.grade, fireFailed);

    const warnings = [];
    // Soft notes only — do not block grading when all recommended fields are filled
    const notes = [];
    if (missing.length) {
      warnings.push(
        "Missing modalities: " +
          missing.join(", ") +
          ". Incomplete multimodal input may reduce grading accuracy."
      );
    }
    if (present.length < 2 && !fireFailed) {
      warnings.push(
        "Fewer than two modalities supplied. Add traditional and instrument measurements for a more reliable grade."
      );
    }
    if (input.imageApprox) {
      notes.push(
        "Image features were extracted in-browser (CIE Lab + LBP entropy) from the uploaded photograph."
      );
    }

    return {
      modules,
      fusion,
      grade: g.grade,
      gradeCss: g.css,
      gradeReason: g.reason,
      commentary: commentary.summary,
      commentBullets: commentary.bullets,
      missing,
      warnings,
      notes,
      fireFailed,
    };
  }

  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    if (!lines.length) return { headers: [], rows: [] };
    const split = (line) => {
      const out = [];
      let cur = "",
        q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          q = !q;
          continue;
        }
        if (ch === "," && !q) {
          out.push(cur.trim());
          cur = "";
          continue;
        }
        cur += ch;
      }
      out.push(cur.trim());
      return out;
    };
    const headers = split(lines[0]).map((h) => h.toLowerCase());
    const rows = lines.slice(1).filter(Boolean).map((line) => {
      const cells = split(line);
      const o = {};
      headers.forEach((h, i) => (o[h] = cells[i]));
      return o;
    });
    return { headers, rows };
  }

  function sheetToCsvText(workbook) {
    const XLSXlib = global.XLSX;
    if (!XLSXlib) throw new Error("SheetJS (XLSX) is not available.");
    const name = workbook.SheetNames[0];
    return XLSXlib.utils.sheet_to_csv(workbook.Sheets[name]);
  }

  function num(v) {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function pick(row, names) {
    for (const n of names) {
      const k = Object.keys(row).find((x) => x.toLowerCase() === n.toLowerCase());
      if (k != null && row[k] !== "" && row[k] != null) return row[k];
    }
    return null;
  }

  function parseXrfTable(text) {
    const { rows } = parseCsv(text);
    if (!rows.length) throw new Error("XRF/XRD file has no data rows.");
    const row = rows[0];
    const Ca = num(pick(row, ["ca", "ca_wt", "ca%"]));
    const Pv = num(pick(row, ["p", "p_wt", "p%"]));
    const Si = num(pick(row, ["si", "si_wt"]));
    const Al = num(pick(row, ["al", "al_wt"]));
    const Fe = num(pick(row, ["fe", "fe_wt"]));
    if (Ca == null && Pv == null)
      throw new Error("Table must include Ca and/or P columns (wt%).");
    return { Ca, P: Pv, Si, Al, Fe, source: "table" };
  }

  function parseGcmsTable(text) {
    const { headers, rows } = parseCsv(text);
    if (!rows.length) throw new Error("GC-MS file has no data rows.");
    if (headers.some((h) => h.includes("log10")) || headers.includes("n_peaks_filtered")) {
      const row = rows[0];
      return {
        log10_tic: num(pick(row, ["log10_tic", "log10tic"])),
        n_peaks_filt: num(pick(row, ["n_peaks_filtered", "n_peaks_filt", "npeaks"])),
        source: "summary-table",
      };
    }
    let tic = 0,
      nFilt = 0;
    const artifact = /(siloxane|silanol|phthalate|tms|trimethylsilyl|column|bleed)/i;
    rows.forEach((row) => {
      const name = String(pick(row, ["name", "compound", "analyte"]) || "");
      const sim = num(pick(row, ["similarity", "sim", "match"]));
      const area = num(
        pick(row, ["lg_tic", "area", "tic", "abundance", "height", "intensity"])
      );
      if (area != null) tic += Math.abs(area);
      if ((sim == null || sim >= 650) && !artifact.test(name)) nFilt += 1;
    });
    if (tic <= 0 && nFilt <= 0)
      throw new Error("GC-MS file needs log10_TIC summary columns or a peak table with Area/TIC.");
    return {
      tic: tic > 0 ? tic : null,
      log10_tic: tic > 0 ? Math.log10(tic + 1) : null,
      n_peaks_filt: nFilt || null,
      source: "peak-table",
    };
  }

  global.OsDraconisScore = {
    setParams,
    evaluate,
    scoreImage,
    scoreXrf,
    scoreGcms,
    parseXrfTable,
    parseGcmsTable,
    parseCsv,
    sheetToCsvText,
    DEFAULTS,
  };
})(window);
