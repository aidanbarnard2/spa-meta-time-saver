"""One-off test: can GitHub's servers read each dealer site's vehicle pages?"""
import re, sys, time, urllib.request

URLS = [l.strip() for l in open(sys.argv[1]) if l.strip()]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
print("| site | status | bytes | looks like |\n|---|---|---|---|")
for u in URLS:
    host = re.sub(r"^https?://(www\.)?", "", u).split("/")[0]
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9"})
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read().decode("utf-8", "replace"); code = r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace") if e.fp else ""; code = e.code
    except Exception as e:
        print(f"| {host} | ERR | 0 | {type(e).__name__} |"); continue
    kind = "bot wall" if re.search(r"akamai|incapsula|imperva|cf-chl|captcha|challenge-platform|px-captcha|Access Denied", body, re.I) and len(body) < 20000 else \
           "vehicle data" if re.search(r'"@type"\s*:\s*"(Vehicle|Car|Product)"|vehicleIdentificationNumber|"vin"\s*:', body, re.I) else \
           "page, no vehicle data" if len(body) > 20000 else "small page"
    print(f"| {host} | {code} | {len(body)} | {kind} |")
    time.sleep(1.5)
