#!/bin/sh
set -e

# Start SMTP relay in background before Twenty boots
node /app/smtp-relay.js &

# Hand off to the original Twenty entrypoint (handles DB migrations, cron registration)
exec /app/entrypoint.sh "$@"
