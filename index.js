const { ActivityType, Client, Collection, EmbedBuilder, Events, GatewayIntentBits } = require('discord.js');
const WebSocket = require('ws');
const fs = require('fs');
const cron = require('node-cron');
const config = require('./config.json');
const { spawn } = require('child_process');
const convertToHiragana = require('./hiragana.js');
const baseColor = '#ff207d';

let serverList = {};

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
        channelLog = client.channels.cache.get(config.logChannelId);
        channelCmd = client.channels.cache.get(config.commandChannelId);
        channelChat = client.channels.cache.get(config.chatChannelId);
        channelAttendance = client.channels.cache.get(config.attendanceChannelId);
    }

    async sendEmbed(channel, title, description, color = baseColor) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();
        await channel.send({ embeds: [embed] });
    }
}

const dS = new DiscordSender();
