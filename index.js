const { ActivityType, Client, Collection, EmbedBuilder, Events, GatewayIntentBits } = require('discord.js');
const WebSocket = require('ws');
const fs = require('fs');
const cron = require('node-cron');
const config = require('./config.json');
const convertToHiragana = require('./hiragana.js');
const Database = require('./db.js');
const db = new Database();
const baseColor = '#ff207d';

let serverList = require('./serverList.json');
let onlinePlayers = [];

// define discord client
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

const WebSocketServer = new WebSocket.Server({ port: 25505 });

// discord client ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

class DiscordSender {
    constructor() {
        this.client = client;
        channelChat = client.channels.cache.get(config.channels.chat);
        channelAttendance = client.channels.cache.get(config.channels.attendance);
        channelCmd = client.channels.cache.get(config.channels.command);
        channelLog = client.channels.cache.get(config.channels.log);
    }

    async sendEmbed(channel, title, description, color = baseColor) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();
        await channel.send({ embeds: [embed] });
    }

    async sendWebhookToChat(message) {
        fetch(config.webhooks.chat, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(message)
        });
    }
}

const dS = new DiscordSender();

WebSocketServer.on('connection', (ws) => {
    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        console.log(data);
        if (data.type === "initConnection") {
            serverList[data.serverId].ws = ws;
            ws.id = data.serverId;
            serverList[data.serverId].connected = true;
            console.log("new connection from server: " + data.serverId);
        }
        else if (data.type === "event") {
            if (data.event === "chat") {// minecraft chat
                const user = client.users.cache.get(db.userList.filter(user => user.mcid === data.username)[0].duserid);
                const message = data.message;
                let kana = convertToHiragana(content);
                if (message > 10 && message * 7 > kana.length * 10 && kana.length < 50) {
                    const URI = "http://www.google.com/transliterate?";
                    const langpair = "ja-Hira|ja";
                    const url = URI + "text=" + encodeURIComponent(kana) + "&langpair=" + langpair;
                    message += await fetch(url)
                        .then(response => response.json())
                        .then(data => {
                            let result = "";
                            data.forEach(element => {
                                result += element[1][0];
                            });
                            return result;
                        });
                }
                const messageStruc = {
                    "username": data.username,
                    "avatar_url": user.displayAvatarURL(),
                    "content": message
                };
                dS.sendWebhookToChat(messageStruc);
            }
            else if (data.event === "join") {// minecraft player join
                onlinePlayers.push(data.username);
                // statusにプレイ中のプレイヤーを表示
                let statusMessage = "";
                onlinePlayers.forEach(player => {
                    statusMessage += player + ", ";
                });
                statusMessage = statusMessage.slice(0, -2);
                client.user.setActivity(statusMessage, { type: ActivityType.PLAYING });
                dS.sendEmbed(channelAttendance, "参加通知", `${data.username} が参加しました。`);
            }
            else if (data.event === "leave") {// minecraft player leave
                onlinePlayers = onlinePlayers.filter(player => player !== data.username);
                // statusにプレイ中のプレイヤーを表示
                let statusMessage = "";
                onlinePlayers.forEach(player => {
                    statusMessage += player + ", ";
                });
                statusMessage = statusMessage.slice(0, -2);
                client.user.setActivity(statusMessage, { type: ActivityType.PLAYING });
                dS.sendEmbed(channelAttendance, "退出通知", `${data.username} が退出しました。`);
            }
            else if (data.event === "boot") {// minecraft server boot
                serverList[ws.id].status = "booting";
                dS.sendEmbed(channelCmd, "起動開始通知", `${serverList[ws.id].name} の起動を命令します。`);
            }
            else if (data.event === "online") {// minecraft server online
                serverList[ws.id].status = "online";
                dS.sendEmbed(channelCmd, "起動完了通知", `${serverList[ws.id].name} が起動しました。`);
            }
            else if (data.event === "shutdown") {// minecraft server shutdown
                serverList[ws.id].status = "shutdown";
                dS.sendEmbed(channelCmd, "停止実行通知", `${serverList[ws.id].name} の停止を命令します。`);
            }
            else if (data.event === "restart") {// minecraft server restart
                serverList[ws.id].status = "restarting";
                dS.sendEmbed(channelCmd, "再起動通知", `${serverList[ws.id].name} の再起動を命令します。`);
            }
            else if (data.event === "offline") {// minecraft server offline
                serverList[ws.id].status = "offline";
                dS.sendEmbed(channelCmd, "停止完了通知", `${serverList[ws.id].name} が停止しました。終了コード: ${data.code}`);
                dS.sendEmbed(channelLog, "停止完了通知",
                    `${serverList[ws.id].name} が停止しました。終了コード: ${data.code}エラーメッセージ: ${data.message}`);
            }
        }
    });
    ws.on('close', (code, reason) => {
        console.log('Connection closed', code, reason, ws.id || 'yet unknown');
        if (ws.id) {
            serverList[ws.id].ws = null;
            serverList[ws.id].connected = false;
        }
    });
});
