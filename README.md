# kaftmus

Minecraft management discord bot.

## File Structure

```bash
tree -n -I "node_modules" . -o file_structure.txt
```

## 起動方法

BOT 側とサーバー側をそれぞれ起動する
再接続はクライアントから cron で 20 秒に一度要求を送る

BOT 側の config.json の serverVersion をサーバー側のバージョンに合わせる
ただし、一致するバージョンがない場合は同じバージョンの java を使用している中で最も近いバージョンを選ぶ

#### /config.json の設定

```json:/config.json
{
    "token": "$DISCORD_BOT_TOKEN",
    "prefix": "$",
    "wsPort": 25560,
    "channels": {
        "chat": "CHANNEL_ID",
        "attendance": "CHANNEL_ID",
        "command": "CHANNEL_ID",
        "log": "CHANNEL_ID"
    },
    "webhooks": {
        "chat": "WEBHOOK_URL_DISCORD_CHANNEL_CHAT",
    },
    "roles": {
        "admin": "ROLE_ID",
        "mod": "ROLE_ID"
    }
}
```

#### /mcserver/config.json の設定

```json:/mcserver/config.json
{
    "wsURL": "ws://127.0.0.1:25560",
    "serverId": "mainServer",
    "name": "Main Server",
    "serverVersion": "forge1.20.1",
    "serverPath": "/home/jun/forge",
    "serverSHPath": "/home/jun/forge/run.sh",
    "backupSHPath": "/home/jun/forge/backup.sh"
}
```
