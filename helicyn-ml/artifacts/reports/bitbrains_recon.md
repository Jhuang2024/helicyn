# Bitbrains / GWA-T-12 Access Recon

Date: 2026-07-02
Scope: reconnaissance only - no downloader implemented, no schema/model changes.

## URLs tested

| URL | Reachable | Exact error |
|---|---|---|
| `https://atlarge-research.com/gwa-traces/gwa_t_12_fastStorage.zip` | **no** | `curl -I`: `HTTP/1.1 403 Forbidden` (Content-Length: 36, connection reset on GET, curl exit 56). `requests.get`: `ProxyError(MaxRetryError("HTTPSConnectionPool(host='atlarge-research.com', port=443): Max retries exceeded ... Caused by ProxyError('Unable to connect to proxy', OSError('Tunnel connection failed: 403 Forbidden'))"))` |
| `https://atlarge-research.com/gwa-traces/gwa_t_12_rnd.zip` | **no** | same proxy `403 Forbidden` / `Tunnel connection failed` pattern |
| `https://atlarge-research.com/gwa-traces/gwa_t_13_materna.zip` | **no** | same proxy `403 Forbidden` / `Tunnel connection failed` pattern |

All three fail identically at the sandbox's outbound HTTPS proxy, before reaching the real server - the proxy itself returns `403 Forbidden` on the `CONNECT` tunnel to `atlarge-research.com`. This is the same failure signature already documented for `aliyuncs.com` (Alibaba OSS) and GitHub Release-asset downloads in `docs/dataset_downloads.md`: the host is simply not on this environment's outbound allowlist. It is not a bad URL, a dead server, or a dataset-side access restriction (the GWA-T-12/T-13 traces are publicly downloadable with no login/survey per the AtLarge Research GWA program).

## Download attempt

`python -m helicyn_ml datasets download --dataset bitbrains-gwa-t12-faststorage --out data/raw/bitbrains/faststorage` was run to check whether the CLI already supports this dataset. It does not: `bitbrains-gwa-t12-faststorage` is not a registered `dataset_id` in `helicyn_ml/datasets/registry.py`, so the command raises `KeyError` (unhandled - `get_card()` has no graceful "unknown dataset" path in the CLI today, unlike a failed-but-known-dataset download).

Since the source URLs are unreachable from this sandbox regardless, no temporary manual download (curl/wget/requests) was attempted beyond the reachability probes above - it would fail identically.

**Result: fastStorage did NOT download. No archive was fetched or inspected.** Archive size, file count, sample filenames, sample rows, delimiter, and column count are unknown from this environment and are not reported here (fabricating them from memory of the public schema would violate this project's own no-fabrication rule - see `docs/limitations.md`).

## What the official Bitbrains/GWA-T-12 schema is documented to look like (for reference only, not verified here)

Per the publicly documented GWA-T-12 format (not independently confirmed by this recon): one `.csv` file per VM, semicolon-delimited, with columns approximately `Timestamp [ms], CPU cores, CPU capacity provisioned [MHZ], CPU usage [MHZ], CPU usage [%], Memory capacity provisioned [KB], Memory usage [KB], Disk read throughput [KB/s], Disk write throughput [KB/s], Network received throughput [KB/s], Network transmitted throughput [KB/s]`. This would be directly useful for `ResourcePredictor` (real CPU/memory usage vs. provisioned) and potentially `RuntimePredictor` if VM start/end can be derived from timestamp span. **This must be re-verified once the archive is actually inspected** - do not implement a normalizer against this unverified column list.

## Recommendation for next implementation step

1. **Do not implement a Bitbrains loader yet** - there is nothing to parse against; implementing `helicyn_ml/datasets/bitbrains_gwa_t12.py` now would mean writing a normalizer against a remembered/assumed schema, which this project's own integrity rules prohibit (see `docs/limitations.md`: no fabricated data, no unverified claims).
2. The blocker is purely network-policy (host allowlist), not URL correctness or code. Before any implementation work, this needs one of:
   - Running the download from an unrestricted environment (a real dev machine or a CI runner with a normal network policy) to actually fetch and inspect the archive, or
   - Adding `atlarge-research.com` to this sandboxed environment's outbound allowlist, if that's configurable.
3. Once an archive is actually fetched, the next recon step (still not full implementation) is: unzip, list files, `head` one VM CSV, confirm delimiter/column count against the documented schema above, and only then design `NormalizedWorkloadRecord`/`NormalizedPowerRecord` field mapping and write the loader.
4. This is a good target dataset once reachable: it has real per-VM CPU/memory *usage* (not just requests), which is exactly what `ResourcePredictor` currently lacks (BurstGPT provides 0% usage-label coverage). It likely does not carry job "runtime" in the batch-scheduling sense `RuntimePredictor` wants (VMs are long-running, not discrete jobs), so Alibaba/Google ClusterData remain the better target for that model specifically.
