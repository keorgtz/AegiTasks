#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
if [ -e .env ]; then printf '%s\n' '.env already exists; it was not changed.'; exit 0; fi
printf 'Administrator email: '
read -r admin_email
case "$admin_email" in *'@'*'.'*) ;; *) printf '%s\n' 'Enter a valid email.'; exit 1;; esac
case "$admin_email" in *[!a-zA-Z0-9@._+-]*) printf '%s\n' 'Use a plain email address.'; exit 1;; esac
umask 077
db_password=$(openssl rand -hex 32)
admin_password=$(openssl rand -hex 20)
printf 'POSTGRES_PASSWORD=%s\nSEED_ADMIN_EMAIL=%s\nSEED_ADMIN_PASSWORD=%s\n' "$db_password" "$admin_email" "$admin_password" > .env
printf '%s\n' 'Created .env. Read SEED_ADMIN_PASSWORD locally to sign in, then change it in Settings.'
