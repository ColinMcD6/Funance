# Funance

A household finance tracker that runs on one computer at home and is opened from any browser
on the home network: laptop or phone. It imports bank CSV statements, categorizes spending and
income, and reports by month. The full design is in [docs/PLAN.md](docs/PLAN.md); progress is
logged in [docs/STATUS.md](docs/STATUS.md).

## First-time setup

You need a Windows 11 computer that stays on while you use the app, with
[Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

1. **Put the project outside OneDrive.** Clone or copy it to a folder such as
   `C:\dev\finance-tracker`. The `backups` folder holds a full copy of your finances, so it
   must never sync to OneDrive or any other cloud folder.
2. **Start the app.** Double-click `scripts\start.cmd`, or run it from a terminal. The first
   start builds the app and takes a few minutes. When it is ready it prints the addresses to
   use, for example:

   ```text
   Finance Tracker is running.
     On this computer:                http://localhost:8080
     From a phone or another computer: http://192.168.1.50:8080
   ```

3. **Allow it through the firewall, on private networks only.** The first time, Windows may ask
   whether Docker may accept connections. Tick **Private networks** and leave **Public
   networks** unticked. If no prompt appeared and your phone cannot connect, open
   **Windows Security → Firewall & network protection → Allow an app through firewall** and
   allow Docker Desktop (it may be listed as **Docker Desktop Backend** or
   **com.docker.backend**) on **Private** only. Your home Wi-Fi must be set as a
   private network (**Settings → Network & internet → Wi-Fi → your network → Private
   network**).
4. **Keep the address stable.** In your router's settings, reserve the computer's IP address
   (often called "DHCP reservation"), so the printed address stays the same. Bookmark it on
   each phone and laptop. `http://<computer-name>.local:8080` usually works too.
5. **Choose your profile.** Open the address, pick your name, and in **Settings** check the
   owner names and accounts.
6. **Load the old spreadsheet (once).** In **Settings → Import legacy spreadsheet**, choose
   the workbook. The preview lists anything to fix; commit once there are no problems. See
   PLAN.md section 2, "Legacy spreadsheet format", for the rules.

### Keep it on the home network

- Never add a port-forwarding rule for port 8080 on the router, and never allow it on the
  Windows **Public** network profile.
- There is no password: anyone on your Wi-Fi can open the app. Put guests on the router's guest
  network.

## Start and stop

| On Windows            | On macOS             | What it does                                               |
| --------------------- | -------------------- | ---------------------------------------------------------- |
| `scripts\start.cmd`   | `scripts/start.sh`   | Starts the app, waits until it answers, prints the address |
| `scripts\stop.cmd`    | `scripts/stop.sh`    | Stops the app                                              |
| `scripts\restore.cmd` | `scripts/restore.sh` | Restores a backup (below)                                  |

Your data lives in a Docker volume called `finance_data`. Stopping, starting, and restarting
the computer do not touch it. Docker Desktop starts the app again by itself after a restart, as
long as Docker Desktop is set to start when you sign in.

## The monthly routine

About 20 minutes, once a month after the statements are out.

1. **Download statements.** From each bank's website, download last month's transactions as
   CSV: Tangerine (chequing and Mastercard), Simplii Visa, Walmart Mastercard, RBC.
2. **Import each one.** Open **Import**, choose the account and the file, and press
   **Preview**. Check the counts: rows you already imported show as duplicates and are left
   out, so overlapping statements are safe. If the columns look wrong, cancel and fix the
   account's mapping in **Settings**. Otherwise press **Commit**. A backup is taken after every
   commit. A mistake can be undone in **Import → Import history**.
3. **Categorize.** Open **Uncategorized** (or **Transactions** with Category set to
   Uncategorized) and give every new transaction a category and owner. Card payments and
   transfers go in **Card Payment** or **Transfer**, so they drop out of the totals. For
   merchants you see every month, add a rule in **Rules** so the next import does it for you.
4. **Review the month.** **Dashboard** opens on last month. Switch between Colin, Emily, Joint
   and All, compare with earlier months, and tap any category to see its transactions.
   **Trends** shows the last 12 or 24 months.

## Backups and restore

- A backup is saved in the `backups` folder (next to this file) every time the app starts and
  after every import. The newest 30 are kept; older ones are deleted automatically. Names show
  the time in UTC: `finance-20261120-143000.sqlite` is 20 November 2026, 14:30:00 UTC.
- **Settings → Backups** has **Back up now** and **Download latest backup**, which works from
  any device.
- Now and then, copy the `backups` folder to a USB drive and keep it somewhere safe.

**To restore a backup**, for example after a mistake you cannot undo:

```bat
scripts\restore.cmd backups\finance-20261120-143000.sqlite
```

The script stops the app, checks that the file is a valid Finance Tracker backup, saves the
current database as one more backup (so the restore can itself be undone), puts the chosen
backup in its place, and starts the app again. If the file is not a valid backup, nothing is
changed. Everything entered after that backup was taken is gone, so re-import any later
statements.

To restore a downloaded backup, copy the file into the `backups` folder first, or pass its full
path.

## Troubleshooting

- **The start script says Docker could not start the app.** Open Docker Desktop, wait until it
  says it is running, and try again.
- **A phone cannot open the address.** Check that the phone is on the same Wi-Fi (not the guest
  network or mobile data), that the computer is awake, and the firewall step above.
- **The address changed.** Run `scripts\start.cmd` again to print the new one, and reserve the
  IP address in the router.

## Develop

Requires Node.js 26 (see `.nvmrc`) and pnpm 12 (`npm install -g pnpm`).

```sh
pnpm install
pnpm exec playwright install chromium   # once per machine
pnpm dev          # API on http://localhost:8080, web app with hot reload on http://localhost:5173
pnpm check:all    # format, lint, typecheck, tests, build, then Playwright
```

To run the Playwright specs against the Docker image, start a throwaway container on a fresh
volume (never the real `finance_data`) and point the specs at it:

```sh
docker build -t funance:e2e .
docker run -d --rm --name funance-e2e -p 8091:8080 funance:e2e
E2E_BASE_URL=http://localhost:8091 pnpm e2e
docker stop funance-e2e
```

Coding agents: read [CLAUDE.md](CLAUDE.md) first.

## Private data

Real bank statements, databases (`*.sqlite`), `data/`, `backups/` and `Statement Samples/` are
git-ignored and must never be committed. Development and tests use synthetic data only.
