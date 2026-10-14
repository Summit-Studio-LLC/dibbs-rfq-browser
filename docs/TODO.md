# TODO / Later

Ideas and follow-ups deliberately deferred to keep the POC small. Each one notes who raised it.

- [ ] **Quote builder (Noah):** form to fill in the vendor-response fields of the batch-quote
      (`bq`) file (unit price, delivery days, quantity price breaks, certifications) and export a
      DIBBS-valid file for batch upload. Spec: DIBBS "Batch Quoting File Format" page
      (`/Refs/help/Quoting/Batch/BatchFormat.aspx`).
- [ ] **CAGE → company name (Claude):** the approved-sources file has CAGE codes but blank company
      names; resolve them via SAM.gov / the CAGE registry so "approved sources" are human-readable.
- [ ] **Smart search box details (Claude):** detect NSN / NIIN / solicitation # / CAGE / FSC from the
      typed input and show "matched on …" chips. (Agreed in principle, to revisit when building UI.)
- [ ] **Longer history (Claude):** ingest more than 3 days so re-posts/extensions show up in the change history.
