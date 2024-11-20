const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const cron = require('node-cron');
const config = require('./config.json');
const WebSocketClient = new WebSocket('ws://192.168.0.5:25505');

let childMCServer;

WebSocketClient.on('open', () => {
    console.log('Connected to server');
});

WebSocketClient.on('message', (data) => {
    console.log(data);
    const message = JSON.parse(data);
    if (message.type === 'command') {
        switch (message.command) {
            case 'start':
                childMCServer = spawn('java', ['-jar', 'server.jar', 'nogui']);
                childMCServer.stdout.on('data', (data) => {
                    console.log(`stdout: ${data}`);
                });
                childMCServer.stderr.on('data', (data) => {
                    console.error(`stderr: ${data}`);
                });
                childMCServer.on('close', (code) => {
                    console.log(`child process exited with code ${code}`);
                });
                break;
            case 'stop':
                childMCServer.stdin.write('stop\n');
                break;
        }
    }
});

cron.schedule('0 0 * * *', () => {
    WebSocketClient.send('daily cron job');
});
