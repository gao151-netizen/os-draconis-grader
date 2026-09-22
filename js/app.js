/**
 * Os Draconis Grader UI
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const state = {
    imageFeats: null,
    imageApprox: false,
    xrf: null,
    gcms: null,
    lastResult: null,
    lastInput: null,
  };

  function numOrNull(v) {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function readFire() {
    const el = document.querySelector('input[name="fire"]:checked');
    if (!el) return null;
    return el.value === "pass";
  }

  function readFluo() {
    const el = document.querySelector('input[name="fluo"]:checked');
    if (!el) return null;
    return el.value === "pos";
  }

  function readManualXrf() {
    const Ca = numOrNull($("xrfCa").value);
    const P = numOrNull($("xrfP").value);
    const Si = numOrNull($("xrfSi").value);
    const Al = numOrNull($("xrfAl").value);
    if (Ca == null || P == null) return null;
    return { Ca, P, Si, Al, source: "manual" };
  }

  function readManualGcms() {
    const log10_tic = numOrNull($("gcmsLogTic").value);
    const n_peaks_filt = numOrNull($("gcmsNPeaks").value);
    if (log10_tic == null && n_peaks_filt == null) return null;
    return { log10_tic, n_peaks_filt, source: "manual" };
  }

  function hasXrf() {
    return !!(state.xrf || readManualXrf());
  }

  function hasGcms() {
    return !!(state.gcms || readManualGcms());
  }

  function collectInput() {
    return {
      firePass: readFire(),
      fluoPositive: readFluo(),
      imageFeats: state.imageFeats,
      imageApprox: state.imageApprox,
      xrf: state.xrf || readManualXrf(),
      gcms: state.gcms || readManualGcms(),
    };
  }

  function clearFieldErrors() {
    ["panelImage", "panelFire", "panelFluo", "panelXrf", "panelGcms"].forEach((id) => {
      $(id).classList.remove("has-error");
    });
  }

  function markMissingFields() {
    clearFieldErrors();
    const warnings = [];
    if (!state.imageFeats) {
      $("panelImage").classList.add("has-error");
      warnings.push("Photograph is missing.");
    }
    if (readFire() == null) {
      $("panelFire").classList.add("has-error");
      warnings.push("Fire assay result is missing.");
    }
    if (readFluo() == null) {
      $("panelFluo").classList.add("has-error");
      warnings.push("Fluorescence assay result is missing.");
    }
    if (!hasXrf()) {
      $("panelXrf").classList.add("has-error");
      warnings.push("Micro-XRF / XRD is missing (upload a file, or enter both Ca and P).");
    }
    if (!hasGcms()) {
      $("panelGcms").classList.add("has-error");
      warnings.push("GC-MS is missing (upload a file or enter summary values).");
    }
    return warnings;
  }

  function showModal(warnings, onContinue) {
    const backdrop = $("warnModal");
    const list = $("warnList");
    list.innerHTML = "";
    warnings.forEach((w) => {
      const li = document.createElement("li");
      li.textContent = w;
      list.appendChild(li);
    });
    backdrop.classList.add("show");

    function cleanup() {
      backdrop.classList.remove("show");
      $("warnContinue").removeEventListener("click", ok);
      $("warnCancel").removeEventListener("click", cancel);
    }
    function ok() {
      cleanup();
      onContinue();
    }
    function cancel() {
      cleanup();
    }
    $("warnContinue").addEventListener("click", ok);
    $("warnCancel").addEventListener("click", cancel);
  }

  function renderResult(res) {
    const banner = $("gradeBanner");
    banner.className = "grade-banner " + (res.gradeCss || "");
    $("gradeLabel").textContent = res.grade;
    $("gradeReason").textContent = res.gradeReason;
    const pct = res.fusion == null ? null : Math.round(res.fusion * 1000) / 10;
    $("fusionScore").textContent = pct == null ? "—" : pct.toFixed(1) + " / 100";
    $("meterFill").style.width = pct == null ? "0%" : pct + "%";

    $("gradeComment").textContent = res.commentary || "";
    const bullets = $("gradeBullets");
    bullets.innerHTML = "";
    (res.commentBullets || []).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      bullets.appendChild(li);
    });

    const ul = $("moduleScores");
    ul.innerHTML = "";
    res.modules.forEach((m) => {
      const li = document.createElement("li");
      const left = document.createElement("span");
      left.className = "mod";
      left.textContent = m.label + " · w=" + m.weight.toFixed(2);
      const right = document.createElement("span");
      if (m.score == null) {
        right.className = "missing";
        right.textContent = "Not provided";
      } else {
        right.className = "val";
        right.textContent = (m.score * 100).toFixed(1);
      }
      li.appendChild(left);
      li.appendChild(right);
      ul.appendChild(li);
    });

    $("resultEmpty").classList.add("hidden");
    $("resultBody").classList.remove("hidden");
    $("resultBody").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function finishGrade(res, input) {
    state.lastResult = res;
    state.lastInput = input;
    clearFieldErrors();
    renderResult(res);
  }

  function runGrade() {
    const fieldWarnings = markMissingFields();
    const input = collectInput();
    const res = OsDraconisScore.evaluate(input);

    // Only prompt when recommended fields are actually empty.
    // Informational notes (e.g. in-browser image extraction) must NOT block.
    if (fieldWarnings.length) {
      showModal(fieldWarnings, () => finishGrade(res, input));
      return;
    }
    finishGrade(res, input);
  }

  function exportPdf() {
    if (!state.lastResult) {
      alert("Please run quality grade first.");
      return;
    }
    try {
      OsDraconisCertificate.exportCertificate({
        result: state.lastResult,
        input: state.lastInput || collectInput(),
        sampleId: ($("sampleId").value || "").trim() || "UNASSIGNED",
      });
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  async function fileToCsvText(file) {
    const name = file.name.toLowerCase();
    if (/\.(xlsx|xls)$/.test(name)) {
      if (typeof XLSX === "undefined") {
        throw new Error("Excel parser not loaded. Check network access for SheetJS CDN.");
      }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      return OsDraconisScore.sheetToCsvText(wb);
    }
    return file.text();
  }

  async function onImageFile(file) {
    if (!file) return;
    try {
      const img = await OsDraconisImage.loadImageFromFile(file);
      const feats = OsDraconisImage.extractFeatures(img);
      state.imageFeats = {
        lab_mean_L: feats.lab_mean_L,
        lab_mean_b_centered: feats.lab_mean_b_centered,
        lbp_entropy: feats.lbp_entropy,
      };
      state.imageApprox = true;
      $("panelImage").classList.remove("has-error");
      $("imgPreview").classList.add("show");
      $("imgThumb").src = URL.createObjectURL(file);
      const box = $("maskPreview");
      box.innerHTML = "";
      box.appendChild(feats.previewCanvas);
      $("imgMeta").textContent =
        file.name +
        " · L*=" +
        feats.lab_mean_L.toFixed(1) +
        " · b=" +
        feats.lab_mean_b_centered.toFixed(1) +
        " · LBP-H=" +
        feats.lbp_entropy.toFixed(2);
      $("imgFileChip").textContent = file.name;
      $("imgFileChip").classList.remove("hidden");
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  async function onXrfFile(file) {
    if (!file) return;
    if (!/\.(csv|txt|xlsx|xls)$/i.test(file.name)) {
      alert("Accepted types: .csv, .txt, .xlsx, .xls");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("File exceeds 5 MB limit.");
      return;
    }
    try {
      const text = await fileToCsvText(file);
      state.xrf = OsDraconisScore.parseXrfTable(text);
      $("panelXrf").classList.remove("has-error");
      $("xrfFileChip").textContent = file.name;
      $("xrfFileChip").classList.remove("hidden");
      if (state.xrf.Ca != null) $("xrfCa").value = state.xrf.Ca;
      if (state.xrf.P != null) $("xrfP").value = state.xrf.P;
      if (state.xrf.Si != null) $("xrfSi").value = state.xrf.Si;
      if (state.xrf.Al != null) $("xrfAl").value = state.xrf.Al;
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  async function onGcmsFile(file) {
    if (!file) return;
    if (!/\.(csv|tsv|txt|xlsx|xls)$/i.test(file.name)) {
      alert("Accepted types: .csv, .tsv, .txt, .xlsx, .xls");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert("File exceeds 8 MB limit.");
      return;
    }
    try {
      const text = await fileToCsvText(file);
      state.gcms = OsDraconisScore.parseGcmsTable(text);
      $("panelGcms").classList.remove("has-error");
      $("gcmsFileChip").textContent = file.name;
      $("gcmsFileChip").classList.remove("hidden");
      if (state.gcms.log10_tic != null)
        $("gcmsLogTic").value = Number(state.gcms.log10_tic).toFixed(4);
      if (state.gcms.n_peaks_filt != null) $("gcmsNPeaks").value = state.gcms.n_peaks_filt;
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  function resetAll() {
    state.imageFeats = null;
    state.imageApprox = false;
    state.xrf = null;
    state.gcms = null;
    state.lastResult = null;
    state.lastInput = null;
    $("sampleId").value = "";
    ["xrfCa", "xrfP", "xrfSi", "xrfAl", "gcmsLogTic", "gcmsNPeaks"].forEach((id) => {
      $(id).value = "";
    });
    document.querySelectorAll('input[name="fire"]').forEach((el) => (el.checked = false));
    document.querySelectorAll('input[name="fluo"]').forEach((el) => (el.checked = false));
    $("imgPreview").classList.remove("show");
    ["imgFileChip", "xrfFileChip", "gcmsFileChip"].forEach((id) => $(id).classList.add("hidden"));
    $("resultBody").classList.add("hidden");
    $("resultEmpty").classList.remove("hidden");
    $("imgInput").value = "";
    $("xrfInput").value = "";
    $("gcmsInput").value = "";
    clearFieldErrors();
  }

  function init() {
    if (window.OS_DRACONIS_PARAMS) OsDraconisScore.setParams(window.OS_DRACONIS_PARAMS);
    fetch("data/model_params.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p) OsDraconisScore.setParams(p);
      })
      .catch(() => {});

    $("btnGrade").addEventListener("click", runGrade);
    $("btnReset").addEventListener("click", resetAll);
    $("btnExportPdf").addEventListener("click", exportPdf);
    $("imgInput").addEventListener("change", (e) => onImageFile(e.target.files[0]));
    $("xrfInput").addEventListener("change", (e) => onXrfFile(e.target.files[0]));
    $("gcmsInput").addEventListener("change", (e) => onGcmsFile(e.target.files[0]));

    document.querySelectorAll('input[name="fire"]').forEach((el) => {
      el.addEventListener("change", () => $("panelFire").classList.remove("has-error"));
    });
    document.querySelectorAll('input[name="fluo"]').forEach((el) => {
      el.addEventListener("change", () => $("panelFluo").classList.remove("has-error"));
    });
    ["xrfCa", "xrfP", "xrfSi", "xrfAl"].forEach((id) => {
      $(id).addEventListener("input", () => {
        if (readManualXrf()) $("panelXrf").classList.remove("has-error");
      });
    });
    ["gcmsLogTic", "gcmsNPeaks"].forEach((id) => {
      $(id).addEventListener("input", () => {
        if (readManualGcms()) $("panelGcms").classList.remove("has-error");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
