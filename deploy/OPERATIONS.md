# SMART-TB server: operations guide

Everything here works from this file alone. No internet search is needed. Print it or keep a copy on the desktop.
Every command was tried on this server, except two that would change real accounts or data: the full restore (section 6, tried on a test computer) and creating a new administrator (section 4). Lines starting with `#` inside a code block are comments, not commands.

## 1. Where things are

- Server: Ubuntu 24.04, public IP 45.195.159.88, MilesWeb VPS (service SM-L2). (The earlier Azure server, 135.235.138.35, was cleared on 2026-11-02 and is no longer used.)
- Login user: root. Login is by key file only; passwords are switched off (/etc/ssh/sshd_config.d/00-smarttb-keyonly.conf). The commands below start with `sudo`; as root that does nothing and is harmless.
- Key file: smarttb_milesweb (on the developer's PC: C:\Users\<you>\.ssh\smarttb_milesweb). Never email it.
- SSH is open to the internet but accepts keys only; fail2ban blocks addresses that keep failing. The website is open to everyone on ports 80 and 443. The database (27017) and the app (3000) are not reachable from outside.
- A second, restricted login, backuppull, can only list and download the encrypted backups (deploy/README.md section 6).
- App code: /opt/smarttb/app (owned by user smarttb)
- Settings and secrets: /opt/smarttb/.env (readable by root and smarttb only), and the database passwords in /opt/smarttb/.env.mongo (readable by smarttb only)
- Backups: /opt/smarttb/backups (hourly, encrypted, newest 72 kept)
- Database: MongoDB 8.0 on the same server, listening on 127.0.0.1 only, database name smarttb. It runs as a single-node replica set with login switched on.
- Services: smarttb (the app, port 3000), caddy (web front door, ports 80/443), mongod (the database), fail2ban
- Backup copy on the desktop: C:\SMART-TB-Backups (downloaded every hour by Task Scheduler)

Fill in before going live:
- Institute IT contact: ______________________   Phone: ______________
- PI: ______________________   Phone: ______________
- Offline copy of CONTACT_ENC_KEY and BACKUP_PASSPHRASE is kept by: ______________________

## 2. Connect to the server

On the laptop or desktop, in PowerShell:

    ssh -i "$HOME\.ssh\smarttb_milesweb" root@45.195.159.88

Type `exit` to leave.

If the connection hangs or times out:
1. Check the server is running in the MilesWeb client area (service SM-L2). The VNC console there works even when SSH does not.
2. Too many failed attempts from your address get it blocked by fail2ban for a while. Wait 10 minutes, or unblock it from the console (section 4, "Blocked by fail2ban").
3. "Permission denied (publickey)": the wrong key file was used, or it is missing from /root/.ssh/authorized_keys.

If it says "Permission denied (publickey)": wrong user name or the wrong key file.
If it says "UNPROTECTED PRIVATE KEY FILE": run
`icacls "<path to key>" /inheritance:r /grant:r "$($env:USERNAME):R"`

## 3. Ten-second health check

After connecting, run:

    systemctl is-active smarttb caddy mongod fail2ban
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
2. `systemctl is-active mongod`. If not active: `sudo systemctl restart mongod`, then restart the app (`sudo systemctl restart smarttb`).
3. One person only: after 5 wrong passwords an account is locked for about 5 minutes. Wait, then try again.
4. Everyone is signed out suddenly: sessions end after 15 minutes of inactivity or after 12 hours. This is normal.
5. Forgotten password: an administrator uses Staff accounts, then the person, then Reset password. It gives a one-time link.
6. No administrator can sign in at all: create a new one (the email must not already exist):

        cd /opt/smarttb/app
        sudo -u smarttb -H bash -c 'export SMARTTB_ENV_FILES=/opt/smarttb/.env,/opt/smarttb/.env.mongo; npm run db:create-admin -- --email NEW@ADDRESS --name "Full Name" --role pi'

   It prints a one-time setup link. Send it privately.

### The database will not start
    sudo systemctl status mongod --no-pager
    sudo journalctl -u mongod -n 50 --no-pager
    df -h /

A full disk is the most common cause (section 4, "Disk is nearly full"). If the log says "Linux kernel versions 6.19 and newer has a known incompatibility", a server update changed the setting that works around that problem: check that the file /etc/systemd/system/mongod.service.d/rseq.conf still exists, then `sudo systemctl daemon-reload && sudo systemctl restart mongod`. If the data itself is damaged, restore from a backup (section 6).

### Disk is nearly full
    df -h /
    sudo du -sh /opt/smarttb/backups /var/log /var/lib/mongodb
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
    scp -i "<key>" smarttb.bundle root@45.195.159.88:/tmp/smarttb.bundle

On the server:

    sudo systemctl start smarttb-backup
    sudo install -o smarttb -g smarttb -m 640 /tmp/smarttb.bundle /opt/smarttb/code.bundle
    rm -rf /root/deploy /tmp/smarttb-src && git clone -q /tmp/smarttb.bundle /tmp/smarttb-src && cp -r /tmp/smarttb-src/deploy /root/deploy && rm -rf /tmp/smarttb-src
    sudo bash /root/deploy/deploy.sh

The script is run from a copy (/root/deploy) because the update replaces the files in /opt/smarttb/app while it runs.
If an update changes deploy/smarttb.service, deploy/backup.sh or deploy/backup-serve.sh, install them too (before deploy.sh):

    sudo install -m 644 /root/deploy/smarttb.service /etc/systemd/system/ && sudo systemctl daemon-reload
    sudo install -m 755 /root/deploy/backup.sh /usr/local/bin/smarttb-backup
    sudo install -m 755 /root/deploy/backup-serve.sh /usr/local/bin/smarttb-backup-serve

The script fetches, builds, applies database changes, restarts and checks health. It prints "health check OK" when it works. The site is unavailable for about a minute.

Go back to an earlier version (use the short commit code from the log):

    sudo -u smarttb git -C /opt/smarttb/app log --oneline -10
    sudo bash /root/deploy/deploy.sh <commit>

Database changes are not undone by going back. Never edit files inside /opt/smarttb/app by hand: the next update overwrites them.

Take a backup immediately before every update: `sudo systemctl start smarttb-backup`.

## 6. Backups

What they are: every hour the server writes one encrypted file with the whole database (participants, forms, staff accounts, encrypted contact details, audit trail). File names look like smarttb-20261026T095908Z.dump.enc (UTC time). The files can only be opened with the backup passphrase.

Module 5 photos are files in /opt/smarttb/uploads, not in the database. In the same hourly run, the photos added since the last run go into one more encrypted file, smarttb-images-<time>.dump.enc (same passphrase). These are only written when there are new photos and are never deleted, on the server or on the desktop: together they hold every photo. The list of photos already archived is /opt/smarttb/backups/.images-archived; deleting it makes the next run archive every photo again (harmless, just larger).

Check them:

    systemctl list-timers smarttb-backup.timer --no-pager
    journalctl -u smarttb-backup -n 20 --no-pager
    sudo ls -lt /opt/smarttb/backups | head
    sudo systemctl start smarttb-backup        # take one now

The line "Object storage not configured" in the log is normal while no cloud bucket is set up.

### The desktop copy
The desktop downloads new files every hour (Task Scheduler job "SMART-TB backup pull MilesWeb") into C:\SMART-TB-Backups, through the restricted backuppull login with its own key (set-up: deploy/README.md section 6).
- Open C:\SMART-TB-Backups\pull.log. Each run adds a line: OK or FAILED with the reason.
- Run it by hand to see the error: `powershell -ExecutionPolicy Bypass -File C:\SMART-TB\pull-backups.ps1 -KeyPath C:\SMART-TB\smarttb_backuppull -Dest C:\SMART-TB-Backups` (it connects as backuppull to 45.195.159.88 by default)
- "could not list backups": SSH is failing. Check the server is up (section 2) and that the desktop's key is in /home/backuppull/.ssh/authorized_keys. If it asks "continue connecting?", answer yes once.
- The job only runs while someone is logged in to the desktop and the desktop is on. It catches up later because the server keeps 3 days.
- Task status: `schtasks /Query /TN "SMART-TB backup pull" /V /FO LIST | findstr /i "Status Last Next"`
- Delete the job: `schtasks /Delete /TN "SMART-TB backup pull" /F`

### Test a backup (do this every month)
This loads the newest backup into a temporary database, shows what it holds, and throws it away. It does not touch live data.

    sudo -u smarttb -H bash -c '
    cd /opt/smarttb/app
    set -a; source /opt/smarttb/.env; set +a
    export SMARTTB_ENV_FILES=/opt/smarttb/.env,/opt/smarttb/.env.mongo
    F=$(ls -1t /opt/smarttb/backups/smarttb-2*.dump.enc | head -1)
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$F" | npm run --silent db:restore -- --admin --into restore_test
    npm run --silent db:counts -- --admin --db restore_test
    npm run --silent db:counts
    npm run --silent db:drop-scratch -- restore_test
    '

It should print "Restored ... documents", then two lists of counts that are close to each other (the first is the backup, the second is live data; live data may have a few more records entered since). There must be no error messages. Every hourly backup is also checked by the server itself when it is written (it decrypts the file and tests it), and a failed check shows in `journalctl -u smarttb-backup`.

### Full restore after a disaster (database lost or damaged)
This replaces the live database with a backup. Anything entered after that backup is lost and must be re-entered from the paper forms. Write down the time of the backup you use.

1. Pick the backup file (newest good one). If the server's own copies are gone, copy one from the desktop back to the server:
   `scp -i "<key>" C:\SMART-TB-Backups\<file> root@45.195.159.88:/tmp/` then
   `sudo install -o smarttb -g smarttb -m 600 /tmp/<file> /opt/smarttb/backups/ && rm /tmp/<file>`
2. Stop the app and the backup timer:

        sudo systemctl stop smarttb smarttb-backup.timer

3. If the damaged database still opens, keep a copy of what is left first (it becomes the newest backup file, so note its name), then restore over the database:

        sudo systemctl start mongod
        sudo systemctl start smarttb-backup
        sudo -u smarttb -H bash -c '
        cd /opt/smarttb/app
        set -a; source /opt/smarttb/.env; set +a
        export SMARTTB_ENV_FILES=/opt/smarttb/.env,/opt/smarttb/.env.mongo
        F=/opt/smarttb/backups/<file>
        openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$F" | npm run --silent db:restore -- --replace
        '

   The last command prints "Restored ... documents" and the count for each collection. If the whole database folder was lost (a new disk), set MongoDB up again first (section 8, steps 3 to 7) and restore without `--replace`.

4. Start again and check:

        sudo systemctl start smarttb smarttb-backup.timer
        sleep 5
        curl -s http://127.0.0.1:3000/api/health

5. Sign in and check recent participants. Keep the copy made in step 3 for a few weeks in case something was missed.

6. Photos: if /opt/smarttb/uploads was lost too, unpack every photo archive into it, oldest first (copy them back from the desktop first if needed, as in step 1):

        sudo bash -c '
        set -a; source /opt/smarttb/.env; set +a
        install -d -o smarttb -g smarttb -m 750 /opt/smarttb/uploads
        for F in $(ls -1 /opt/smarttb/backups/smarttb-images-*.dump.enc); do
          openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$F" | tar -xz -C /opt/smarttb/uploads
        done
        chown -R smarttb:smarttb /opt/smarttb/uploads
        '

   A photo whose file is missing still shows as attached in Module 5 (its record is in the database) but the picture does not open.

The restore was tried on a test computer: a backup loaded into an empty database and into a second database, every collection had the same number of records, the unique rules (one account per email, one participant ID) came back, and a wrong passphrase wrote nothing. Do the monthly test above on this server once before relying on it.

### Open a backup by hand (any Linux machine)
    read -rs BACKUP_PASSPHRASE; export BACKUP_PASSPHRASE      # type the passphrase, nothing shows
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in smarttb-XXXX.dump.enc -out smarttb.dump.gz
    gunzip -c smarttb.dump.gz | head -c 2000        # shows the first lines; every line is one record as plain JSON text

The file is a compressed list of records, one per line, in plain JSON text. Contact details inside it are still encrypted (they need CONTACT_ENC_KEY).

A photo archive (smarttb-images-XXXX.dump.enc) is a .tar.gz once decrypted: `... -out photos.tar.gz` then `tar -tzf photos.tar.gz` lists it, `tar -xzf photos.tar.gz` unpacks it (one folder per participant).

## 7. Secrets: what must never be lost

In /opt/smarttb/.env:
- CONTACT_ENC_KEY: encrypts participant phone numbers and addresses. If it is lost, those fields can never be read again. Never change it once real data exists.
- BACKUP_PASSPHRASE: without it no backup can be opened.
- /opt/smarttb/.env.mongo: the database passwords (one for the app, one for backups and updates, one for setting up). They can be replaced with new random ones at any time: `sudo -u smarttb -H bash -c 'cd /opt/smarttb/app && npm run db:setup -- --env /opt/smarttb/.env.mongo --db smarttb --port 27017'` and then `sudo systemctl restart smarttb`. Never show this file on a shared screen.

Keep an offline copy of the first two in a sealed place (for example with the PI). To read them on the server:

    sudo grep -E '^(CONTACT_ENC_KEY|BACKUP_PASSPHRASE)=' /opt/smarttb/.env

After editing .env: `sudo systemctl restart smarttb`. Keep the format KEY=value, one per line, no spaces or quotes.

## 8. Building a new server from nothing

Use this if the server is lost. About 1 to 2 hours.

1. Ask IT for a new Ubuntu 24.04 server with ports 22 (from the two IPs), 80 and 443, and a key file.
2. Copy the deploy folder: `scp -i "<key>" -r "<project>\deploy" root@<new IP>:~/`
3. On the server: `sudo bash ~/deploy/server-setup.sh`, then install the database: `sudo bash ~/deploy/mongo-setup.sh`
4. Put the code on it (section 5), cloning once: `sudo -u smarttb -H git clone -b main /opt/smarttb/code.bundle /opt/smarttb/app`
5. Create /opt/smarttb/.env. Use the SAME CONTACT_ENC_KEY and BACKUP_PASSPHRASE as before (from the offline copy). Use the layout in deploy/env.production.example. The database passwords are made for you in the next steps; do not reuse old ones.
6. `sudo bash /opt/smarttb/app/deploy/deploy.sh` (first run: it builds the app and says the database logins are not set up yet, which is expected), then `sudo bash /opt/smarttb/app/deploy/mongo-init.sh` (creates the database logins and switches login on), then `sudo bash /opt/smarttb/app/deploy/deploy.sh` again.
7. Check the new database: `sudo -u smarttb -H bash -c 'cd /opt/smarttb/app && SMARTTB_ENV_FILES=/opt/smarttb/.env,/opt/smarttb/.env.mongo npm run db:preflight'` (all checks must pass)
8. Restore the newest backup into it (section 6, full restore, step 3, without `--replace` because the database is new), then restart the app: `sudo systemctl restart smarttb`.
9. Point the domain to the new IP. Ask IT to allow SSH from the two IPs and enable the backup timer: `sudo systemctl enable --now smarttb-backup.timer`.

## 9. Not done yet (do before the first real participant)

- HTTPS: needs a domain name pointing to 45.195.159.88. Then replace /etc/caddy/Caddyfile with deploy/Caddyfile (domain filled in), `sudo systemctl reload caddy`, set COOKIE_SECURE=true in .env, `sudo systemctl restart smarttb`. Until then passwords travel unencrypted.
- A backup copy that is not on this server or the desktop. Ask IT for separate storage.
- Two-step sign-in for staff.
- Create the real administrator accounts. There are no demo accounts on this server.

## 10. Useful one-liners

    sudo systemctl restart smarttb              # restart the app
    sudo systemctl restart caddy                # restart the web front door
    journalctl -u smarttb -f                    # watch the app log live (Ctrl+C to stop)
    sudo ufw status                             # firewall rules
    sudo -u smarttb -H bash -c 'cd /opt/smarttb/app && SMARTTB_ENV_FILES=/opt/smarttb/.env,/opt/smarttb/.env.mongo npm run --silent db:counts'   # how many records of each kind
    free -h                                     # memory
    uptime                                      # load and time since restart
    sudo reboot                                 # restart the whole server (last resort)
