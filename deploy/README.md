# Deploying SMART-TB on a server

Ubuntu 24.04 server running the Next.js app behind Caddy, with MongoDB 8.0 on the same server (listening on
`127.0.0.1` only, as a single-node replica set, with login switched on).

All commands run as `root` on the server unless noted. Use only letters and digits in passwords and keys in
`/opt/smarttb/.env`: the file is read by both systemd and bash. The MongoDB addresses are kept in a second file,
`/opt/smarttb/.env.mongo`, because they contain `&`: that file is read by systemd and by the scripts, and must never be
loaded with `source`.

The day-to-day guide for the people who run the server is `deploy/OPERATIONS.md`.

## 1. Prepare the server (once)

From this PC, copy the deploy folder and run the setup scripts:

```bash
scp -r deploy root@<server-ip>:/root/
ssh root@<server-ip>
bash /root/deploy/server-setup.sh     # updates, Node.js, Caddy, firewall, fail2ban, services, backup timer
bash /root/deploy/mongo-setup.sh      # MongoDB 8.0 (package source, held version, replica set, key file)
```

`server-setup.sh` prints a **deploy key**. Add that key to GitHub (repo → Settings → Deploy keys, read-only), or
use the git bundle method in `OPERATIONS.md` section 5.

`mongo-setup.sh` installs MongoDB from MongoDB's own package source and holds the version, so a routine update
never changes the database by itself. On servers running Linux 6.19 or newer it adds a small service override
that MongoDB 8.0 needs there (see the comments in the script).

## 2. Fill in `/opt/smarttb/.env`

Start from the copy the setup script placed there (`deploy/env.production.example`). Generate secrets with
`openssl rand -base64 48 | tr -dc 'A-Za-z0-9'`. Store `CONTACT_ENC_KEY` and `BACKUP_PASSPHRASE` offline as well.

| Phase | COOKIE_SECURE | ALLOW_TEST_LOGIN | NEXT_PUBLIC_CRF_PREVIEW | Caddyfile |
|---|---|---|---|---|
| Team testing (IP, dummy data) | `false` | `true` | `true` | `Caddyfile.ip` |
| Production (domain, real data) | `true` | `false` | `false` | `Caddyfile` |

## 3. First install

```bash
bash /root/deploy/deploy.sh          # fetches, builds, starts. It says the database logins are not set up yet: expected.
bash /opt/smarttb/app/deploy/mongo-init.sh   # replica set, logins (written to /opt/smarttb/.env.mongo), login switched on
bash /opt/smarttb/app/deploy/deploy.sh       # applies the collections and indexes and starts the app for real
```

Then check the database and create the first administrator (prints a one-time setup link):

```bash
cd /opt/smarttb/app
sudo -u smarttb bash -c 'export SMARTTB_ENV_FILES=/opt/smarttb/.env,/opt/smarttb/.env.mongo; npm run db:preflight'
sudo -u smarttb bash -c 'export SMARTTB_ENV_FILES=/opt/smarttb/.env,/opt/smarttb/.env.mongo; npm run db:create-admin -- --email <email> --name "<full name>" --role pi'
```

For team testing with dummy data instead of an administrator, run `npm run db:reset` the same way (it refuses to run
unless the database is on the same computer, and it empties the database first).

`db:preflight` must show **All checks passed** before real data goes on a database. It checks that MongoDB is a
replica set with a primary, that login is required, that all collections and indexes exist, that the app's login can
only add to the audit trail and cannot delete participants or create collections, that transactions roll back, and
that contact details encrypt and decrypt.

## 4. Updates

```bash
bash /opt/smarttb/app/deploy/deploy.sh            # latest main
bash /opt/smarttb/app/deploy/deploy.sh <commit>   # a specific version (also how to roll back)
```

A deploy applies the collections and indexes (`npm run db:migrate`, safe to repeat) and restarts the app.

## 5. Domain and HTTPS

1. At the registrar or institute IT: A record `smarttb.<domain>` → the server's reserved IP.
2. Edit `deploy/Caddyfile` with the real domain, copy to `/etc/caddy/Caddyfile`, `systemctl reload caddy`.
3. Set `COOKIE_SECURE=true` in `/opt/smarttb/.env`, `systemctl restart smarttb`.

## 6. Backups

```bash
systemctl enable --now smarttb-backup.timer   # every hour, after .env backup settings are filled in
systemctl start smarttb-backup                # run one now
journalctl -u smarttb-backup -n 20            # check
```

Each backup is one encrypted file holding every collection from the same moment. The script decrypts and tests the file
before it keeps it, so a damaged backup is reported when it is made. Restore a copy (into the live database, replacing
what is there):

```bash
cd /opt/smarttb/app
export SMARTTB_ENV_FILES=/opt/smarttb/.env,/opt/smarttb/.env.mongo
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in <file>.dump.enc \
  | npm run --silent db:restore -- --replace
```

Test a restore once a month into a scratch database (`OPERATIONS.md` section 6).

## Before the first real participant

- [ ] `ALLOW_TEST_LOGIN=false`, `NEXT_PUBLIC_CRF_PREVIEW=false`, redeployed
- [ ] Domain + HTTPS working, `COOKIE_SECURE=true`
- [ ] `db:preflight` all passed, demo accounts absent
- [ ] Backup timer enabled, one restore tested
- [ ] `CONTACT_ENC_KEY` and `BACKUP_PASSPHRASE` stored offline
- [ ] Two-step sign-in for staff (to be added in the app)
