# Deploying SMART-TB on E2E

Ubuntu 24.04 app server (E2E C3.8GB node, Delhi NCR) running the Next.js app behind Caddy, plus either a
managed PostgreSQL (production) or PostgreSQL on the same server (team testing with dummy data).

All commands run as `root` on the server unless noted. Use only letters and digits in passwords and keys in
`/opt/smarttb/.env` — the file is read by both systemd and bash.

## 1. Prepare the server (once)

From this PC, copy the deploy folder and run the setup script:

```bash
scp -r deploy root@<server-ip>:/root/
ssh root@<server-ip>
bash /root/deploy/server-setup.sh --with-local-db   # team testing
bash /root/deploy/server-setup.sh                   # production with managed DBaaS
```

It installs updates, Node.js 22, Caddy, the firewall (SSH/80/443 only), fail2ban, automatic security updates,
the `smarttb` service and the backup timer, and prints a **deploy key**. Add that key to GitHub
(repo → Settings → Deploy keys, read-only).

## 2. Fill in `/opt/smarttb/.env`

Start from the copy the setup script placed there (`deploy/env.production.example`). Generate secrets with
`openssl rand -base64 48 | tr -dc 'A-Za-z0-9'`. Store `CONTACT_ENC_KEY` and `BACKUP_PASSPHRASE` offline as well.

| Phase | Database URLs | COOKIE_SECURE | ALLOW_TEST_LOGIN | NEXT_PUBLIC_CRF_PREVIEW | Caddyfile |
|---|---|---|---|---|---|
| Team testing (IP, dummy data) | `localhost` | `false` | `true` | `true` | `Caddyfile.ip` |
| Production (domain, real data) | E2E DBaaS + `DATABASE_SSL_CA` | `true` | `false` | `false` | `Caddyfile` |

Local test database only — give the `postgres` user the password used in `PG_ADMIN_URL`:

```bash
sudo -u postgres psql -c "alter user postgres password '<password>'"
```

Managed DBaaS only — enable SSL on the DBaaS page, download the CA certificate to `/opt/smarttb/dbaas-ca.pem`,
and whitelist the app server's private IP.

## 3. First install

```bash
bash /root/deploy/deploy.sh                       # clones, builds, migrates, starts (migrate may fail before step 4; that is fine)
cd /opt/smarttb/app
sudo -u smarttb bash -c 'set -a; source /opt/smarttb/.env; set +a; npm run db:setup && npm run db:preflight'
```

Then, depending on the phase:

```bash
# Team testing: dummy accounts and participants
sudo -u smarttb bash -c 'set -a; source /opt/smarttb/.env; set +a; npm run db:reset'

# Production: schema only, then the first administrator (prints a one-time setup link)
sudo -u smarttb bash -c 'set -a; source /opt/smarttb/.env; set +a; npm run db:migrate && npm run db:create-admin -- --email <email> --name "<full name>" --role pi'
```

`db:preflight` must show **All checks passed** before real data goes on a database (pgcrypto, SSL, triggers,
restricted role).

## 4. Updates

```bash
bash /opt/smarttb/app/deploy/deploy.sh            # latest main
bash /opt/smarttb/app/deploy/deploy.sh <commit>   # a specific version (also how to roll back)
```

## 5. Domain and HTTPS

1. At the registrar or institute IT: A record `smarttb.<domain>` → the server's reserved IP.
2. Edit `deploy/Caddyfile` with the real domain, copy to `/etc/caddy/Caddyfile`, `systemctl reload caddy`.
3. Set `COOKIE_SECURE=true` in `/opt/smarttb/.env`, `systemctl restart smarttb`.

## 6. Backups

```bash
systemctl enable --now smarttb-backup.timer   # every 6 hours, after .env backup settings are filled in
systemctl start smarttb-backup                # run one now
journalctl -u smarttb-backup -n 20            # check
```

Restore a copy (into an empty database):

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in <file>.dump.enc \
  | pg_restore --no-owner --dbname="$DATABASE_OWNER_URL"
```

Test a restore once a month into a scratch database.

## Before the first real participant

- [ ] `ALLOW_TEST_LOGIN=false`, `NEXT_PUBLIC_CRF_PREVIEW=false`, redeployed
- [ ] Domain + HTTPS working, `COOKIE_SECURE=true`
- [ ] Managed DBaaS, `db:preflight` all passed, demo accounts absent
- [ ] Backup timer enabled, one restore tested
- [ ] `CONTACT_ENC_KEY` and `BACKUP_PASSPHRASE` stored offline
- [ ] Two-step sign-in for staff (to be added in the app)
