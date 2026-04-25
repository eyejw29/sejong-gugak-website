#!/bin/bash
# 공개 사이트를 Cloudflare Pages에 배포 (v2.7 일원화 완료까지 임시 사용)
#
# 사용법:
#   cd 배포/
#   ./deploy-cf.sh
#
# Cloudflare 대시보드에서 Git 연결을 마치면 이 스크립트는 더 이상 필요없음.

set -e
cd "$(dirname "$0")"
echo "=== Cloudflare Pages 배포 시작 ==="
npx wrangler pages deploy . --project-name sejong-gugak-website --branch main --commit-dirty=true
echo ""
echo "✅ 배포 완료. 1~2분 내 https://sejong-gugak-website.pages.dev 에 반영됩니다."
