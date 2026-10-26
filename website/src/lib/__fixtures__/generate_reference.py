"""Reference values from the acwr Python package, for the Swift port's tests."""
import json, math, sys
import numpy as np, pandas as pd
import acwr
from acwr.quality import check_load

def ser(vals, start="2025-01-01"):
    return pd.Series(np.asarray(vals, dtype=float), index=pd.date_range(start, periods=len(vals), freq="D"), name="load")

def nanlist(s):
    out = []
    for v in s.to_numpy():
        if np.isnan(v): out.append(None)
        elif np.isinf(v): out.append("inf" if v > 0 else "-inf")
        else: out.append(float(v))
    return out

def components(load, method):
    f = acwr.acwr(load, method=method, return_components=True)
    return {"acute": nanlist(f["acute"]), "chronic": nanlist(f["chronic"]), "acwr": nanlist(f["acwr"])}

def diagnostics(load, method="rac"):
    r = acwr.rescaling_check(load, method=method)
    t = acwr.threshold_from_history(load, method=method)
    q = check_load(load)
    # Spearman is discontinuous at ties. Windows holding the same training
    # days are mathematically tied; pandas' running rolling sum resolves them
    # by round-off, a plain sum does not. Rounding to 9 dp restores the ties,
    # which is the value an exact implementation must reproduce.
    from scipy import stats as _st
    f = acwr.acwr(load, method=method, return_components=True).replace([np.inf, -np.inf], np.nan).dropna()
    rho_ties = float(_st.spearmanr(np.round(f["acute"].to_numpy(), 9), np.round(f["acwr"].to_numpy(), 9)).statistic)
    return {
        "rescaling": {"n": r.n, "spearman": r.spearman, "spearman_ties_resolved": rho_ties, "pearson": r.pearson, "spearman_ci95": list(r.spearman_ci95)},
        "threshold": {"n": t.n, "percentiles": {str(int(k)): v for k, v in t.percentiles.items()},
                      "reference": t.reference, "reference_flagged": t.reference_flagged,
                      "reference_flagged_fraction": t.reference_flagged_fraction,
                      "reference_percentile": t.reference_percentile},
        "quality": {"n_days": q.n_days, "n_training_days": q.n_training_days, "ok": q.ok,
                    "findings": [{"check": f.check, "severity": f.severity, "message": f.message,
                                  "dates": [str(d.date()) for d in f.dates]} for f in q.findings]},
    }

out = {"generated_by": "acwr " + getattr(acwr, "__version__", "?") + f", numpy {np.__version__}, pandas {pd.__version__}, python {sys.version.split()[0]}"}

# Fixture A: the brief's series. gamma(2.0, 30.0, 400), seed 0, every day trained.
rng = np.random.default_rng(0)
a = ser(rng.gamma(2.0, 30.0, 400))
out["gamma400"] = {"start": "2025-01-01", "load": [float(v) for v in a.to_numpy()],
                   "rac": components(a, "rac"), "rau": components(a, "rau"), "ewma": components(a, "ewma"),
                   "diagnostics_rac": diagnostics(a, "rac"), "diagnostics_ewma": diagnostics(a, "ewma")}

# Fixture B: test_diagnostics.synthetic_load(): weekly rhythm, block structure, rest days.
def synthetic_load(n=500, seed=0):
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    weekly = 20.0 * np.sin(2 * np.pi * t / 7.0)
    block = 15.0 * np.sin(2 * np.pi * t / 90.0)
    base = 60.0 + weekly + block + rng.normal(0, 12.0, n)
    base = np.clip(base, 0.0, None)
    base[rng.random(n) < 0.12] = 0.0
    return ser(base)
b = synthetic_load()
out["rhythm500"] = {"start": "2025-01-01", "load": [float(v) for v in b.to_numpy()],
                    "rac": components(b, "rac"), "ewma": components(b, "ewma"),
                    "diagnostics_rac": diagnostics(b, "rac")}

# Fixture C: a lumpy log with a layoff and a holiday (test_ratio._rng_load), for quality + threshold with zeros.
rng = np.random.default_rng(11)
x = rng.gamma(shape=2.0, scale=5.0, size=900)
x[rng.random(900) < 0.40] = 0.0
x[300:340] = 0.0
x[700:712] = 0.0
c = ser(x, "2023-01-01")
out["lumpy900"] = {"start": "2023-01-01", "load": [float(v) for v in c.to_numpy()],
                   "rac": components(c, "rac"), "rau": components(c, "rau"),
                   "diagnostics_rac": diagnostics(c, "rac"), "diagnostics_rau": diagnostics(c, "rau")}

# Hand cases from test_ratio / test_quality, with the package's own answers recorded.
hand = {}
s = ser([50.0]*28 + [100.0]*7, "2026-01-01")
hand["spike_rac_last"] = float(acwr.acwr(s, method="rac").iloc[-1])
hand["spike_rau_last"] = float(acwr.acwr(s, method="rau").iloc[-1])
hand["spike_ewma_last"] = float(acwr.acwr(s, method="ewma").iloc[-1])
e = ser([0.0]*10 + [100.0] + [0.0]*10, "2026-01-01")
ea = acwr.acute_load(e, acute=7, method="ewma", min_periods=1)
hand["ewma_acute_spike_day"] = float(ea.iloc[10]); hand["ewma_acute_next_day"] = float(ea.iloc[11])
hand["steady400_ewma_last"] = float(acwr.acwr(ser([50.0]*400), method="ewma").iloc[-1])
q1 = check_load(ser([10.0]*20)); hand["short20_error"] = q1.errors[0].message
v = [10.0]*100; v[50] = 900.0
q2 = check_load(ser(v, "2026-01-01")); hand["outlier_dates"] = [str(d.date()) for f in q2.findings if f.check == "outlier days" for d in f.dates]
hand["outlier_message"] = [f.message for f in q2.findings if f.check == "outlier days"][0]
q3 = check_load(ser([10.0]*60 + [0.0]*30 + [10.0]*60, "2026-01-01")); hand["break_message"] = [f.message for f in q3.findings if f.check == "break"][0]
q4 = check_load(ser([10.0]*100 + [10000.0]*100, "2026-01-01")); hand["unit_message"] = [f.message for f in q4.findings if f.check == "suspected unit change"][0]
out["hand"] = hand

# Percentile reference (numpy linear) on a small array, and spearman with ties.
from scipy import stats
arr = np.array([3.0, 1.0, 4.0, 1.0, 5.0, 9.0, 2.0, 6.0])
out["stats"] = {"arr": arr.tolist(), "percentiles": {str(p): float(np.percentile(arr, p)) for p in (0, 25, 50, 75, 90, 95, 99, 100)},
                "spearman_vs_index": float(stats.spearmanr(arr, np.arange(8)).statistic),
                "pearson_vs_index": float(stats.pearsonr(arr, np.arange(8)).statistic)}

path = sys.argv[1]
with open(path, "w") as f:
    json.dump(out, f, indent=1)
print("wrote", path)
for k in ("gamma400", "rhythm500", "lumpy900"):
    d = out[k]["diagnostics_rac"]
    print(k, "rac last", out[k]["rac"]["acwr"][-1], "| spearman", round(d["rescaling"]["spearman"], 4), "ci", [round(x,4) for x in d["rescaling"]["spearman_ci95"]], "| p95", round(d["threshold"]["percentiles"]["95"], 4), "flagged", d["threshold"]["reference_flagged"], "/", d["threshold"]["n"], "| quality", [(f["check"], f["severity"]) for f in d["quality"]["findings"]])
print("hand", json.dumps(hand, indent=1))
"""Reference values for compare_to_null, appended to acwr_reference.json."""
import json, sys
import numpy as np, pandas as pd
import acwr
from acwr.diagnostics import _association
from scipy import stats

def synthetic_load(n=500, seed=0):
    rng = np.random.default_rng(seed); t = np.arange(n)
    weekly = 20.0 * np.sin(2 * np.pi * t / 7.0); block = 15.0 * np.sin(2 * np.pi * t / 90.0)
    base = np.clip(60.0 + weekly + block + rng.normal(0, 12.0, n), 0.0, None)
    base[rng.random(n) < 0.12] = 0.0
    return pd.Series(base, index=pd.date_range("2025-01-01", periods=n, freq="D"), name="load")

out = {}
# Case A: injury generated from acute load alone (the Impellizzeri result).
load = synthetic_load(900, seed=11)
a = acwr.acwr(load, return_components=True)["acute"]
rng = np.random.default_rng(5)
p = ((a - a.min()) / (a.max() - a.min())).fillna(0.0)
outcome = pd.Series((rng.random(len(p)) < 0.02 + 0.30 * p).astype(int), index=load.index)
res = acwr.compare_to_null(load, outcome, kind="shuffle", n_null_draws=120, seed=2)
out["acute_driven"] = {"load": [float(v) for v in load], "outcome": [int(v) for v in outcome],
    "n": res.n, "n_events": res.n_events, "measure": res.measure, "real": res.real, "real_ci95": list(res.real_ci95),
    "null": res.null, "null_ci95": list(res.null_ci95), "real_beats_null": bool(res.real_beats_null), "null_kind": "shuffle"}
# Case B: injury depends on the genuine ratio.
load2 = synthetic_load(900, seed=21)
r = acwr.acwr(load2).replace([np.inf, -np.inf], np.nan)
rng = np.random.default_rng(9)
z = ((r - r.mean()) / r.std()).fillna(0.0)
outcome2 = pd.Series((rng.random(len(z)) < 1 / (1 + np.exp(-(-2.6 + 1.9 * z)))).astype(int), index=load2.index)
res2 = acwr.compare_to_null(load2, outcome2, kind="shuffle", n_null_draws=120, seed=4)
out["ratio_driven"] = {"load": [float(v) for v in load2], "outcome": [int(v) for v in outcome2],
    "n": res2.n, "n_events": res2.n_events, "measure": res2.measure, "real": res2.real, "real_ci95": list(res2.real_ci95),
    "null": res2.null, "null_ci95": list(res2.null_ci95), "real_beats_null": bool(res2.real_beats_null), "null_kind": "shuffle"}
# AUC on a tiny hand case for the Mann-Whitney port.
x = np.array([0.2, 0.4, 0.6, 0.8, 0.5, 0.5]); y = np.array([0, 0, 1, 1, 0, 1])
out["auc_hand"] = {"x": x.tolist(), "y": y.tolist(), "auc": _association(x, y, True)[0]}
path = sys.argv[1]
ref = json.load(open(path)); ref["compare_to_null"] = out
json.dump(ref, open(path, "w"), indent=1)
for k in ("acute_driven", "ratio_driven"):
    d = out[k]; print(k, "real", round(d["real"],4), d["real_ci95"], "null", round(d["null"],4), d["null_ci95"], "beats", d["real_beats_null"], "events", d["n_events"])
print("auc_hand", out["auc_hand"]["auc"])
