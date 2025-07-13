const { ActivityType, Client, Collection, EmbedBuilder, Events, GatewayIntentBits } = require('discord.js');
const http = require('http');
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

const isWebSocketOpen = (serverId) => {
    return serverId in serverList && serverList[serverId].ws && serverList[serverId].ws.readyState === WebSocket.OPEN;
};

class RomajiConversion {
    constructor(romaji) {
        this.romaji = romaji;
        this.kana = convertToHiragana(romaji);
        this.probability = this.estimateRomajiProbability();
    }
    estimateRomajiProbability() {
        // Implement the logic to estimate the probability of the romaji being correct
        const lower = this.romaji.toLowerCase();
        const vowels = lower.match(/[aeiou]/g) || [];
        const vowelRatio = vowels.length / lower.length;
        // ローマ字らしい単語・パターン
        const romajiFragments = [
            "shi", "tsu", "chi", "ryo", "kyo", "ryu", "nyu", "sha", "cha", "ja", "fu", "nn", "ou"
        ];
        let romajiPatternHits = 0;
        romajiFragments.forEach(pat => {
            if (lower.includes(pat)) romajiPatternHits++;
        });
        // 英語っぽいワード
        const englishLikeWords = ["the", "and", "you", "with", "this", "that", "test", "hello"];
        let englishPenalty = 0;
        englishLikeWords.forEach(word => {
            if (lower.includes(word)) englishPenalty += 0.3;
        });
        // スコア計算（0〜1.0）
        let score = 0.0;
        score += 0.2; // 英字のみで+0.2
        if (vowelRatio >= 0.3 && vowelRatio <= 0.6) score += 0.2; // 母音比率適正なら+0.2
        score += Math.min(romajiPatternHits * 0.05, 0.3); // パターンごとに+0.05、最大+0.3
        if (lower.includes("nn") || lower.includes("ou")) score += 0.2; // 特殊文字列+0.2
        score -= englishPenalty;
        // 変換後の文字列に英字が含まれていないかチェック
        if (this.kana.match(/[a-zA-Z]/)) {
            score -= 0.2; // 英字が含まれていれば-0.2
        }
        return Math.max(0.0, Math.min(score, 1.0)); // スコアを0.0〜1.0に収める
    }
    async getRomaji() {
        if (this.kana.length < 4 || this.romaji.length * 7 <= this.kana.length * 10 || this.kana.length > 50 || this.probability < 0.3) {
            return ""; // 条件を満たさない場合は空文字を返す
        }
        const url = `http://www.google.com/transliterate?text=${encodeURIComponent(this.kana)}&langpair=ja-Hira|ja`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data.map(item => item[1][0]).join('');
        } catch (err) {
            console.error("Romaji conversion failed:", err);
            return "";
        }
    }
}

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
            console.log("new connection from server: " + data.serverId);
        }
        else if (data.type === "event") {
            if (data.event === "chat") {// minecraft chat
                db.readUserList();
                const id = db.userList.findIndex(user => user.mcid === data.username);
                if (id === -1) {
                    dS.sendEmbed(channelCmd, "エラー", `${data.username} はリンクされていません。`, '#ff0000');
                    ws.send(JSON.stringify({ type: 'event', event: 'cmd', command: `kick ${data.username} You are not linked.` }));
                    return;
                }
                const user = await client.users.fetch(db.userList[id].duserid);
                const message = data.message;
                const romaji = await new RomajiConversion(message).getRomaji();
                const messageStruc = {
                    "username": data.username,
                    "avatar_url": user.displayAvatarURL(),
                    "content": (romaji ? ";" : "") + message,
                };
                dS.sendWebhookToChat(messageStruc);
                if (romaji) {
                    const romajiMessageStruc = {
                        "username": data.username,
                        "avatar_url": user.displayAvatarURL(),
                        "content": romaji,
                    };
                    dS.sendWebhookToChat(romajiMessageStruc);
                }
            }
            else if (data.event === "join") {// minecraft player join
                if (!db.userList.some(user => user.mcid === data.username)) {
                    if (!linkCode[data.username]) {
                        linkCode[data.username] = Math.random().toString(36).slice(-5).replace('l', '1').replace('0', 'o');
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
                statusMessage = onlinePlayers.join(", ");
                if (statusMessage.length === 0) {
                    statusMessage = "no players";
                }
                client.user.setActivity(statusMessage, { type: ActivityType.PLAYING });
                dS.sendEmbed(channelAttendance, "参加通知", `${data.username} が参加しました。`);
            }
            else if (data.event === "leave") {// minecraft player leave
                if (onlinePlayers.includes(data.username)) {
                    onlinePlayers = onlinePlayers.filter(player => player !== data.username);
                    // statusにプレイ中のプレイヤーを表示
                    let statusMessage = "";
                    statusMessage = onlinePlayers.join(", ");
                    if (statusMessage.length === 0) {
                        statusMessage = "no players";
                    }
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
                onlinePlayers = [];
                client.user.setActivity("no players", { type: ActivityType.PLAYING });
            }
            else if (data.event === "shutdown") {// minecraft server shutdown
                dS.sendEmbed(channelCmd, "停止実行通知", `${serverList[ws.id].name} の停止を命令します。`);
            }
            else if (data.event === "restart") {// minecraft server restart
                dS.sendEmbed(channelCmd, "再起動通知", `${serverList[ws.id].name} の再起動を命令します。`);
            }
            else if (data.event === "offline") {// minecraft server offline
                if (onlinePlayers.includes(data.username)) {
                    onlinePlayers = onlinePlayers.filter(player => player !== data.username);
                    // statusにプレイ中のプレイヤーを表示
                    let statusMessage = "";
                    statusMessage = onlinePlayers.join(", ");
                    if (statusMessage.length === 0) {
                        statusMessage = "no players";
                    }
                    client.user.setActivity(statusMessage, { type: ActivityType.PLAYING });
                    dS.sendEmbed(channelAttendance, "退出通知", `${data.username} が退出しました。`);
                }
                dS.sendEmbed(channelCmd, "停止完了通知", `${serverList[ws.id].name} が停止しました。終了コード: ${data.code}`);
                dS.sendEmbed(channelLog, "停止完了通知", `${serverList[ws.id].name} が停止しました。終了コード: ${data.code}`);
                onlinePlayers = [];
                client.user.setActivity("Minecraft offline", { type: ActivityType.PLAYING });
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
                if (args.length === 3 && linkCode[args[1]] !== undefined && linkCode[args[1]] === args[2]) {
                    db.readUserList();
                    db.userList.push({ duserid: message.author.id, mcid: args[1] });
                    db.saveUserList();
                    dS.sendEmbed(channelCmd, "リンク完了", `${args[1]} とのリンクが完了しました。`);
                    delete linkCode[args[1]];
                }
                else {
                    dS.sendEmbed(channelCmd, "リンク失敗", "リンクコードが一致しません。以下の形式で入力してください。\n```" +
                        config.prefix + "link マインクラフトID リンクコード```", '#ff0000');
                }
            }
            else {
                if (!message.member.roles.cache.has(config.roles.mod) && !message.member.roles.cache.has(config.roles.admin)) {
                    // reply
                    message.reply("このコマンドは" + message.guild.roles.cache.get(config.roles.admin).name +
                        "ロールあるいは" + message.guild.roles.cache.get(config.roles.mod).name + "ロールが必要です。");
                    return;
                }
                if (args[1] === undefined || !isWebSocketOpen(args[1])) {
                    message.reply("サーバーが接続されていません。");
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
    }
    else if (message.channel.id === config.channels.chat) {
        const romaji = await new RomajiConversion(messageContent).getRomaji();
        // send message to several servers
        for (const serverId in serverList) {
            if (isWebSocketOpen(serverId)) {
                serverList[serverId].ws.send(JSON.stringify({
                    type: 'event', event: 'chat',
                    username: message.author.username, message: messageContent, color: message.member.displayHexColor, romaji: romaji
                }));
            }
        }
    }
    else if (message.channel.id === config.channels.log) {
        if (message.member.roles.cache.has(config.roles.admin)) {
            const args = messageContent.split(' ');
            if (args[0] === 'cmd') {
                const serverId = args[1];
                const command = args.slice(2).join(' ');
                if (isWebSocketOpen(serverId)) {
                    serverList[serverId].ws.send(JSON.stringify({ type: 'event', event: 'cmd', command: command }));
                    dS.sendEmbed(channelLog, "コマンド実行", `${serverList[serverId].name} にコマンドを実行しました。\n` +
                        `コマンド: ${command}`, baseColor);
                }
                else {
                    message.reply("サーバーが接続されていません。");
                }
            }
        }
    }
});

client.login(config.token);
