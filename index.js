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

const WebSocketServer = new WebSocket.Server({ port: config.wsPort });

// discord client ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.channels.fetch(config.channels.chat);
    channelChat = client.channels.cache.get(config.channels.chat);
    channelAttendance = client.channels.cache.get(config.channels.attendance);
    channelCmd = client.channels.cache.get(config.channels.command);
    channelLog = client.channels.cache.get(config.channels.log);
});

let channelChat = client.channels.cache.get(config.channels.chat);
let channelAttendance = client.channels.cache.get(config.channels.attendance);
let channelCmd = client.channels.cache.get(config.channels.command);
let channelLog = client.channels.cache.get(config.channels.log);

class DiscordSender {
    constructor() {
        this.client = client;
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
                const id = db.userList.findIndex(user => user.mcid === data.username);
                if (id === -1) {
                    dS.sendEmbed(channelCmd, "エラー", `${data.username} はリンクされていません。`, '#ff0000');
                    return;
                }
                const user = await client.users.fetch(db.userList[id].duserid);
                const message = data.message;
                let kana = convertToHiragana(message);
                let romaji = "";
                if (message > 10 && message * 7 > kana.length * 10 && kana.length < 50) {
                    const URI = "http://www.google.com/transliterate?";
                    const langpair = "ja-Hira|ja";
                    const url = URI + "text=" + encodeURIComponent(kana) + "&langpair=" + langpair;
                    romaji = await fetch(url)
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
                    "content": message + (romaji ? "\n" + romaji : "")
                };
                dS.sendWebhookToChat(messageStruc);
            }
            else if (data.event === "join") {// minecraft player join
                if (!db.userList.some(user => user.mcid === data.username)) {
                    if (!linkCode[data.username]) {
                        linkCode[data.username] = Math.random().toString(36).slice(-5);
                        dS.sendEmbed(channelCmd, "リンクコード生成",
                            `${data.username} が初めて参加しました。リンクコードを生成します。` +
                            `リンクするには、以下の形式でこのチャンネルに送信してください。\n${config.prefix}link ${data.username} <リンクコード>`, '#0000ff');
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
                dS.sendEmbed(channelAttendance, "参加通知", `${data.username} が参加しました。`);
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
                    dS.sendEmbed(channelAttendance, "退出通知", `${data.username} が退出しました。`);
                }
                else if (!linkCode[data.username]) {
                    dS.sendEmbed(channelCmd, "エラー", `${data.username} が退出しましたが、参加していませんでした。`, '#ff0000');
                }
            }
            else if (data.event === "boot") {// minecraft server boot
                dS.sendEmbed(channelCmd, "起動開始通知", `${serverList[ws.id].name} の起動を命令します。`);
            }
            else if (data.event === "online") {// minecraft server online
                serverList[ws.id].failedCount = 0;
                dS.sendEmbed(channelCmd, "起動完了通知", `${serverList[ws.id].name} が起動しました。起動にかかった時間: ${data.spentTime}秒`);
                dS.sendEmbed(channelLog, "起動完了通知", `${serverList[ws.id].name} が起動しました。起動にかかった時間: ${data.spentTime}秒`);
            }
            else if (data.event === "shutdown") {// minecraft server shutdown
                dS.sendEmbed(channelCmd, "停止実行通知", `${serverList[ws.id].name} の停止を命令します。`);
            }
            else if (data.event === "restart") {// minecraft server restart
                dS.sendEmbed(channelCmd, "再起動通知", `${serverList[ws.id].name} の再起動を命令します。`);
            }
            else if (data.event === "offline") {// minecraft server offline
                dS.sendEmbed(channelCmd, "停止完了通知", `${serverList[ws.id].name} が停止しました。終了コード: ${data.code}`);
                dS.sendEmbed(channelLog, "停止完了通知", `${serverList[ws.id].name} が停止しました。終了コード: ${data.code}`);
            }
            else if (data.event === "crash") {// minecraft server crash
                serverList[ws.id].failedCount++;
                const whRestart = serverList[ws.id].autoRestart && serverList[ws.id].failedCount < 3;
                dS.sendEmbed(channelCmd, "クラッシュ通知", `${serverList[ws.id].name} がクラッシュしました。終了コード: ${data.code}\n` +
                    `${whRestart ? "30秒後に自動再起動を行います。" : "自動再起動は行いません。"}`, '#ff0000');
                dS.sendEmbed(channelLog, "クラッシュ通知", `${serverList[ws.id].name} がクラッシュしました。終了コード: ${data.code}\n` +
                    `${whRestart ? "30秒後に自動再起動を行います。" : "自動再起動は行いません。"}`, '#ff0000');
                if (whRestart) {
                    setTimeout(() => {
                        serverList[ws.id].ws.send(JSON.stringify({ type: 'command', command: 'start' }));
                    }, 30000);
                }
            }
        }
        else if (data.type === "commandResponse") {
            dS.sendEmbed(channelLog, data.title, data.message, data.color);
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
            if (command === 'link') {
                if (linkCode[args[1]] === args[2]) {
                    db.readUserList();
                    db.userList.push({ duserid: message.author.id, mcid: args[1] });
                    db.saveUserList();
                    dS.sendEmbed(channelCmd, "リンク完了", `${args[1]} とのリンクが完了しました。`);
                    delete linkCode[args[1]];
                }
                else {
                    dS.sendEmbed(channelCmd, "リンク失敗", "リンクコードが一致しません。以下の形式で入力してください。\n`" + config.prefix + "link <MinecraftID> <リンクコード>`", '#ff0000');
                }
            }
            if (!message.member.roles.cache.has(config.roles.mod)) {
                // reply
                message.reply(`このコマンドは${message.guild.roles.cache.get(config.roles.mod).name}ロールがついているユーザーのみ実行できます。`);
                return;
            }
            if (command === 'start') {
                serverList[args[1]].ws.send(JSON.stringify({ type: 'command', command: 'start' }));
            }
            else if (command === 'stop') {
                serverList[args[1]].ws.send(JSON.stringify({ type: 'command', command: 'stop' }));
            }
            else if (command === 'restart') {
                serverList[args[1]].ws.send(JSON.stringify({ type: 'command', command: 'restart' }));
            }
        }
    }
    else if (message.channel.id === config.channels.chat) {
        const kana = convertToHiragana(messageContent);
        let romaji = "";
        if (messageContent.length > 10 && messageContent.length * 7 > kana.length * 10 && kana.length < 50) {
            const URI = "http://www.google.com/transliterate?";
            const langpair = "ja-Hira|ja";
            const url = URI + "text=" + encodeURIComponent(kana) + "&langpair=" + langpair;
            romaji = await fetch(url)
                .then(response => response.json())
                .then(data => {
                    let result = "";
                    data.forEach(element => {
                        result += element[1][0];
                    });
                    return result;
                });
        }
        // send message to several servers
        for (const serverId in serverList) {
            if (serverList[serverId].ws) {
                serverList[serverId].ws.send(JSON.stringify({
                    type: 'event', event: 'chat',
                    username: message.author.username, message: messageContent, color: message.member.displayHexColor, romaji: romaji
                }));
            }
        }
    }
});

client.login(config.token);
