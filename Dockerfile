FROM twentycrm/twenty:latest

COPY smtp-relay.js /app/smtp-relay.js
COPY entrypoint.sh /custom-entrypoint.sh
RUN chmod +x /custom-entrypoint.sh

ENTRYPOINT ["/custom-entrypoint.sh"]
CMD ["node", "dist/main"]
