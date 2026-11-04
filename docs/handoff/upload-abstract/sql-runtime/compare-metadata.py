"""Compare read-only metadata exports, never connect to a database or read rows."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--production-schema", type=Path, required=True)
parser.add_argument("--local-schema", type=Path, required=True)
parser.add_argument("--production-security", type=Path, required=True)
parser.add_argument("--local-security", type=Path, required=True)
args = parser.parse_args()

def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def canonical_set(items):
    return {json.dumps(item, sort_keys=True) for item in items}

prod, local = read(args.production_schema), read(args.local_schema)
bad = False
for key in ("columns", "constraints", "indexes", "policies", "grants", "roles", "functions"):
    a, b = canonical_set(prod[key]), canonical_set(local[key])
    print(f"schema {key}: production-only={len(a-b)} local-only={len(b-a)}")
    bad |= a != b
prod, local = read(args.production_security), read(args.local_security)
for key in ("tables", "triggers", "auth_functions", "seed_objects"):
    equal = prod[key] == local[key]
    print(f"security {key}: {'match' if equal else 'DIFFERENT'}")
    bad |= not equal
if bad:
    raise SystemExit(1)
print("Exported metadata categories match. Postgres platform and unexported Auth internals remain separate.")
