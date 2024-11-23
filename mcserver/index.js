const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const cron = require('node-cron');
const config = require('./config.json');

let WebSocketClient;
let childMCServer;
let status = 'offline';

const setupWebSocketClient = () => {
    WebSocketClient = new WebSocket('ws://192.168.0.5:25505');
    WebSocketClient.on('open', handleWSCOpen);
    WebSocketClient.on('close', handleWSCClose);
    WebSocketClient.on('message', handleWSCMessage);
}

function handleWSCOpen() {
    console.log('Connected to server');
    WebSocketClient.send(JSON.stringify({ type: 'initConnection', serverId: config.serverId }));
}

function handleWSCClose() {
    console.log('Disconnected from server');
    // 20秒後に再接続を試みる
    setTimeout(() => {
        setupWebSocketClient();
    }, 20000);
}

const logRegularExpressions = {// FIXME: 各種サーバーに対応した正規表現に修正する
    "forge1.7.10": {
        booted: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\]: Done \(\d+\.\d+s\)! For help, type "help" or "\?"/,
        join: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\]: (.+?) joined the game/,
        left: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\]: (.+?) left the game/,
        chat: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\]: <(.+?)> (.+)/
    },
    "forge1.12.2": {
        booted: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/DedicatedServer\]: Done \(\d+\.\d+s\)! For help, type "help" or "\?"/,
        join: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/DedicatedServer\]: (.+?) joined the game/,
        left: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/DedicatedServer\]: (.+?) left the game/,
        chat: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/DedicatedServer\]: <(.+?)> (.+)/
    },
    "forge1.16.5": {
        booted: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/DedicatedServer\]: Done \(\d+\.\d+s\)! For help, type "help"/,
        join: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/DedicatedServer\]: (.+?) joined the game/,
        left: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/DedicatedServer\]: (.+?) left the game/,
        chat: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/DedicatedServer\]: <(.+?)> (.+)/
    },
    "forge1.19.2": {
        booted: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/DedicatedServer\]: Done \(\d+\.\d+s\)! For help, type "help"/,
        join: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/MinecraftServer\]: (.+?) joined the game/,
        left: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/MinecraftServer\]: (.+?) left the game/,
        chat: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/MinecraftServer\]: <(.+?)> (.+)/
    },
    "forge1.20.1": {
        booted: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/DedicatedServer\]: Done \(\d+\.\d+s\)! For help, type "help"/,
        join: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/MinecraftServer\]: (.+?) joined the game/,
        left: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/MinecraftServer\]: (.+?) left the game/,
        chat: /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\] \[minecraft\/MinecraftServer\]: <(.+?)> (.+)/
    },
    "mohist1.7.10": {
        booted: /^\[\d{2}:\d{2}:\d{2} INFO\]: Done \(\d+\.\d+s\)! For help, type "help" or "\?"/,
        join: /^\[\d{2}:\d{2}:\d{2} INFO\]: (.+?)\[\d+\.\d+\.\d+\.\d+:\d+\] logged in with entity id \d+ at \(\[world\] -?\d+\.\d+, \d+\.\d+, -?\d+\.\d+\)/,
        left: /^\[\d{2}:\d{2}:\d{2} INFO\]: (.+?) left the game\./,
        chat: /^\[\d{2}:\d{2}:\d{2} INFO\]: <(.+?)> (.+)/
    },
    "mohist1.12.2": {
        booted: /^\[\d{2}:\d{2}:\d{2} INFO\]: Done \(\d+\.\d+s\)! For help, type "help" or "\?"/,
        join: /^\[\d{2}:\d{2}:\d{2} INFO\]: (.+?)\[\d+\.\d+\.\d+\.\d+:\d+\] logged in with entity id \d+ at \(\[world\]-?\d+\.\d+, \d+\.\d+, -?\d+\.\d+\)/,
        left: /^\[\d{2}:\d{2}:\d{2} INFO\]: §e(.+?) left the game§r/,
        chat: /^\[\d{2}:\d{2}:\d{2} INFO\]: <(.+?)> (.+)/
    },
    "mohist1.16.5": {
        booted: /^\[\d{2}:\d{2}:\d{2} INFO]: Done \(\d+\.\d+s\)! For help, type "help"/,
        join: /^\[\d{2}:\d{2}:\d{2} INFO]: (.+?)\[\d+\.\d+\.\d+\.\d+:\d+\] logged in with entity id \d+ at \(-?\d+\.\d+, \d+, -?\d+\.\d+\)/,
        left: /^\[\d{2}:\d{2}:\d{2} INFO]: (.+?) left the game/,
        chat: /^\[\d{2}:\d{2}:\d{2} INFO]: <(.+?)> (.+)/
    },
    "mohist1.19.2": {
        booted: /^\[\d{2}:\d{2}:\d{2} INFO]: Done \(\d+\.\d+s\)! For help, type "help"/,
        join: /^\[\d{2}:\d{2}:\d{2} INFO]: (.+?) joined the game/,
        left: /^\[\d{2}:\d{2}:\d{2} INFO]: (.+?) left the game/,
        chat: /^\[\d{2}:\d{2}:\d{2} INFO]: <(.+?)> (.+)/
    },
    "mohist1.20.1": {
        booted: /^\[\d{2}:\d{2}:\d{2} INFO]: Done \(\d+\.\d+s\)! For help, type "help"/,
        join: /^\[\d{2}:\d{2}:\d{2} INFO]: (.+?) joined the game/,
        left: /^\[\d{2}:\d{2}:\d{2} INFO]: (.+?) left the game/,
        chat: /^\[\d{2}:\d{2}:\d{2} INFO]: <(.+?)> (.+)/
    }
};

function bootMCServer() {
    // cd config.serverPath && bash config.serverSHPath
    childMCServer = spawn('bash', [`${config.serverSHPath}`], { cwd: `${config.serverPath}` });
    status = 'boot';
    WebSocketClient.send(JSON.stringify({ type: 'event', event: 'boot' }));
    childMCServer.stdout.on('data', (data) => {
        const log = data.toString();
        const lREthisServer = logRegularExpressions[config.serverVersion];
        if (log.match(lREthisServer.booted)) {
            status = 'online';
            WebSocketClient.send(JSON.stringify({ type: 'event', event: 'online', spentTime: log.match(lREthisServer.booted)[1] }));
        }
        else if (log.match(lREthisServer.join)) {
            const username = log.match(lREthisServer.join)[1];
            WebSocketClient.send(JSON.stringify({ type: 'event', event: 'join', username: username }));
        }
        else if (log.match(lREthisServer.left)) {
            const username = log.match(lREthisServer.left)[1];
            WebSocketClient.send(JSON.stringify({ type: 'event', event: 'leave', username: username }));
        }
        else if (log.match(lREthisServer.chat)) {
            const username = log.match(lREthisServer.chat)[1];
            const message = log.match(lREthisServer.chat)[2];
            WebSocketClient.send(JSON.stringify({ type: 'event', event: 'chat', username: username, message: message }));
        }
    });
    childMCServer.on('close', (code) => {
        if (status === 'restarting') {
            bootMCServer();
            return;
        }
        status = 'offline';
        if (status === 'shutdown') {
            WebSocketClient.send(JSON.stringify({ type: 'event', event: 'offline', code: code, color: 'GREEN' }));
        }
        else {
            WebSocketClient.send(JSON.stringify({ type: 'event', event: 'crash', code: code, color: 'RED' }));
        }
    });
}

function handleWSCMessage(message) {
    const data = JSON.parse(message);
    if (data.type === 'command') {
        if (data.command === 'start') {
            if (status !== 'offline') {
                WebSocketClient.send(JSON.stringify({ type: 'commandResponse', title: '起動失敗', description: 'サーバーは既に起動しています', color: 'RED' }));
                return;
            }
            bootMCServer();
        }
        else if (data.command === 'stop') {
            if (status !== 'online') {
                WebSocketClient.send(JSON.stringify({ type: 'commandResponse', title: '停止失敗', description: 'サーバーは起動していません', color: 'RED' }));
                return;
            }
            childMCServer.stdin.write('stop\n');
            status = 'shutdown';
            WebSocketClient.send(JSON.stringify({ type: 'event', event: 'shutdown' }));
        }
        else if (data.command === 'restart') {
            if (status !== 'online') {
                WebSocketClient.send(JSON.stringify({ type: 'commandResponse', title: '再起動失敗', description: 'サーバーは起動していません', color: 'RED' }));
                return;
            }
            childMCServer.stdin.write('stop\n');
            childMCServer.stdin.end();
            status = 'restarting';
            WebSocketClient.send(JSON.stringify({ type: 'event', event: 'restart' }));
        }
    }
    else if (data.type === 'event') {
        if (data.event === 'link') {
            childMCServer.stdin.write(`kick ${data.username} Discordアカウントと紐づけする必要があります。\nコマンドチャンネルで\`${data.prefix}link ${data.username} ${data.code}\`を実行してください。\n`);
        }
        else if (data.event === 'chat') {
            childMCServer.stdin.write(`tellraw @a {"text":"<${data.username}> ${data.message}","color":"${data.color}"}`);
        }
    }
}

// 深夜2時にサーバーを停止・バックアップを行い、早朝5時にサーバーを起動する
cron.schedule('0 2 * * *', () => {
    if (status === 'online') {
        childMCServer.stdin.write('stop\n');
        status = 'shutdown';
        WebSocketClient.send(JSON.stringify({ type: 'event', event: 'shutdown' }));
    }
    const backup = () => {
        if (status === 'offline') {
            const backup = spawn('bash', [`${config.backupSHPath}`], { cwd: `${config.serverPath}` });
            backup.on('close', (code) => {
                console.log(`Backup completed with code ${code}`);
            });
        }
        else {
            setTimeout(backup, 1000);
        }
    }
    backup();
});

cron.schedule('0 5 * * *', () => {
    if (status === 'offline') {
        bootMCServer();
    }
});

setupWebSocketClient();
