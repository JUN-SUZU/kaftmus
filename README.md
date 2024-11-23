# kaftmus

Minecraft management discord bot.

## File Structure

```
tree -n -I "node_modules" . -o file_structure.txt
```

## 起動方法

BOT側とサーバー側をそれぞれ起動する
再接続はクライアントからcronで20秒に一度要求を送る

BOT側のconfig.jsonのserverVersionをサーバー側のバージョンに合わせる
ただし、一致するバージョンがない場合は同じバージョンのjavaを使用している中で最も近いバージョンを選ぶ
