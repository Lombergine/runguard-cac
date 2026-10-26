# Explanation layer — validation examples

Generated 2026-10-26 against the local server with the seeded team. Each example shows exactly what the model received (numbers only, no name) and exactly what it returned after validation: JSON shape enforced by the API's structured output, word limits checked, and every number in the reply required to appear in the input. A reply that fails any check is replaced by RunGuard's own template wording and labelled.

## Seeded athlete, no gait data

Source: `anthropic` · model: `claude-haiku-5-5` · fallback reason: None

**Input (what the model saw)**

```json
{
  "acwr": 0.9530745356627196,
  "acute": 311.87188862918566,
  "chronic": 327.22717579724844,
  "method": "ewma",
  "personalThreshold95": 1.3013689455643798,
  "referenceFlaggedFraction": 0.03296703296703297,
  "auditSpearman": 0.6774134955953138,
  "auditCI": [
    0.6036938784025813,
    0.7653700414805077
  ],
  "usableDays": 364,
  "gctDriftPct": null,
  "voDriftPct": null,
  "dataQualityFlags": []
}
```

**Output (validated)**

```json
{
  "summary": "Your acute:chronic workload ratio is 0.95, meaning your last few days of training (acute load 311.9) sit close to your longer-term average (chronic load 327.2). This was calculated with a smoothed exponentially weighted method using 364 usable days of data. The personal threshold at the 95th percentile is 1.30, and only about 3% of reference days were flagged above a level like that.",
  "caution": "This ratio is a descriptive trend number, not a measure of injury risk or a training prescription. Ask a coach or doctor about your own training.",
  "citation": "Williams et al. (2017), BJSM 51(3): the EWMA form of the ratio"
}
```

## Seeded athlete with a 6.4% contact-time drift from the phone

Source: `anthropic` · model: `claude-haiku-5-5` · fallback reason: None

**Input (what the model saw)**

```json
{
  "acwr": 0.9530745356627196,
  "acute": 311.87188862918566,
  "chronic": 327.22717579724844,
  "method": "ewma",
  "personalThreshold95": 1.3013689455643798,
  "referenceFlaggedFraction": 0.03296703296703297,
  "auditSpearman": 0.6774134955953138,
  "auditCI": [
    0.6036938784025813,
    0.7653700414805077
  ],
  "usableDays": 364,
  "gctDriftPct": 6.4,
  "voDriftPct": 2.9,
  "dataQualityFlags": []
}
```

**Output (validated)**

```json
{
  "summary": "Your acute:chronic workload ratio is 0.95. Your recent 7-day load (acute, 311.9) is slightly below your longer-term average (chronic, 327.2), calculated with an exponentially weighted moving average. Your personal 95th-percentile threshold is 1.30, based on 364 usable days.",
  "caution": "This ratio is a single model-based number, not a measure of how you feel or perform. Read it alongside your own experience and your coach's guidance.",
  "citation": "Williams et al. (2017), BJSM 51(3): the EWMA form of the ratio"
}
```

## Template fallback (no model configured)

When no key is set, `explainAudit` returns `source: "template"` with `fallbackReason: "no model configured on this server"`; `explain.test.ts` covers it. The wording comes from `templateExplanation`, which only concatenates the input numbers.
