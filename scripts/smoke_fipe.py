from __future__ import annotations

import json
import sys
from urllib.parse import urlencode

import requests

BASE = "https://carpivara.casadf.com.br"
s = requests.Session()
s.headers.update({"User-Agent": "carpivara-post-deploy-smoke/1.0"})


def get(path: str, **kwargs):
    url = BASE + path
    response = s.get(url, timeout=30, **kwargs)
    print(f"GET {path} -> {response.status_code}")
    if response.status_code >= 400:
        print(response.text[:1000])
        raise SystemExit(1)
    return response


def post(path: str, payload: dict):
    url = BASE + path
    response = s.post(url, json=payload, timeout=45)
    print(f"POST {path} -> {response.status_code}")
    if response.status_code >= 400:
        print(response.text[:1000])
        raise SystemExit(1)
    return response


health = get("/health")
health_json = health.json()
assert health_json.get("ok") is True, health_json

status = get("/api/fipe/status").json()
assert status.get("enabled") is True, status
assert status.get("pdfEnabled") is True, status

references = get("/api/fipe/references").json()
assert references.get("references"), references
reference = references["references"][0]
reference_code = str(reference.get("code") or reference.get("value") or "")
assert reference_code, reference

query = urlencode({"vehicleType": "cars", "reference": reference_code})
brands = get(f"/api/fipe/brands?{query}").json()
brand = brands["brands"][0]
brand_code = str(brand.get("code") or brand.get("value") or "")
assert brand_code, brand

query = urlencode({"vehicleType": "cars", "brandCode": brand_code, "reference": reference_code})
models = get(f"/api/fipe/models?{query}").json()
model = models["models"][0]
model_code = str(model.get("code") or model.get("value") or "")
assert model_code, model

query = urlencode({"vehicleType": "cars", "brandCode": brand_code, "modelCode": model_code, "reference": reference_code})
years = get(f"/api/fipe/years?{query}").json()
year = years["years"][0]
year_code = str(year.get("code") or year.get("value") or "")
assert year_code, year

quote = post(
    "/api/fipe/quote",
    {
        "vehicleType": "cars",
        "brand": {"code": brand_code, "name": str(brand.get("name") or brand.get("text") or "")},
        "model": {"code": model_code, "name": str(model.get("name") or model.get("text") or "")},
        "year": {"code": year_code, "name": str(year.get("name") or year.get("text") or "")},
    },
).json()
assert quote.get("documentCode"), quote
assert quote.get("reportHash"), quote

offers = get("/api/fipe/offers").json()
assert offers.get("offers"), offers

report_code = quote["documentCode"]
validated = get(f"/api/validar-relatorio/{report_code}").json()
assert validated.get("authentic") is True, validated
assert validated.get("status") == "VALID", validated

printed = get(f"/api/fipe/reports/{report_code}/print")
assert "text/html" in printed.headers.get("content-type", ""), printed.headers

pdf = get(f"/api/fipe/reports/{report_code}/pdf")
assert pdf.headers.get("content-type", "").startswith("application/pdf"), pdf.headers
assert pdf.content[:4] == b"%PDF", pdf.content[:12]

print(json.dumps({
    "health": health_json,
    "provider": status,
    "reference": reference,
    "brand": brand,
    "model": model,
    "year": year,
    "quote": {
        "documentCode": quote.get("documentCode"),
        "provider": quote.get("provider"),
        "referenceMonth": quote.get("referenceMonth"),
        "value": quote.get("value"),
    },
    "offerCount": len(offers["offers"]),
    "reportValidation": validated,
    "printContentType": printed.headers.get("content-type"),
    "pdfContentType": pdf.headers.get("content-type"),
}, ensure_ascii=False, indent=2))
