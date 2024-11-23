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
let linkCode = {};

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

const WebSocketServer = new WebSocket.Server({ port: 25506 });

// discord client ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

class DiscordSender {
    constructor() {
        this.client = client;
        this.channelChat = client.channels.cache.get(config.channels.chat);
        this.channelAttendance = client.channels.cache.get(config.channels.attendance);
        this.channelCmd = client.channels.cache.get(config.channels.command);
        this.channelLog = client.channels.cache.get(config.channels.log);
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
        if (data.type === "initConnection") {
            serverList[data.serverId].ws = ws;
            ws.id = data.serverId;
            serverList[data.serverId].connected = true;
            console.log("new connection from server: " + data.serverId);
        }
        else if (data.type === "event") {
            if (data.event === "chat") {// minecraft chat
                db.readUserList();
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
                if (!db.userList.some(user => user.mcid === data.username)) {
                    if (!linkCode[data.username]) {
                        linkCode[data.username] = Math.random().toString(36).slice(-5);
                        dS.sendEmbed(dS.channelCmd, "リンクコード生成",
                            `${data.username} が初めて参加しました。リンクコードを生成します。` +
                            `リンクするには、以下の形式でこのチャンネルに送信してください。\n${config.prefix}link ${data.username} <リンクコード>`, 'BLUE');
                    }
                    ws.send(JSON.stringify({ type: 'event', event: 'link', username: data.username, prefix: config.prefix, code: linkCode[data.username] }));
                    return;
                }
                onlinePlayers.push(data.username);
                // statusにプレイ中のプレイヤーを表示
                let statusMessage = "";
                onlinePlayers.forEach(player => {
                    statusMessage += player + ", ";
                });
                statusMessage = statusMessage.slice(0, -2);
                client.user.setActivity(statusMessage, { type: ActivityType.PLAYING });
                dS.sendEmbed(dS.channelAttendance, "参加通知", `${data.username} が参加しました。`);
            }
            else if (data.event === "leave") {// minecraft player leave
                if (onlinePlayers.includes(data.username)) {
                    onlinePlayers = onlinePlayers.filter(player => player !== data.username);
                    // statusにプレイ中のプレイヤーを表示
                    let statusMessage = "";
                    onlinePlayers.forEach(player => {
                        statusMessage += player + ", ";
                    });
                    statusMessage = statusMessage.slice(0, -2);
                    client.user.setActivity(statusMessage, { type: ActivityType.PLAYING });
                    dS.sendEmbed(dS.channelAttendance, "退出通知", `${data.username} が退出しました。`);
                }
                else if (!linkCode[data.username]) {
                    dS.sendEmbed(dS.channelCmd, "エラー", `${data.username} が退出しましたが、参加していませんでした。`, 'RED');
                }
            }
            else if (data.event === "boot") {// minecraft server boot
                serverList[ws.id].status = "booting";
                dS.sendEmbed(dS.channelCmd, "起動開始通知", `${serverList[ws.id].name} の起動を命令します。`);
            }
            else if (data.event === "online") {// minecraft server online
                serverList[ws.id].status = "online";
                serverList[ws.id].failedCount = 0;
                dS.sendEmbed(dS.channelCmd, "起動完了通知", `${serverList[ws.id].name} が起動しました。起動にかかった時間: ${data.spentTime}秒`);
                dS.sendEmbed(dS.channelLog, "起動完了通知", `${serverList[ws.id].name} が起動しました。起動にかかった時間: ${data.spentTime}秒`);
            }
            else if (data.event === "shutdown") {// minecraft server shutdown
                serverList[ws.id].status = "shutdown";
                dS.sendEmbed(dS.channelCmd, "停止実行通知", `${serverList[ws.id].name} の停止を命令します。`);
            }
            else if (data.event === "restart") {// minecraft server restart
                serverList[ws.id].status = "restarting";
                dS.sendEmbed(dS.channelCmd, "再起動通知", `${serverList[ws.id].name} の再起動を命令します。`);
            }
            else if (data.event === "offline") {// minecraft server offline
                serverList[ws.id].status = "offline";
                dS.sendEmbed(dS.channelCmd, "停止完了通知", `${serverList[ws.id].name} が停止しました。終了コード: ${data.code}`);
                dS.sendEmbed(dS.channelLog, "停止完了通知", `${serverList[ws.id].name} が停止しました。終了コード: ${data.code}`);
            }
            else if (data.event === "crash") {// minecraft server crash
                serverList[ws.id].failedCount++;
                serverList[ws.id].status = "offline";
                const whRestart = serverList[ws.id].autoRestart && serverList[ws.id].failedCount < 3;
                dS.sendEmbed(dS.channelCmd, "クラッシュ通知", `${serverList[ws.id].name} がクラッシュしました。終了コード: ${data.code}\n` +
                    `${whRestart ? "30秒後に自動再起動を行います。" : "自動再起動は行いません。"}`, 'RED');
                dS.sendEmbed(dS.channelLog, "クラッシュ通知", `${serverList[ws.id].name} がクラッシュしました。終了コード: ${data.code}\n` +
                    `${whRestart ? "30秒後に自動再起動を行います。" : "自動再起動は行いません。"}`, 'RED');
                if (whRestart) {
                    setTimeout(() => {
                        serverList[ws.id].ws.send(JSON.stringify({ type: 'command', command: 'start' }));
                    }, 30000);
                }
            }
        }
        else if (data.type === "commandResponse") {
            dS.sendEmbed(dS.channelLog, data.title, data.message, data.color);
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

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    let messageContent = message.content;
    if (message.channel.id === config.channels.command) {
        if (messageContent.startsWith(config.prefix)) {
            const args = messageContent.slice(config.prefix.length).split(' ');
            const command = args[0];
            if (command === 'start') {
                if (serverList[args[1]].status !== 'offline') {
                    dS.sendEmbed(dS.channelCmd, "起動失敗", `${serverList[args[1]].name} は既に起動しています。`, 'RED');
                    return;
                }
                serverList[args[1]].ws.send(JSON.stringify({ type: 'command', command: 'start' }));
            }
            else if (command === 'stop') {
                if (serverList[args[1]].status !== 'online') {
                    dS.sendEmbed(dS.channelCmd, "停止失敗", `${serverList[args[1]].name} は起動していません。`, 'RED');
                    return;
                }
                serverList[args[1]].ws.send(JSON.stringify({ type: 'command', command: 'stop' }));
            }
            else if (command === 'restart') {
                if (serverList[args[1]].status !== 'online') {
                    dS.sendEmbed(dS.channelCmd, "再起動失敗", `${serverList[args[1]].name} は起動していません。`, 'RED');
                    return;
                }
                serverList[args[1]].ws.send(JSON.stringify({ type: 'command', command: 'restart' }));
            }
            else if (command === 'link') {
                if (linkCode[args[1]] === args[2]) {
                    db.readUserList();
                    db.userList.push({ duserid: message.author.id, mcid: args[1] });
                    db.saveUserList();
                    dS.sendEmbed(dS.channelCmd, "リンク完了", `${args[1]} とのリンクが完了しました。`);
                    delete linkCode[args[1]];
                }
                else {
                    dS.sendEmbed(dS.channelCmd, "リンク失敗", "リンクコードが一致しません。以下の形式で入力してください。\n`" + config.prefix + "link <MinecraftID> <リンクコード>`", 'RED');
                }
            }
        }
    }
    else if (message.channel.id === config.channels.chat) {
        const kana = convertToHiragana(messageContent);
        if (messageContent.length > 10 && messageContent.length * 7 > kana.length * 10 && kana.length < 50) {
            const URI = "http://www.google.com/transliterate?";
            const langpair = "ja-Hira|ja";
            const url = URI + "text=" + encodeURIComponent(kana) + "&langpair=" + langpair;
            messageContent += await fetch(url)
                .then(response => response.json())
                .then(data => {
                    let result = "";
                    data.forEach(element => {
                        result += element[1][0];
                    });
                    return result;
                });
        }
        serverList.forEach(server => {
            if (server.connected) {
                server.ws.send(JSON.stringify({ type: 'event', event: 'chat', username: message.author.username, message: messageContent, color: message.member.displayColor }));
            }
        });
    }
});

client.login(config.token);
