/**
 * One-page Os Draconis quality certificate (PDF).
 * Uses jsPDF (global jspdf.jsPDF).
 */
(function (global) {
  function fmt(n, d) {
    if (n == null || !Number.isFinite(n)) return "—";
    return Number(n).toFixed(d == null ? 1 : d);
  }

  function drawBorder(doc, margin) {
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(18, 52, 59);
    doc.setLineWidth(1.6);
    doc.rect(margin, margin, w - 2 * margin, h - 2 * margin);
    doc.setLineWidth(0.4);
    doc.rect(margin + 3, margin + 3, w - 2 * margin - 6, h - 2 * margin - 6);
  }

  function gradeColor(css) {
    if (css === "premium") return [11, 110, 79];
    if (css === "grade-i") return [31, 111, 139];
    if (css === "grade-ii") return [179, 107, 0];
    if (css === "inferior") return [155, 44, 44];
    return [90, 100, 110];
  }

  /**
   * @param {object} payload
   * @param {object} payload.result  evaluate() output
   * @param {object} payload.input   collected inputs
   * @param {string} payload.sampleId
   * @param {string} [payload.certNo]
   */
  function getJsPDF() {
    if (global.jspdf && global.jspdf.jsPDF) return global.jspdf.jsPDF;
    if (typeof global.jsPDF === "function") return global.jsPDF;
    if (global.window && global.window.jspdf && global.window.jspdf.jsPDF) {
      return global.window.jspdf.jsPDF;
    }
    return null;
  }

  function exportCertificate(payload) {
    const JsPDF = getJsPDF();
    if (!JsPDF) {
      throw new Error(
        "PDF library (jsPDF) is not loaded. Ensure js/vendor/jspdf.umd.min.js is present and refresh the page (Ctrl+F5)."
      );
    }
    const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 12;
    const result = payload.result || {};
    const input = payload.input || {};
    const sampleId = payload.sampleId || "UNASSIGNED";
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8);
    const certNo =
      payload.certNo ||
      "OD-" +
        dateStr.replace(/-/g, "") +
        "-" +
        String(Math.floor(Math.random() * 9000) + 1000);

    drawBorder(doc, margin);

    // Header band
    doc.setFillColor(18, 52, 59);
    doc.rect(margin + 3, margin + 3, pageW - 2 * margin - 6, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("CERTIFICATE OF QUALITY ANALYSIS", pageW / 2, margin + 14, {
      align: "center",
    });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Os Draconis (Longgu) Multimodal Grading System", pageW / 2, margin + 22, {
      align: "center",
    });
    doc.setFontSize(8);
    doc.text("Traditional assays · Micro-XRF / XRD · GC-MS · Image morphology", pageW / 2, margin + 27, {
      align: "center",
    });

    let y = margin + 40;
    doc.setTextColor(26, 35, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Certificate No.: " + certNo, margin + 8, y);
    doc.text("Issue date: " + dateStr + "  " + timeStr, pageW - margin - 8, y, {
      align: "right",
    });

    y += 8;
    doc.setDrawColor(200, 210, 216);
    doc.setLineWidth(0.2);
    doc.line(margin + 8, y, pageW - margin - 8, y);

    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Specimen identification", margin + 8, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Sample ID:  " + sampleId, margin + 8, y);
    y += 6;
    doc.text(
      "Material:  Os Draconis / Longgu (fossil bone medicinal material)",
      margin + 8,
      y
    );

    // Grade box
    y += 12;
    const gc = gradeColor(result.gradeCss);
    doc.setFillColor(gc[0], gc[1], gc[2]);
    doc.roundedRect(margin + 8, y, pageW - 2 * margin - 16, 22, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("ASSIGNED QUALITY CLASS", pageW / 2, y + 7, { align: "center" });
    doc.setFontSize(16);
    doc.text(String(result.grade || "—"), pageW / 2, y + 16, { align: "center" });

    y += 30;
    doc.setTextColor(26, 35, 50);
    doc.setFontSize(10);
    const fusionPct =
      result.fusion == null ? "—" : (Math.round(result.fusion * 1000) / 10).toFixed(1);
    doc.setFont("helvetica", "bold");
    doc.text("Multimodal fusion score:  " + fusionPct + " / 100", margin + 8, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(String(result.gradeReason || ""), margin + 8, y);

    // Assay summary
    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Assay & instrument summary", margin + 8, y);
    y += 6;

    const fireTxt =
      input.firePass === true ? "Pass" : input.firePass === false ? "Fail" : "Not tested";
    const fluoTxt =
      input.fluoPositive === true
        ? "Positive"
        : input.fluoPositive === false
          ? "Negative"
          : "Not tested";
    const xrf = input.xrf || {};
    const gcms = input.gcms || {};

    const rows = [
      ["Fire assay", fireTxt],
      ["Fluorescence", fluoTxt],
      [
        "Image morphology",
        input.imageFeats
          ? "Provided (L*=" +
            fmt(input.imageFeats.lab_mean_L, 1) +
            ", b=" +
            fmt(input.imageFeats.lab_mean_b_centered, 1) +
            ")"
          : "Not provided",
      ],
      [
        "Micro-XRF / XRD",
        xrf.Ca != null
          ? "Ca=" +
            fmt(xrf.Ca, 2) +
            " wt%, P=" +
            fmt(xrf.P, 2) +
            " wt%" +
            (xrf.Si != null ? ", Si=" + fmt(xrf.Si, 2) : "") +
            (xrf.Al != null ? ", Al=" + fmt(xrf.Al, 2) : "")
          : "Not provided",
      ],
      [
        "GC-MS",
        gcms.log10_tic != null || gcms.n_peaks_filt != null
          ? "log10(TIC)=" +
            fmt(gcms.log10_tic, 3) +
            ", peaks=" +
            fmt(gcms.n_peaks_filt, 0)
          : "Not provided",
      ],
    ];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    rows.forEach((r) => {
      doc.setFont("helvetica", "bold");
      doc.text(r[0], margin + 8, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(r[1], pageW - 2 * margin - 70);
      doc.text(lines, margin + 58, y);
      y += 5 + (lines.length - 1) * 4;
    });

    // Modality scores table
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Modality scores (0–100)", margin + 8, y);
    y += 5;

    const mods = result.modules || [];
    doc.setFillColor(240, 245, 246);
    doc.rect(margin + 8, y, pageW - 2 * margin - 16, 7, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Modality", margin + 10, y + 5);
    doc.text("Weight", margin + 80, y + 5);
    doc.text("Score", margin + 110, y + 5);
    doc.text("Status", margin + 140, y + 5);
    y += 7;

    doc.setFont("helvetica", "normal");
    mods.forEach((m, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(250, 252, 253);
        doc.rect(margin + 8, y, pageW - 2 * margin - 16, 6.5, "F");
      }
      doc.text(m.label, margin + 10, y + 4.5);
      doc.text(fmt(m.weight, 2), margin + 80, y + 4.5);
      doc.text(m.score == null ? "—" : fmt(m.score * 100, 1), margin + 110, y + 4.5);
      doc.text(m.score == null ? "Omitted" : "Included", margin + 140, y + 4.5);
      y += 6.5;
    });

    // Commentary
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Interpretation", margin + 8, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const commentLines = doc.splitTextToSize(
      String(result.commentary || result.gradeReason || ""),
      pageW - 2 * margin - 16
    );
    doc.text(commentLines, margin + 8, y);
    y += commentLines.length * 4.2 + 3;

    (result.commentBullets || []).slice(0, 4).forEach((b) => {
      const bl = doc.splitTextToSize("•  " + b, pageW - 2 * margin - 16);
      doc.text(bl, margin + 8, y);
      y += bl.length * 4.2 + 1;
    });

    // Footer / attestation
    const footerY = doc.internal.pageSize.getHeight() - margin - 28;
    doc.setDrawColor(200, 210, 216);
    doc.line(margin + 8, footerY, pageW - margin - 8, footerY);

    doc.setFontSize(8);
    doc.setTextColor(90, 100, 110);
    doc.text(
      "This certificate summarises the multimodal quality grade computed by the Os Draconis Grader.",
      pageW / 2,
      footerY + 6,
      { align: "center" }
    );
    doc.text(
      "Weights: fire 0.18 · fluorescence 0.18 · image 0.22 · micro-XRF/XRD 0.22 · GC-MS 0.20.",
      pageW / 2,
      footerY + 11,
      { align: "center" }
    );

    doc.setTextColor(26, 35, 50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Authorised analytical report", margin + 8, footerY + 20);
    doc.setFont("helvetica", "normal");
    doc.text("Generated electronically — " + certNo, pageW - margin - 8, footerY + 20, {
      align: "right",
    });

    // Seal
    const cx = pageW - margin - 28;
    const cy = footerY + 8;
    doc.setDrawColor(gc[0], gc[1], gc[2]);
    doc.setLineWidth(0.8);
    doc.circle(cx, cy, 10);
    doc.circle(cx, cy, 8);
    doc.setFontSize(6);
    doc.setTextColor(gc[0], gc[1], gc[2]);
    doc.text("VERIFIED", cx, cy - 1, { align: "center" });
    doc.text("GRADE", cx, cy + 3, { align: "center" });

    const safeId = String(sampleId).replace(/[^\w\-]+/g, "_").slice(0, 40);
    doc.save("OsDraconis_Certificate_" + safeId + "_" + dateStr + ".pdf");
  }

  global.OsDraconisCertificate = { exportCertificate };
})(window);
