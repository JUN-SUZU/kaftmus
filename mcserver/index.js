const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const cron = require('node-cron');
const config = require('./config.json');
const WebSocketClient = new WebSocket('ws://192.168.0.5:25505');

let childMCServer;
let status = 'offline';

WebSocketClient.on('open', () => {
    console.log('Connected to server');
    WebSocketClient.send(JSON.stringify({ type: 'initConnection', serverId: config.serverId }));
});

const logRegularExpressions = {// FIXME: 各種サーバーに対応した正規表現に修正する
    "vanilaLatest": {
        "booted": /Done \(.*s\)! For help, type "help"/, 
        "join": /\[.*\/.*\]: .* joined the game/,
        "left": /\[.*\/.*\]: .* left the game/,
        "chat": /\[.*\/.*\]: <.*> .*/
    },
    "forgeLatest": {
        "booted": /Done \(.*s\)! For help, type "help"/, 
        "join": /\[.*\/.*\]: .* joined the game/,
        "left": /\[.*\/.*\]: .* left the game/,
        "chat": /\[.*\/.*\]: <.*> .*/
    },
    "forge1.12.2": {
        "booted": /Done \(.*s\)! For help, type "help"/, 
        "join": /\[.*\/.*\]: .* joined the game/,
        "left": /\[.*\/.*\]: .* left the game/,
        "chat": /\[.*\/.*\]: <.*> .*/
    },
    "mohist1.12.2": {
        "booted": /Done \(.*s\)! For help, type "help"/, 
        "join": /\[.*\/.*\]: .* joined the game/,
        "left": /\[.*\/.*\]: .* left the game/,
        "chat": /\[.*\/.*\]: <.*> .*/
    },
    "mohist1.16.5": {
        "booted": /Done \(.*s\)! For help, type "help"/, 
        "join": /\[.*\/.*\]: .* joined the game/,
        "left": /\[.*\/.*\]: .* left the game/,
        "chat": /\[.*\/.*\]: <.*> .*/
    },
    "mohist1.21.1": {
        "booted": /Done \(.*s\)! For help, type "help"/, 
        "join": /\[.*\/.*\]: .* joined the game/,
        "left": /\[.*\/.*\]: .* left the game/,
        "chat": /\[.*\/.*\]: <.*> .*/
    }
};

WebSocketClient.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'command') {
        if (data.command === 'start') {
            if (status !== 'offline') {
                WebSocketClient.send(JSON.stringify({ type: 'commandResponse', title: '起動失敗', description: 'サーバーは既に起動しています', color: 'RED' }));
                return;
            }
            childMCServer = spawn('bash', [`${config.serverSHPath}`]);
            status = 'boot';
            WebSocketClient.send(JSON.stringify({ type: 'event', event: 'boot' }));
            childMCServer.stdout.on('data', (data) => {
                const log = data.toString();
                if (log.match(logRegularExpressions[config.serverType].booted)) {
                    status = 'online';
                    WebSocketClient.send(JSON.stringify({ type: 'event', event: 'online' }));
                }
                else if (log.match(logRegularExpressions[config.serverType].join)) {
                    const username = log.match(logRegularExpressions[config.serverType].join)[1];// TODO: ユーザー名を取得する正規表現を修正
                    WebSocketClient.send(JSON.stringify({ type: 'event', event: 'join', username: username }));
                }
                else if (log.match(logRegularExpressions[config.serverType].left)) {
                    const username = log.match(logRegularExpressions[config.serverType].left)[1];// TODO: ユーザー名を取得する正規表現を修正
                    WebSocketClient.send(JSON.stringify({ type: 'event', event: 'leave', username: username }));
                }
                else if (log.match(logRegularExpressions[config.serverType].chat)) {
                    const username = log.match(/\[.*\/.*\]: <(.*)> .*/)[1];// TODO: ユーザー名を取得する正規表現を修正
                    const message = log.match(/\[.*\/.*\]: <.*> (.*)/)[1];// TODO: メッセージを取得する正規表現を修正
                    WebSocketClient.send(JSON.stringify({ type: 'event', event: 'chat', username: username, message: message }));
                }
            });
            childMCServer.on('close', (code) => {
                status = 'offline';
                WebSocketClient.send(JSON.stringify({ type: 'event', event: 'offline', code: code }));
            });
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
    }
});

// 深夜2時にサーバーを停止・バックアップを行い、早朝5時にサーバーを起動する
cron.schedule('0 2 * * *', () => {
    if (status === 'online') {
        childMCServer.stdin.write('stop\n');
        status = 'shutdown';
        WebSocketClient.send(JSON.stringify({ type: 'event', event: 'shutdown' }));
    }
    const backup = spawn('bash', [`${config.backupSHPath}`]);
    backup.on('close', (code) => {
        console.log(`Backup completed with code ${code}`);
    });
});
