#!/usr/bin/env bash
# ponytail: dev-only seed. Registers an owner, marks email verified in Mongo
# (bypasses the email link, which only prints to the server console), logs in.
# Needs the API running on :8080 and local mongosh. Never run against prod.
set -euo pipefail

EMAIL="${1:-dev@local.test}"
PASS="${2:-LocalDevPass123}"
API="${API:-http://localhost:8080/api/v1}"
DB="${MONGO_DB:-mongodb://localhost:27017/rigledger}"

curl -s -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"first_name\":\"Dev\",\"last_name\":\"Owner\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" >/dev/null || true

mongosh "$DB" --quiet --eval \
  "db.users.updateOne({email:'$EMAIL'},{\$set:{email_verified:true}})" >/dev/null

curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -c /tmp/rl_cookies.txt \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"
echo
echo "login: $EMAIL / $PASS  (cookies -> /tmp/rl_cookies.txt)"
