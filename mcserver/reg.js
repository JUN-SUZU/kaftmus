const {spawn} = require('child_process');
const fs = require('fs');

const child = spawn('bash', ['run.sh'], { cwd: '/home/jun/forge' });
child.stdout.on('data', (data) => {
    console.log(data.toString());
    fs.appendFileSync('log.txt', data.toString());
});
