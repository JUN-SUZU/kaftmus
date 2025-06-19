import { ActivityType, Client, Collection, EmbedBuilder, Events, GatewayIntentBits } from "discord.js";

// メモ APIを登録して、ipアドレスが一致するか確認できるようにする
// プロトコル名: kip(kaftmus ipcheck protocol)

// Discord bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.MessageContent
  ]
});

// Dashboard http server
Deno.serve({
  port: Deno.env.get("DASHBOARD_PORT") ? parseInt(Deno.env.get("DASHBOARD_PORT")!) : 8000,
}, async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  if (method === "GET") {
    // read dashboard folder
    const filePath = `./dashboard${path === "/" ? "/index.html" : path}`;
    try {
      // Check if the file exists
      const fileInfo = Deno.statSync(filePath);
      if (!fileInfo.isFile) {
        return new Response("Not Found", { status: 404 });
      }
      const file = Deno.readFileSync(filePath);
      return new Response(file, {
        headers: {
          "Content-Type": filePath.endsWith(".html") ? "text/html" :
            filePath.endsWith(".js") ? "application/javascript" :
              filePath.endsWith(".css") ? "text/css" :
                filePath.endsWith(".png") ? "image/png" :
                  filePath.endsWith(".ico") ? "image/x-icon" :
                    filePath.endsWith(".svg") ? "image/svg+xml" :
                      filePath.endsWith(".json") ? "application/json" :
                        "text/plain"
        }
      });
    } catch (error) {
      console.error("Error reading file:", error);
      return new Response("Not Found", { status: 404 });
    }
  }
  if (method === "POST") {
    // Parse the JSON body
    let json: { action?: string;[key: string]: unknown };
    try {
      json = await req.json();
    } catch (error) {
      console.error("Invalid JSON this is not a JSON request");
      return new Response("Bad Request", { status: 400 });
    }

    // Authorize by reading the access token from secure cookie
    const cookie = req.headers.get("cookie");
    if (!cookie || !cookie.includes("access_token")) {
      return new Response("Unauthorized", { status: 401 });
    }
    const accessToken = cookie.split("; ").find((c) => c.startsWith("access_token="));
    if (!accessToken || accessToken.split("=")[1] !== Deno.env.get("ACCESS_TOKEN")) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Handle the request based on the action
    if (json.action === "getStatus") {
      // Do some logic to get the server statuses
    }
  }
  return new Response("Method Not Allowed", { status: 405 });
});
