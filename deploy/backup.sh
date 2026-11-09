#!/bin/sh
# Copia de seguridad de Postgres: una al arrancar y luego cada 24 h. Se borran las de más de KEEP_DAYS
# días. Para restaurar una: ver «Copias de seguridad» en el README.
set -eu
while true; do
  file="/backups/pixels-$(date -u +%Y%m%d-%H%M%S).sql.gz"
  if pg_dump --no-owner | gzip > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "Copia hecha: $file"
  else
    rm -f "$file.tmp"
    echo "ERROR: no se pudo hacer la copia" >&2
  fi
  find /backups -name 'pixels-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
  sleep 86400
done
