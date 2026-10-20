"""CloudSpend - Google Cloud cost function.

Reads the Cloud Billing *detailed usage cost* export in BigQuery and returns the same
JSON shape as the OCI function, so the dashboard treats GCP like another provider
(projects take the place of tenancies). Read-only.

Env: BILLING_DATASET = "<project>.<dataset>" (the export table is found automatically)
     ALLOWED_ORIGIN  = dashboard origin for CORS (default https://harsha7.github.io)

Request body (POST JSON):
  {}                                                -> billing: last 12 full months
  {"mode": "inventory", "period": "last_month"|"mtd"} -> cost per resource
"""
import json
import os
from datetime import datetime, timedelta, timezone

import functions_framework
from google.cloud import bigquery

DATASET = os.environ.get("BILLING_DATASET", "")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "https://harsha7.github.io")
OWNER_LABELS = ("owner", "created-by", "created_by", "createdby", "creator")
NET = "(cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0))"

_client = None
_table = None


def client():
    global _client
    if _client is None:
        _client = bigquery.Client(project=DATASET.split(".")[0] if DATASET else None)
    return _client


def export_table():
    """Find the detailed export table (gcp_billing_export_resource_v1_*) in the dataset."""
    global _table
    if _table:
        return _table
    if not DATASET or "." not in DATASET:
        raise RuntimeError("BILLING_DATASET env var must be '<project>.<dataset>'")
    names = [t.table_id for t in client().list_tables(DATASET)]
    detailed = sorted(n for n in names if n.startswith("gcp_billing_export_resource_v1_"))
    if not detailed:
        raise RuntimeError("The detailed billing export table has not been created yet in "
                           f"{DATASET}. Google creates it within a few hours of enabling the export.")
    _table = f"`{DATASET}.{detailed[0]}`"
    return _table


def run(sql, params):
    cfg = bigquery.QueryJobConfig(query_parameters=params, use_query_cache=True)
    return list(client().query(sql, job_config=cfg).result())


def month_label(yyyymm):
    return datetime.strptime(yyyymm, "%Y%m").strftime("%b %Y")


def billing():
    now = datetime.now(timezone.utc)
    first_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    months = []
    d = first_this
    for _ in range(12):
        d = (d - timedelta(days=1)).replace(day=1)
        months.append(d.strftime("%Y%m"))
    start_m, end_m = min(months), first_this.strftime("%Y%m")
    sql = f"""
      SELECT invoice.month AS m,
             IFNULL(project.id, '') AS pid,
             IFNULL(project.name, IF(cost_type = 'tax', 'Tax', '(billing account)')) AS pname,
             IFNULL(location.region, IFNULL(location.location, 'global')) AS region,
             service.description AS svc, sku.description AS sku,
             ANY_VALUE(currency) AS currency,
             SUM({NET}) AS net
      FROM {export_table()}
      WHERE invoice.month >= @start_m AND invoice.month < @end_m
        AND usage_start_time >= TIMESTAMP_SUB(@start_ts, INTERVAL 7 DAY)
      GROUP BY m, pid, pname, region, svc, sku
      HAVING ABS(net) >= 0.005"""
    rows = run(sql, [bigquery.ScalarQueryParameter("start_m", "STRING", start_m),
                     bigquery.ScalarQueryParameter("end_m", "STRING", end_m),
                     bigquery.ScalarQueryParameter("start_ts", "TIMESTAMP",
                                                   datetime.strptime(start_m, "%Y%m").replace(tzinfo=timezone.utc))])
    formatted, totals, regions, currency = {}, {}, {}, None
    for r in rows:
        currency = currency or r.currency
        e = {"tenancy": r.pname, "tenancy_ocid": r.pid, "region": r.region,
             "service": r.svc or "Unknown", "description": r.sku or "", "cost": float(r.net)}
        formatted.setdefault(r.m, []).append(e)
        totals[e["tenancy"]] = totals.get(e["tenancy"], 0.0) + e["cost"]
        regions[e["region"]] = regions.get(e["region"], 0.0) + e["cost"]
    ms = sorted(formatted)
    warnings = []
    try:
        projects = project_summary(start_m, first_this.strftime("%Y%m"), warnings)
    except Exception as e:  # never break the main view for the project list
        projects, _ = [], warnings.append(f"projects: {type(e).__name__}: {e}"[:300])
    return {"data": [{"month": month_label(m), "entries": formatted[m]} for m in ms],
            "summary": {"tenancies": sorted(totals), "tenancies_without_cost": [],
                        "tenancy_totals": totals, "region_totals": regions,
                        "months": [month_label(m) for m in ms], "total_cost": sum(totals.values()),
                        "currency": currency, "generated_at": now.strftime('%Y-%m-%dT%H:%M:%SZ'),
                        "projects": projects, "warnings": warnings}}


def linked_projects(billing_account, warnings):
    """Every project linked to the billing account (needs roles/billing.viewer); best effort."""
    try:
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
        creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-billing.readonly"])
        sess = AuthorizedSession(creds)
        out, token = [], None
        while True:
            url = f"https://cloudbilling.googleapis.com/v1/billingAccounts/{billing_account}/projects?pageSize=300"
            if token:
                url += f"&pageToken={token}"
            r = sess.get(url, timeout=20)
            if r.status_code != 200:
                warnings.append("Projects with no charges are not listed: the function cannot read the billing "
                                f"account's project list (HTTP {r.status_code}). Grant it Billing Account Viewer to include them.")
                return []
            j = r.json()
            out += [(p.get("projectId", ""), bool(p.get("billingEnabled"))) for p in j.get("projectBillingInfo", [])]
            token = j.get("nextPageToken")
            if not token:
                return out
    except Exception as e:
        warnings.append(f"project list: {type(e).__name__}: {e}"[:300])
        return []


def project_summary(start_m, this_m, warnings):
    """Per project: this month so far, last month, 12-month total, gross and credits."""
    sql = f"""
      SELECT IFNULL(project.id, '') AS pid, ANY_VALUE(project.name) AS pname, invoice.month AS m,
             ANY_VALUE(billing_account_id) AS ba,
             SUM(cost) AS gross, SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS credits
      FROM {export_table()}
      WHERE invoice.month >= @start_m
        AND usage_start_time >= TIMESTAMP_SUB(@start_ts, INTERVAL 7 DAY)
      GROUP BY pid, m"""
    rows = run(sql, [bigquery.ScalarQueryParameter("start_m", "STRING", start_m),
                     bigquery.ScalarQueryParameter("start_ts", "TIMESTAMP",
                                                   datetime.strptime(start_m, "%Y%m").replace(tzinfo=timezone.utc))])
    last_m = (datetime.strptime(this_m, "%Y%m") - timedelta(days=1)).strftime("%Y%m")
    proj, ba = {}, None
    for r in rows:
        ba = ba or r.ba
        key = r.pid or "(billing account)"
        p = proj.setdefault(key, {"id": r.pid, "name": r.pname or ("Tax / account-level" if not r.pid else r.pid),
                                  "mtd": 0.0, "last_month": 0.0, "total_12m": 0.0, "gross_12m": 0.0,
                                  "credits_12m": 0.0, "billing_enabled": None, "months": {}})
        net = float(r.gross or 0) + float(r.credits or 0)
        p["months"][month_label(r.m)] = round(p["months"].get(month_label(r.m), 0.0) + net, 2)
        if r.m == this_m:
            p["mtd"] += net
        else:
            p["total_12m"] += net
            p["gross_12m"] += float(r.gross or 0)
            p["credits_12m"] += float(r.credits or 0)
            if r.m == last_m:
                p["last_month"] += net
    if ba:
        for pid, enabled in linked_projects(ba, warnings):
            p = proj.setdefault(pid, {"id": pid, "name": pid, "mtd": 0.0, "last_month": 0.0, "total_12m": 0.0,
                                      "gross_12m": 0.0, "credits_12m": 0.0, "months": {}})
            p["billing_enabled"] = enabled
    out = []
    for p in proj.values():
        for k in ("mtd", "last_month", "total_12m", "gross_12m", "credits_12m"):
            p[k] = round(p[k], 2)
        if not p["id"] and not (p["mtd"] or p["total_12m"]):
            continue  # account-level row with nothing on it
        out.append(p)
    out.sort(key=lambda p: (-p["total_12m"] - p["mtd"], p["name"].lower()))
    return out


API_NAMES = {"compute": "Compute Engine", "storage": "Cloud Storage", "sqladmin": "Cloud SQL",
             "container": "GKE", "run": "Cloud Run", "cloudfunctions": "Cloud Functions",
             "bigquery": "BigQuery", "pubsub": "Pub/Sub", "redis": "Memorystore",
             "file": "Filestore", "artifactregistry": "Artifact Registry", "logging": "Logging"}
KIND_NAMES = {"instance": "instance", "disk": "persistent disk", "snapshot": "snapshot", "image": "image",
              "address": "IP address", "forwardingRule": "load balancer rule", "cluster": "cluster",
              "bucket": "bucket", "service": "service", "repository": "repository"}


def resource_type(global_name, svc):
    """//compute.googleapis.com/projects/p/zones/z/instances/123 -> 'Compute Engine instance'."""
    if not global_name.startswith("//"):
        return svc or "Other"
    parts = global_name[2:].split("/")
    api = parts[0].split(".")[0]
    if api == "storage" and len(parts) <= 3:
        return "Cloud Storage bucket"
    kind = parts[-2] if len(parts) >= 3 else ""
    kind = kind[:-1] if kind.endswith("s") else kind
    return f"{API_NAMES.get(api, api.title())} {KIND_NAMES.get(kind, kind)}".strip()


def inventory(period):
    now = datetime.now(timezone.utc)
    first_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if period == "mtd":
        start, end = first_this, (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        end = first_this
        start = (first_this - timedelta(days=1)).replace(day=1)
    cost_sql = f"""
      SELECT IFNULL(project.id, '') AS pid, IFNULL(project.name, '(billing account)') AS pname,
             IFNULL(resource.global_name, IFNULL(resource.name, '')) AS rid,
             ANY_VALUE(resource.name) AS rname,
             IFNULL(location.region, IFNULL(location.location, 'global')) AS region,
             service.description AS svc, sku.description AS sku, SUM({NET}) AS net
      FROM {export_table()}
      WHERE usage_start_time >= @start AND usage_start_time < @end
      GROUP BY pid, pname, rid, region, svc, sku"""
    owner_sql = f"""
      SELECT IFNULL(project.id, '') AS pid, IFNULL(resource.global_name, IFNULL(resource.name, '')) AS rid,
             ANY_VALUE(l.value) AS owner
      FROM {export_table()}, UNNEST(labels) l
      WHERE usage_start_time >= @start AND usage_start_time < @end AND LOWER(l.key) IN UNNEST(@owner_keys)
      GROUP BY pid, rid"""
    params = [bigquery.ScalarQueryParameter("start", "TIMESTAMP", start),
              bigquery.ScalarQueryParameter("end", "TIMESTAMP", end)]
    warnings = []
    rows = run(cost_sql, params)
    owners = {}
    try:
        for r in run(owner_sql, params + [bigquery.ArrayQueryParameter("owner_keys", "STRING", list(OWNER_LABELS))]):
            owners[(r.pid, r.rid)] = r.owner
    except Exception as e:  # owner labels are optional
        warnings.append(f"owner labels: {e}"[:300])

    res = {}
    for r in rows:
        key = (r.pid, r.rid)
        x = res.setdefault(key, {"tenancy": r.pname, "tenancy_ocid": r.pid, "region": r.region,
                                 "resource_id": r.rid or "(no resource ID)", "name": r.rname or "",
                                 "services": {}, "skus": {}, "compartment": r.pid,
                                 "owner": owners.get(key, ""), "cost": 0.0})
        c = float(r.net)
        x["cost"] += c
        x["services"][r.svc] = x["services"].get(r.svc, 0.0) + c
        x["skus"][r.sku] = x["skus"].get(r.sku, 0.0) + c
        if x["region"] == "global" and r.region != "global":
            x["region"] = r.region
    resources = []
    for (pid, rid), x in res.items():
        if x["cost"] < 0.005:
            continue
        svc = max(x["services"].items(), key=lambda kv: kv[1])[0] if x["services"] else ""
        x["service"] = svc
        x["resource_type"] = resource_type(rid, svc)
        if not rid:
            x["resource_type"] = f"{svc} (not tied to a resource)"
        x["services"] = {k: round(v, 2) for k, v in sorted(x["services"].items(), key=lambda kv: -kv[1])}
        x["skus"] = [k for k, _ in sorted(x["skus"].items(), key=lambda kv: -kv[1])[:4]]
        x["cost"] = round(x["cost"], 2)
        resources.append(x)
    resources.sort(key=lambda x: -x["cost"])

    def total_by(field):
        out = {}
        for x in resources:
            o = out.setdefault(x[field], {"count": 0, "cost": 0.0})
            o["count"] += 1
            o["cost"] += x["cost"]
        return {k: {"count": v["count"], "cost": round(v["cost"], 2)}
                for k, v in sorted(out.items(), key=lambda kv: -kv[1]["cost"])}

    return {"mode": "inventory", "period": period,
            "period_start": start.strftime('%Y-%m-%d'), "period_end": end.strftime('%Y-%m-%d'),
            "generated_at": now.strftime('%Y-%m-%dT%H:%M:%SZ'), "resources": resources,
            "summary": {"count": len(resources), "total_cost": round(sum(x["cost"] for x in resources), 2),
                        "by_tenancy": total_by("tenancy"), "by_service": total_by("service"),
                        "owners_found": sum(1 for x in resources if x["owner"])},
            "warnings": warnings}


def audit_creators(project_ids, since, warnings):
    """{(project, short resource path): (principal, timestamp)} from Admin Activity audit logs.
    Needs roles/logging.viewer on the projects; best effort."""
    try:
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
        creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/logging.read"])
        sess = AuthorizedSession(creds)
    except Exception as e:
        warnings.append(f"audit logs: {type(e).__name__}: {e}"[:300])
        return []
    found, denied = [], []
    for pid in project_ids:
        flt = (f'logName="projects/{pid}/logs/cloudaudit.googleapis.com%2Factivity" '
               f'AND timestamp>="{since.strftime("%Y-%m-%dT%H:%M:%SZ")}" AND '
               '(protoPayload.methodName:"insert" OR protoPayload.methodName:"create" '
               'OR protoPayload.methodName:"Create")')
        token, pages = None, 0
        while pages < 5:
            body = {"resourceNames": [f"projects/{pid}"], "filter": flt, "orderBy": "timestamp asc", "pageSize": 1000}
            if token:
                body["pageToken"] = token
            r = sess.post("https://logging.googleapis.com/v2/entries:list", json=body, timeout=30)
            if r.status_code != 200:
                if r.status_code in (401, 403):
                    denied.append(pid)
                else:
                    warnings.append(f"audit logs {pid}: HTTP {r.status_code}"[:200])
                break
            j = r.json()
            for e in j.get("entries", []):
                pp = e.get("protoPayload", {}) or {}
                if (pp.get("status") or {}).get("code"):
                    continue  # failed call
                who = (pp.get("authenticationInfo") or {}).get("principalEmail", "")
                found.append((pid, pp.get("resourceName", ""), who, e.get("timestamp", "")))
            token, pages = j.get("nextPageToken"), pages + 1
            if not token:
                break
    if denied:
        warnings.append("creator needs Logs Viewer on: " + ", ".join(denied)
                        + " (grant roles/logging.viewer to the function's service account)")
    return found


def recent(days):
    """Resources first billed in the last `days` days, with a monthly run-rate, labels and creator."""
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    since = today - timedelta(days=days)
    warnings = []
    T = export_table()
    p_since = bigquery.ScalarQueryParameter("since", "TIMESTAMP", since)
    rows = run(f"""
      SELECT IFNULL(project.id, '') AS pid, ANY_VALUE(project.name) AS pname,
             resource.global_name AS gn, ANY_VALUE(resource.name) AS rname,
             ANY_VALUE(IFNULL(location.region, IFNULL(location.location, 'global'))) AS region,
             MIN(usage_start_time) AS first_seen,
             ARRAY_AGG(DISTINCT service.description IGNORE NULLS LIMIT 3) AS svcs,
             ARRAY_AGG(DISTINCT sku.description IGNORE NULLS LIMIT 4) AS skus
      FROM {T}
      WHERE usage_start_time >= TIMESTAMP_SUB(@since, INTERVAL 45 DAY) AND resource.global_name IS NOT NULL
      GROUP BY pid, gn
      HAVING first_seen >= @since""", [p_since])
    if not rows:
        return {"mode": "recent", "days": days, "since": since.strftime('%Y-%m-%dT%H:%M:%SZ'),
                "generated_at": now.strftime('%Y-%m-%dT%H:%M:%SZ'), "resources": [],
                "summary": {"count": 0, "est_monthly_usd": 0, "creators_found": 0, "by_tenancy": {}},
                "warnings": warnings}
    gns = [r.gn for r in rows]
    p_gns = bigquery.ArrayQueryParameter("gns", "STRING", gns)
    daily = {}
    for r in run(f"""
      SELECT resource.global_name AS gn, FORMAT_DATE('%Y-%m-%d', DATE(usage_start_time)) AS d,
             SUM({NET}) AS net, ANY_VALUE(currency) AS currency
      FROM {T} WHERE usage_start_time >= @since AND resource.global_name IN UNNEST(@gns)
      GROUP BY gn, d""", [p_since, p_gns]):
        daily.setdefault(r.gn, {})[r.d] = float(r.net or 0)
        currency = r.currency
    labels = {}
    try:
        for r in run(f"""
          SELECT resource.global_name AS gn, l.key AS k, ANY_VALUE(l.value) AS v
          FROM {T}, UNNEST(labels) l
          WHERE usage_start_time >= @since AND resource.global_name IN UNNEST(@gns)
          GROUP BY gn, k""", [p_since, p_gns]):
            labels.setdefault(r.gn, {})[r.k] = r.v
    except Exception as e:
        warnings.append(f"labels: {type(e).__name__}: {e}"[:300])

    audits = audit_creators(sorted({r.pid for r in rows if r.pid}), since - timedelta(days=1), warnings)
    today_s = today.strftime('%Y-%m-%d')
    active_since = (today - timedelta(days=2)).strftime('%Y-%m-%d')   # export lags up to a day
    out = []
    for r in rows:
        days_cost = daily.get(r.gn, {})
        ds = sorted(days_cost)
        last_day = ds[-1] if ds else ""
        full = [d for d in ds[1:] if d < today_s]
        if last_day and last_day < active_since:
            per_day, status = 0.0, "ended"
            basis = f"no charges since {last_day} - deleted or stopped"
        elif full:
            per_day, status = sum(days_cost[d] for d in full) / len(full), "active"
            basis = f"avg of {len(full)} full day{'s' if len(full) != 1 else ''} x 30.4"
        else:
            per_day, status = (max(days_cost.values()) if days_cost else 0.0), "active"
            basis = "first (partial) day x 30.4 - will firm up after a full day"
        lab = labels.get(r.gn, {})
        owner = next((lab[k] for k in lab if k.lower() in OWNER_LABELS), "")
        created, who, src = r.first_seen.strftime('%Y-%m-%dT%H:%M:%SZ'), "", ""
        short = (r.rname or r.gn.rsplit("/", 1)[-1])
        for pid, rn, principal, ts in audits:
            if pid == r.pid and short and (rn.endswith("/" + short) or rn == short):
                who, src = principal, "audit log"
                created = ts[:19] + "Z" if ts else created
                break
        if not who and owner:
            who, src = owner, "label"
        svc = (r.svcs or ["Other"])[0]
        out.append({
            "tenancy": r.pname or r.pid or "(billing account)", "tenancy_ocid": r.pid, "region": r.region,
            "compartment": r.pid, "resource_id": r.gn, "name": r.rname or "",
            "resource_type": resource_type(r.gn, svc), "service": svc, "skus": list(r.skus or []),
            "created": created, "created_source": "audit log" if src == "audit log" else "first billed",
            "created_by": who, "created_by_source": src, "tags": lab,
            "cost_so_far": round(sum(days_cost.values()), 2),
            "est_monthly_usd": round(per_day * 30.4, 2), "price_basis": basis,
            "status": status, "last_billed": last_day})
    out.sort(key=lambda x: x["created"], reverse=True)
    by_project = {}
    for x in out:
        t = by_project.setdefault(x["tenancy"], {"count": 0, "cost": 0.0})
        t["count"] += 1
        t["cost"] += x["est_monthly_usd"]
    return {"mode": "recent", "days": days, "since": since.strftime('%Y-%m-%dT%H:%M:%SZ'),
            "generated_at": now.strftime('%Y-%m-%dT%H:%M:%SZ'), "resources": out,
            "summary": {"count": len(out), "est_monthly_usd": round(sum(x["est_monthly_usd"] for x in out), 2),
                        "creators_found": sum(1 for x in out if x["created_by"]),
                        "by_tenancy": {k: {"count": v["count"], "cost": round(v["cost"], 2)}
                                       for k, v in sorted(by_project.items(), key=lambda kv: -kv[1]["cost"])}},
            "note": "Resources first billed in the window (BigQuery billing export). Monthly estimate = "
                    "average daily net cost so far x 30.4, in the billing account's currency.",
            "warnings": warnings}


@functions_framework.http
def handler(request):
    cors = {"Access-Control-Allow-Origin": ALLOWED_ORIGIN, "Vary": "Origin",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "3600"}
    if request.method == "OPTIONS":
        return ("", 204, cors)
    headers = dict(cors, **{"Content-Type": "application/json"})
    try:
        body = request.get_json(silent=True) or {}
        if body.get("mode") == "recent":
            out = recent(max(1, min(int(body.get("days") or 14), 31)))
        elif body.get("mode") == "inventory":
            out = inventory("mtd" if body.get("period") == "mtd" else "last_month")
        else:
            out = billing()
        return (json.dumps(out), 200, headers)
    except Exception as e:
        return (json.dumps({"error": f"{type(e).__name__}: {e}"}), 500, headers)
