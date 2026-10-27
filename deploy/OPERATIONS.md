# SMART-TB server: operations guide

Everything here works from this file alone. No internet search is needed. Print it or keep a copy on the desktop.
Every command was tried on this server. Lines starting with `#` inside a code block are comments, not commands.

## 1. Where things are

- Server: Ubuntu 24.04, public IP 135.235.138.35, hosted by the institute (Azure VM named acip-vm-acaiproject)
- Login user: azureuser (has sudo). Login is by key file only; passwords are switched off.
- Key file: acip-vm-acaiproject_key.pem (laptop: D:\ServerKey\, desktop: C:\SMART-TB\). Never email it.
- SSH is allowed only from the two whitelisted public IPs (laptop and desktop). The website is open to everyone on ports 80 and 443.
- App code: /opt/smarttb/app (owned by user smarttb)
- Settings and secrets: /opt/smarttb/.env (readable by root and smarttb only)
- Backups: /opt/smarttb/backups (hourly, encrypted, newest 72 kept)
- Database: PostgreSQL 16 on the same server, listening on 127.0.0.1 only, database name smarttb
- Services: smarttb (the app, port 3000), caddy (web front door, ports 80/443), postgresql, fail2ban
- Backup copy on the desktop: C:\SMART-TB-Backups (downloaded every hour by Task Scheduler)

Fill in before going live:
- Institute IT contact: ______________________   Phone: ______________
- PI: ______________________   Phone: ______________
- Offline copy of CONTACT_ENC_KEY and BACKUP_PASSPHRASE is kept by: ______________________

## 2. Connect to the server

On the laptop or desktop, in PowerShell:

    ssh -i "D:\ServerKey\acip-vm-acaiproject_key.pem" azureuser@135.235.138.35

On the desktop the key path is C:\SMART-TB\acip-vm-acaiproject_key.pem. Type `exit` to leave.

If the connection hangs or times out:
1. Find your public IP: open https://api.ipify.org in a browser. The laptop and desktop normally show 202.12.103.67 and 202.12.103.85.
2. If the number is different, the campus address has changed or you are on another network. Send the new number to institute IT and ask them to allow it for SSH (port 22).
3. If the number is the same, ask IT whether the server is running and whether the network rules were changed.

If it says "Permission denied (publickey)": wrong user name or the wrong key file.
If it says "UNPROTECTED PRIVATE KEY FILE": run
`icacls "<path to key>" /inheritance:r /grant:r "$($env:USERNAME):R"`

## 3. Ten-second health check

After connecting, run:

    systemctl is-active smarttb caddy postgresql fail2ban
    curl -s http://127.0.0.1:3000/api/health
    df -h / | tail -1
    systemctl list-timers smarttb-backup.timer --no-pager | head -3
    sudo ls -lt /opt/smarttb/backups | head -3

Good result:
- four lines saying `active`
- `{"ok":true}`
- disk use well under 80%
- a backup timer with a next run within the hour
- the newest backup file less than an hour or two old

## 4. Something is wrong: find the cause

### The website does not open at all
1. Is the server reachable? Section 2.
2. `systemctl is-active caddy`. If not active: `sudo systemctl restart caddy`, then `journalctl -u caddy -n 50 --no-pager`.
3. `sudo ufw status`: ports 80, 443 and OpenSSH must say ALLOW.
4. If everything on the server looks fine, ask IT whether ports 80 and 443 are still open to the public in the network rules.

### The page shows "502 Bad Gateway" or an error page
The app has stopped. Caddy is fine.

    sudo systemctl restart smarttb
    sleep 5
    curl -s http://127.0.0.1:3000/api/health
    journalctl -u smarttb -n 100 --no-pager

Read the last lines of the log. Common causes: the database is down (see below), the disk is full, or a bad change in /opt/smarttb/.env.

### The login page loads but nobody can sign in
1. `curl -s http://127.0.0.1:3000/api/health`. If it does not say ok, the database is probably down.
2. `systemctl is-active postgresql`. If not active: `sudo systemctl restart postgresql`, then restart the app (`sudo systemctl restart smarttb`).
3. One person only: after 5 wrong passwords an account is locked for about 5 minutes. Wait, then try again.
4. Everyone is signed out suddenly: sessions end after 15 minutes of inactivity or after 12 hours. This is normal.
5. Forgotten password: an administrator uses Staff accounts, then the person, then Reset password. It gives a one-time link.
6. No administrator can sign in at all: create a new one (the email must not already exist):

        cd /opt/smarttb/app
        sudo -u smarttb -H bash -c 'set -a; source /opt/smarttb/.env; set +a; npm run db:create-admin -- --email NEW@ADDRESS --name "Full Name" --role pi'

   It prints a one-time setup link. Send it privately.

### The database will not start
    sudo systemctl status postgresql --no-pager
    sudo journalctl -u postgresql -n 50 --no-pager
    df -h /

A full disk is the most common cause (section 4, "Disk is nearly full"). If the data itself is damaged, restore from a backup (section 6).

### Disk is nearly full
    df -h /
    sudo du -sh /opt/smarttb/backups /var/log /var/lib/postgresql
    sudo journalctl --vacuum-size=200M

Backups delete themselves after 72 copies. Logs are the usual cause. If the database itself is large, ask IT for a bigger disk.

### Blocked by fail2ban (too many wrong SSH attempts)
From another allowed device or through IT:

    sudo fail2ban-client status sshd
    sudo fail2ban-client set sshd unbanip <the blocked IP>

### The server was restarted
All four services start by themselves. Run the health check in section 3.

## 5. Updating the application

The code comes from the developer's PC as a single file (a git bundle), because GitHub deploy keys are disabled for the repository.

On the developer's PC, in the project folder:

    git bundle create smarttb.bundle main
    scp -i "<key>" smarttb.bundle azureuser@135.235.138.35:/tmp/smarttb.bundle

On the server:

    sudo install -o smarttb -g smarttb -m 640 /tmp/smarttb.bundle /opt/smarttb/code.bundle
    sudo bash /opt/smarttb/app/deploy/deploy.sh

The script fetches, builds, applies database changes, restarts and checks health. It prints "health check OK" when it works. The site is unavailable for about a minute.

Go back to an earlier version (use the short commit code from the log):

    sudo -u smarttb git -C /opt/smarttb/app log --oneline -10
    sudo bash /opt/smarttb/app/deploy/deploy.sh <commit>

Database changes are not undone by going back. Never edit files inside /opt/smarttb/app by hand: the next update overwrites them.

Take a backup immediately before every update: `sudo systemctl start smarttb-backup`.

## 6. Backups

What they are: every hour the server writes one encrypted file with the whole database (participants, forms, staff accounts, encrypted contact details, audit trail). File names look like smarttb-20261026T095908Z.dump.enc (UTC time). The files can only be opened with the backup passphrase.

Check them:

    systemctl list-timers smarttb-backup.timer --no-pager
    journalctl -u smarttb-backup -n 20 --no-pager
    sudo ls -lt /opt/smarttb/backups | head
    sudo systemctl start smarttb-backup        # take one now

The line "Object storage not configured" in the log is normal while no cloud bucket is set up.

### The desktop copy
The desktop downloads new files every hour (Task Scheduler job "SMART-TB backup pull") into C:\SMART-TB-Backups.
- Open C:\SMART-TB-Backups\pull.log. Each run adds a line: OK or FAILED with the reason.
- Run it by hand to see the error: `powershell -ExecutionPolicy Bypass -File C:\SMART-TB\pull-backups.ps1 -KeyPath C:\SMART-TB\acip-vm-acaiproject_key.pem -Dest C:\SMART-TB-Backups`
- "could not list backups": SSH is failing. Run the ssh command from section 2. If it hangs, check the public IP. If it asks "continue connecting?", answer yes once.
- The job only runs while someone is logged in to the desktop and the desktop is on. It catches up later because the server keeps 3 days.
- Task status: `schtasks /Query /TN "SMART-TB backup pull" /V /FO LIST | findstr /i "Status Last Next"`
- Delete the job: `schtasks /Delete /TN "SMART-TB backup pull" /F`

### Test a backup (do this every month)
This loads the newest backup into a temporary database and throws it away. It does not touch live data.

    sudo bash -c '
    set -a; source /opt/smarttb/.env; set +a
    F=$(ls -1t /opt/smarttb/backups/smarttb-*.dump.enc | head -1)
    sudo -u postgres psql -qc "CREATE DATABASE restore_test"
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$F" | sudo -u postgres pg_restore --no-owner --dbname=restore_test
    sudo -u postgres psql -d restore_test -Atc "select count(*) from participants"
    sudo -u postgres psql -qc "DROP DATABASE restore_test"
    '

It should print the number of participants with no errors.

### Full restore after a disaster (database lost or damaged)
This replaces the live database with a backup. Anything entered after that backup is lost and must be re-entered from the paper forms. Write down the time of the backup you use.

1. Pick the backup file (newest good one). If the server's own copies are gone, copy one from the desktop back to the server:
   `scp -i "<key>" C:\SMART-TB-Backups\<file> azureuser@135.235.138.35:/tmp/` then
   `sudo install -o smarttb -g smarttb -m 600 /tmp/<file> /opt/smarttb/backups/ && rm /tmp/<file>`
2. Stop the app and the backup timer:

        sudo systemctl stop smarttb smarttb-backup.timer

3. Keep the damaged database aside, create an empty one and restore:

        sudo bash -c '
        set -a; source /opt/smarttb/.env; set +a
        F=/opt/smarttb/backups/<file>
        sudo -u postgres psql -c "ALTER DATABASE smarttb RENAME TO smarttb_damaged"
        sudo -u postgres psql -c "CREATE DATABASE smarttb OWNER smarttb_owner"
        sudo -u postgres psql -c "REVOKE ALL ON DATABASE smarttb FROM PUBLIC" -c "GRANT CONNECT ON DATABASE smarttb TO smarttb_app"
        openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$F" | pg_restore --no-owner --dbname="$DATABASE_OWNER_URL"
        '

4. Start again and check:

        sudo systemctl start smarttb smarttb-backup.timer
        sleep 5
        curl -s http://127.0.0.1:3000/api/health

5. Sign in and check recent participants. When sure, remove the damaged copy: `sudo -u postgres psql -c "DROP DATABASE smarttb_damaged"`.

This exact procedure was tried on this server: the restored data loaded, the app account could read it, and it was still refused when it tried to delete study data.

### Open a backup by hand (any Linux machine)
    read -rs BACKUP_PASSPHRASE; export BACKUP_PASSPHRASE      # type the passphrase, nothing shows
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in smarttb-XXXX.dump.enc -out smarttb.dump
    pg_restore --list smarttb.dump | head        # shows the contents

## 7. Secrets: what must never be lost

In /opt/smarttb/.env:
- CONTACT_ENC_KEY: encrypts participant phone numbers and addresses. If it is lost, those fields can never be read again. Never change it once real data exists.
- BACKUP_PASSPHRASE: without it no backup can be opened.
- DATABASE_OWNER_URL and DATABASE_URL: database passwords. They can be reset with `sudo -u postgres psql -c "ALTER ROLE smarttb_app PASSWORD 'new'"` followed by the same change in .env and `sudo systemctl restart smarttb`.

Keep an offline copy of the first two in a sealed place (for example with the PI). To read them on the server:

    sudo grep -E '^(CONTACT_ENC_KEY|BACKUP_PASSPHRASE)=' /opt/smarttb/.env

After editing .env: `sudo systemctl restart smarttb`. Keep the format KEY=value, one per line, no spaces or quotes.

## 8. Building a new server from nothing

Use this if the server is lost. About 1 to 2 hours.

1. Ask IT for a new Ubuntu 24.04 server with ports 22 (from the two IPs), 80 and 443, and a key file.
2. Copy the deploy folder: `scp -i "<key>" -r "<project>\deploy" azureuser@<new IP>:~/`
3. On the server: `sudo bash ~/deploy/server-setup.sh --with-local-db`
4. Put the code on it (section 5), cloning once: `sudo -u smarttb -H git clone -b main /opt/smarttb/code.bundle /opt/smarttb/app`
5. Create /opt/smarttb/.env. Use the SAME CONTACT_ENC_KEY and BACKUP_PASSPHRASE as before (from the offline copy). Create new database passwords. Use the layout in deploy/env.production.example, with local 127.0.0.1 database addresses and no DATABASE_SSL_CA. Add a temporary PG_ADMIN_URL line for the next step.
6. Create the database: `cd /opt/smarttb/app` and `sudo -u smarttb -H bash -c 'set -a; source /opt/smarttb/.env; set +a; npm ci && npm run db:setup && npm run db:preflight'` (all checks must pass)
7. Restore the newest backup (section 6, full restore, from step 3 with a database created by db:setup).
8. `sudo bash /opt/smarttb/app/deploy/deploy.sh`, then remove PG_ADMIN_URL from .env.
9. Point the domain to the new IP. Ask IT to allow SSH from the two IPs and enable the backup timer: `sudo systemctl enable --now smarttb-backup.timer`.

## 9. Not done yet (do before the first real participant)

- HTTPS: needs a domain name pointing to 135.235.138.35. Then replace /etc/caddy/Caddyfile with deploy/Caddyfile (domain filled in), `sudo systemctl reload caddy`, set COOKIE_SECURE=true in .env, `sudo systemctl restart smarttb`. Until then passwords travel unencrypted.
- A backup copy that is not on this server or the desktop. Ask IT for separate storage.
- Two-step sign-in for staff.
- Create the real administrator accounts. There are no demo accounts on this server.

## 10. Useful one-liners

    sudo systemctl restart smarttb              # restart the app
    sudo systemctl restart caddy                # restart the web front door
    journalctl -u smarttb -f                    # watch the app log live (Ctrl+C to stop)
    sudo ufw status                             # firewall rules
    sudo -u postgres psql -d smarttb -c "select count(*) from participants"
    free -h                                     # memory
    uptime                                      # load and time since restart
    sudo reboot                                 # restart the whole server (last resort)
