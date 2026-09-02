#!/usr/bin/env bash
set -euo pipefail

# Deploy lidar-viewer to the app VM (192.0.2.104)
# Run from the Mac: ./deploy.sh
#
# Prerequisites:
#   1. Authentik: create OAuth2 provider + app "capture-viewer"
#      - Provider type: OAuth2/OIDC
#      - Client type: Public (PKCE)
#      - Redirect URI: https://capture.example.com/auth/callback
#      - Scopes: openid, profile, email, groups (add the groups scope mapping)
#      - Signing key: RS256
#   2. Pangolin: create resource "capture-viewer"
#      - Subdomain: capture
#      - Domain: example.com
#      - Target: 192.0.2.104:3600
#      - SSO gate: OFF (app does its own OIDC)
#   3. .env on the app VM at /srv/lidar-viewer/.env (copy from .env.example, fill in values)

APP_VM="user@192.0.2.104"
DEPLOY_DIR="/srv/lidar-viewer"

echo "==> Syncing to app VM..."
ssh -J user@gateway.example.com:2201 "$APP_VM" "mkdir -p $DEPLOY_DIR"

rsync -avz --exclude='data/' --exclude='.env' --exclude='__pycache__' \
    -e "ssh -J user@gateway.example.com:2201" \
    ./ "$APP_VM:$DEPLOY_DIR/"

echo "==> Building and starting..."
ssh -J user@gateway.example.com:2201 "$APP_VM" \
    "cd $DEPLOY_DIR && docker compose up -d --build"

echo "==> Done. Verify at https://capture.example.com"
