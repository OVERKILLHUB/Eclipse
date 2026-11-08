\
const loginCard = document.getElementById("login-card");
const dashboard = document.getElementById("dashboard");
const message = document.getElementById("message");

async function loadAccount() {
  try {
    const response = await fetch("/api/me", { credentials: "same-origin" });
    if (!response.ok) return;
    const user = await response.json();
    if (!user.loggedIn) return;

    loginCard.hidden = true;
    dashboard.hidden = false;
    document.getElementById("username").textContent = user.username;
    document.getElementById("top-user").textContent = user.username.toUpperCase();
    document.getElementById("public-id").textContent = user.publicId;
    document.getElementById("mini-id").textContent = user.publicId;

    const avatar = document.getElementById("avatar");
    if (user.avatar && user.discordId) {
      avatar.src = `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.discordId)}/${encodeURIComponent(user.avatar)}.png?size=128`;
    } else {
      avatar.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='32' fill='%231d4773'/%3E%3Ctext x='32' y='42' text-anchor='middle' font-size='30' fill='white'%3E%E2%80%A2%3C/text%3E%3C/svg%3E";
    }
  } catch {
    message.textContent = "Could not load your account. Refresh the page to try again.";
  }
}

document.getElementById("copy-btn").addEventListener("click", async () => {
  const id = document.getElementById("public-id").textContent;
  try {
    await navigator.clipboard.writeText(id);
    document.querySelector("#copy-btn span").textContent = "COPIED!";
    setTimeout(() => document.querySelector("#copy-btn span").textContent = "COPY ID", 1400);
  } catch {
    message.textContent = "Copy failed. Please select the ID and copy it manually.";
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  location.reload();
});

if (new URLSearchParams(location.search).get("login") === "cancelled") {
  message.textContent = "Discord login was cancelled.";
}
loadAccount();
