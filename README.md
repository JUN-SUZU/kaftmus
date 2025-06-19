# kaftmus

Minecraft management discord bot.

## setup

1. Create a new discord application at https://discord.com/developers/applications
2. Install this application to your server with the following Command:

```Mac/Linux
curl -fsSL https://kaftmus.jun-suzu.net/install.sh | sh
```

```Windows
irm https://kaftmus.jun-suzu.net/install.ps1 | iex
```

or manually by cloning this repository and running the `install.sh` or `install.ps1` script.

3. Create a new file named `.env` in the root directory of the project and fill it with the following variables:

```
DISCORD_TOKEN=your_discord_token
KAFTMUS_DASHBOARD_PORT=your_dashboard_port
```

4. run the bot with the following command:

```bash
deno --allow-net --allow-env --env-file main.ts
```

## usage
You can use the bot by accessing the dashboard at `http://localhost:<DASHBOARD_PORT>` and logging in with your discord account.
