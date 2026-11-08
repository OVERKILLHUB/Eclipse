# Project Eclipse ID

A small Node.js website that lets people sign in with Discord and receive a unique, persistent Project Eclipse ID.

## Requirements

- Node.js 18 or newer
- A Discord application

## 1. Create the Discord application

1. Open https://discord.com/developers/applications
2. Select **New Application** and give it a name.
3. Open **OAuth2** and copy the Client ID and Client Secret.
4. Add this exact redirect URL under **Redirects**:
   `http://localhost:3000/auth/discord/callback`

The app only requests the `identify` OAuth scope. It does not ask for a Discord password or bot permissions.

## 2. Configure the website

```bash
npm install
```

Copy `.env.example` to `.env`, then fill in your Discord Client ID and Client Secret. Set a long, random `SESSION_SECRET`.

## 3. Start it

```bash
npm start
```

Open http://localhost:3000

## How IDs work

- The server creates an ID using Node's cryptographically secure random generator.
- A SQLite database stores the mapping between Discord account ID and public Project Eclipse ID.
- A database uniqueness constraint prevents two accounts from receiving the same public ID.
- Logging in again returns the existing ID instead of generating a new one.

## Before deploying publicly

- Host behind HTTPS and set `COOKIE_SECURE=true`.
- Set `NODE_ENV=production`.
- Change `DISCORD_REDIRECT_URI` to your real HTTPS callback URL and add that same URL in the Discord Developer Portal.
- Keep `.env`, `users.sqlite`, and `sessions.sqlite` private. Never commit secrets or databases to a public repository.
- Use persistent disk storage for the SQLite files. Ephemeral hosting storage can erase assigned IDs.
- Back up the SQLite database regularly.
- Use a managed database if deploying multiple server instances.
