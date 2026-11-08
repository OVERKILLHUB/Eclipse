require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");

const required = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI", "SESSION_SECRET"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const app = express();
const isProduction = process.env.NODE_ENV === "production";
if (isProduction) app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "https://cdn.discordapp.com", "data:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new Database(path.join(__dirname, "users.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    avatar TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: __dirname }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
const randomId = () => "ECL-" + crypto.randomBytes(4).toString("hex").toUpperCase();

function getOrCreateUser(discordUser) {
  const existing = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(discordUser.id);
  const username = discordUser.global_name || discordUser.username;
  if (existing) {
    db.prepare("UPDATE users SET username = ?, avatar = ? WHERE discord_id = ?")
      .run(username, discordUser.avatar || null, discordUser.id);
    return { ...existing, username, avatar: discordUser.avatar || null };
  }

  // Retry if the randomly generated public ID ever collides.
  for (let attempt = 0; attempt < 5; attempt++) {
    const publicId = randomId();
    try {
      db.prepare(`INSERT INTO users (discord_id, public_id, username, avatar)
                  VALUES (?, ?, ?, ?)`)
        .run(discordUser.id, publicId, username, discordUser.avatar || null);
      return { discord_id: discordUser.id, public_id: publicId, username, avatar: discordUser.avatar || null };
    } catch (err) {
      if (!String(err.message).includes("UNIQUE")) throw err;
    }
  }
  throw new Error("Could not allocate a unique ID. Please try again.");
}

app.get("/auth/discord", loginLimiter, (req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect("/?login=cancelled");
  if (!code || !state || !req.session.oauthState || state !== req.session.oauthState) {
    return res.status(400).send("Invalid login state. Please return and try again.");
  }
  delete req.session.oauthState;

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      })
    });
    if (!tokenResponse.ok) throw new Error("Discord token exchange failed");
    const tokenData = await tokenResponse.json();

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `${tokenData.token_type} ${tokenData.access_token}` }
    });
    if (!userResponse.ok) throw new Error("Could not retrieve Discord profile");
    const discordUser = await userResponse.json();

    const user = getOrCreateUser(discordUser);
    req.session.regenerate((err) => {
      if (err) return res.status(500).send("Could not create login session.");
      req.session.user = {
        publicId: user.public_id,
        username: user.username,
        avatar: user.avatar,
        discordId: user.discord_id
      };
      req.session.save(() => res.redirect("/"));
    });
  } catch (err) {
    console.error("Discord login error:", err.message);
    res.status(500).send("Discord login failed. Please try again.");
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ loggedIn: false });
  const { publicId, username, avatar } = req.session.user;
  res.json({ loggedIn: true, publicId, username, avatar, discordId: req.session.user.discordId });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Project Eclipse ID running at http://localhost:${port}`));
